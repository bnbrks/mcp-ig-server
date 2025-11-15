import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server";
import { HttpServerTransport } from "@modelcontextprotocol/sdk/server/transports/http";
import IGClientV3 from "./igClient.js";
import stringSimilarity from "string-similarity";

dotenv.config();

const PORT = process.env.PORT || 3000;

const ig = new IGClientV3();
let pendingTrades = [];

const server = new Server({
  name: "ig-mcp-v3",
  version: "1.1.0"
});

// Add HTTP Transport
const httpTransport = new HttpServerTransport({
  port: PORT,
  path: "/mcp"
});

server.addTransport(httpTransport);

// Tools
server.tool("ig.getPositions", {
  execute: async () => ig.getPositions()
});

server.tool("ig.getPrice", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => ig.getPrice(input)
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
    ig.getHistorical(input.epic, input.resolution, input.range)
});

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
    return { message: `Stored ${input.length} pending trades.` };
  }
});

server.tool("ig.listPendingTrades", {
  execute: async () => pendingTrades
});

server.tool("ig.confirmTrades", {
  inputSchema: { type: "string" },
  execute: async ({ input }) => {
    if (!pendingTrades.length)
      return { message: "No pending trades." };

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

server.tool("ig.clearPendingTrades", {
  execute: async () => {
    pendingTrades = [];
    return { message: "Cleared." };
  }
});

server.start();
console.log("IG MCP v3 HTTP server running on port", PORT);
