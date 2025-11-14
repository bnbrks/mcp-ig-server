import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server";
import IG from "ig-markets-api";
import stringSimilarity from "string-similarity";

dotenv.config();

const ig = new IG({
  apiKey: process.env.IG_API_KEY,
  identifier: process.env.IG_USERNAME,
  password: process.env.IG_PASSWORD,
  accountId: process.env.IG_ACCOUNT_ID,
  isDemo: false
});

let pendingTrades = [];

const server = new Server({
  name: "ig-mcp-server",
  version: "1.0.0",
});

server.tool("ig.getPositions", {
  execute: async () => ig.positions.all()
});

server.tool("ig.getPrice", {
  inputSchema: { type: "string" },
  execute: async ({ input }) =>
    ig.prices(input, { resolution: "MINUTE" })
});

server.tool("ig.getHistorical", {
  inputSchema: {
    type: "object",
    properties: {
      epic: { type: "string" },
      resolution: { type: "string" },
      range: { type: "number" }
    }
  },
  execute: async ({ input }) =>
    ig.prices(input.epic, {
      resolution: input.resolution,
      max: input.range
    })
});

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
      }
    }
  },
  execute: async ({ input }) => {
    pendingTrades = input;
    return { message: `Stored ${input.length} trades.` };
  }
});

server.tool("ig.listPendingTrades", { execute: () => pendingTrades });

server.tool("ig.confirmTrades", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => {
    if (!pendingTrades.length)
      return { message: "No pending trades." };

    const text = input.toLowerCase();

    if (text.includes("all")) {
      const results = [];
      for (const t of pendingTrades) {
        const res = await ig.positions.create({
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

    const labels = pendingTrades.map(t =>
      t.label ||
      `${t.direction} ${t.epic}`.replace("CS.D.", "").toUpperCase()
    );

    const match = stringSimilarity.findBestMatch(
      input.toUpperCase(),
      labels
    );

    if (match.bestMatch.rating < 0.3)
      return { message: "No close match." };

    const index = match.bestMatchIndex;
    const t = pendingTrades[index];

    const result = await ig.positions.create({
      epic: t.epic,
      direction: t.direction,
      size: t.size,
      orderType: "MARKET"
    });

    pendingTrades.splice(index, 1);
    return { message: "Trade executed.", result };
  }
});

server.tool("ig.clearPendingTrades", {
  execute: () => {
    pendingTrades = [];
    return { message: "Cleared." };
  }
});

server.start();
