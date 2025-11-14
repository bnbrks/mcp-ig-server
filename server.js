import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server";
import IGClient from "ig-markets-api-node";
import stringSimilarity from "string-similarity";

dotenv.config();

// ---------------- IG CLIENT ----------------

const ig = new IGClient({
  username: process.env.IG_USERNAME,
  password: process.env.IG_PASSWORD,
  apiKey: process.env.IG_API_KEY,
  accountId: process.env.IG_ACCOUNT_ID,
  isDemo: false,
  baseUrl: process.env.IG_BASE_URL || "https://api.ig.com/gateway/deal"
});

// ---------------- MCP SERVER ----------------

const server = new Server({
  name: "ig-mcp-server",
  version: "1.0.0"
});

let pendingTrades = [];

// ---------- BASIC IG TOOLS ----------

server.tool("ig.getPositions", {
  description: "List open positions",
  execute: async () => ig.positions.get()
});

server.tool("ig.getPrice", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => ig.prices.get(input)
});

server.tool("ig.getHistorical", {
  inputSchema: {
    type: "object",
    properties: {
      epic: { type: "string" },
      resolution: { type: "string" },
      max: { type: "number" }
    }
  },
  execute: async ({ input }) =>
    ig.prices.get(input.epic, { resolution: input.resolution, max: input.max })
});

// ---------- PENDING TRADES ----------

server.tool("ig.setPendingTrades", {
  inputSchema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        epic: { type: "string" },
        direction: { type: "string" },
        size: { type: "number" },
        stopDistance: { type: "number" },
        limitDistance: { type: "number" },
        label: { type: "string" }
      },
      required: ["epic", "direction", "size"]
    }
  },
  execute: async ({ input }) => {
    pendingTrades = input;
    return { message: `Stored ${input.length} pending trades.` };
  }
});

server.tool("ig.listPendingTrades", {
  execute: async () => pendingTrades
});

// ---------- CONFIRM TRADES ----------

server.tool("ig.confirmTrades", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => {
    if (!pendingTrades.length)
      return { message: "No pending trades." };

    const txt = input.toLowerCase();

    // Confirm all trades
    if (txt.includes("all")) {
      const results = [];

      for (const t of pendingTrades) {
        const res = await ig.positions.open({
          epic: t.epic,
          direction: t.direction,
          size: t.size,
          orderType: "MARKET",
          stopDistance: t.stopDistance,
          limitDistance: t.limitDistance
        });
        results.push(res);
      }

      pendingTrades = [];
      return { message: "All trades executed.", results };
    }

    // Match individual label
    const labels = pendingTrades.map(t =>
      t.label || `${t.direction} ${t.epic}`.toUpperCase()
    );

    const match = stringSimilarity.findBestMatch(input.toUpperCase(), labels);

    if (match.bestMatch.rating < 0.3)
      return { message: "Could not match confirmation text." };

    const index = match.bestMatchIndex;
    const t = pendingTrades[index];

    const result = await ig.positions.open({
      epic: t.epic,
      direction: t.direction,
      size: t.size,
      orderType: "MARKET"
    });

    pendingTrades.splice(index, 1);

    return { message: "Trade executed.", result };
  }
});

// ---------- CLEAR ----------

server.tool("ig.clearPendingTrades", {
  execute: async () => {
    pendingTrades = [];
    return { message: "Pending trades cleared." };
  }
});

// ---------- START ----------

server.start();
console.log("IG MCP Server running via Docker...");
