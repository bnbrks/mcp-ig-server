import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/transports/ws.js";
import { IGClient } from "./igClient.js";

const PORT = process.env.PORT || 3000;

const server = new Server({
  name: "ig-mcp-v3-ws",
  version: "1.0.0"
});

// IG Client
const ig = new IGClient(
  process.env.IG_API_KEY,
  process.env.IG_IDENTIFIER,
  process.env.IG_PASSWORD,
  process.env.IG_API_URL || "https://api.ig.com/gateway/deal"
);

// MCP Methods
server.addMethod("ig.getHistorical", async ({ params }) => {
  return ig.getHistorical(params.epic, params.resolution, params.max || 100);
});

server.addMethod("ig.getHistoricalRange", async ({ params }) => {
  return ig.getHistoricalRange(params.epic, params.resolution, params.from, params.to);
});

server.addMethod("ig.placeTrade", async ({ params }) => {
  return ig.placeTrade(params);
});

// WebSocket Transport
const wsTransport = new WebSocketServerTransport({
  port: PORT,
  path: "/mcp"
});

server.addTransport(wsTransport);

server.on("error", (err) => {
  console.error("MCP server error:", err);
});

await server.start();
console.log(`MCP WebSocket MCP server running on port ${PORT} at ws://localhost:${PORT}/mcp`);
