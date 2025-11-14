import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server";
import IGClientV3 from "./igClient.js";
import stringSimilarity from "string-similarity";

dotenv.config();

const ig = new IGClientV3();
let pendingTrades = [];

const server = new Server({
  name: "ig-mcp-v3",
  version: "1.0.0"
});

// GET POSITIONS
server.tool("ig.getPositions", {
  execute: async () => ig.getPositions()
});

// SIMPLE PRICE
server.tool("ig.getPrice", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => ig.getPrice(input)
});

// SIMPLE HISTORICAL (range)
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
    ig.getHistorical(input.epic, input.resolution, input.range)
});

// ADVANCED RANGE HISTORICAL
server.tool("ig.getHistoricalRange", {
  inputSchema: {
    type: "object",
    properties: {
      epic: { type: "string" },
      resolution: { type: "string" },
      from: { type: "string" },
      to: { type: "string" }
    }
  },
  execute: async ({ input }) =>
    ig.getHistoricalRange(input.epic, input.resolution, input.from, input.to)
});

// STORE PENDING TRADES
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

// LIST PENDING TRADES
server.tool("ig.listPendingTrades", {
  execute: async () => pendingTrades
});

// CONFIRM TRADES
server.tool("ig.confirmTrades", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => {
    if (!pendingTrades.length)
      return { message: "No pending trades." };

    const txt = input.toLowerCase();

    if (txt.includes("all")) {
      const results = [];
      for (const t of pendingTrades) {
        const res = await ig.openPosition({
          epic: t.epic,
          direction: t.direction,
          size: t.size,
          orderType: "MARKET"
        });
        results.push(res);
      }
      pendingTrades = [];
      return { message: "All trades executed.", results };
    }

    const labels = pendingTrades.map(t =>
      t.label || `${t.direction} ${t.epic}`.toUpperCase()
    );

    const match = stringSimilarity.findBestMatch(input.toUpperCase(), labels);
    if (match.bestMatch.rating < 0.3)
      return { message: "No match found." };

    const i = match.bestMatchIndex;
    const t = pendingTrades[i];

    const result = await ig.openPosition({
      epic: t.epic,
      direction: t.direction,
      size: t.size,
      orderType: "MARKET"
    });

    pendingTrades.splice(i, 1);

    return { message: "Trade executed.", result };
  }
});

// CLEAR
server.tool("ig.clearPendingTrades", {
  execute: async () => {
    pendingTrades = [];
    return { message: "Cleared." };
  }
});

server.start();
console.log("IG MCP v3 server running...");
