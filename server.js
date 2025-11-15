import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { IGClient } from "./igClient.js";
import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 3000;

// Create MCP server
const mcpServer = new Server({
  name: "ig-mcp-v3-ws",
  version: "1.0.0"
});

// IG client
const ig = new IGClient(
  process.env.IG_API_KEY,
  process.env.IG_IDENTIFIER,
  process.env.IG_PASSWORD,
  process.env.IG_API_URL || "https://api.ig.com/gateway/deal"
);

// Methods
mcpServer.addMethod("ig.getHistorical", async ({ params }) => {
  return ig.getHistorical(params.epic, params.resolution, params.max || 100);
});

mcpServer.addMethod("ig.getHistoricalRange", async ({ params }) => {
  return ig.getHistoricalRange(params.epic, params.resolution, params.from, params.to);
});

mcpServer.addMethod("ig.placeTrade", async ({ params }) => {
  return ig.placeTrade(params);
});

// HTTP server needed for WS upgrade
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/mcp") {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket → MCP bridge
wss.on("connection", (ws) => {
  ws.on("message", async (msg) => {
    try {
      const request = JSON.parse(msg.toString());
      const response = await mcpServer.receive(request);
      if (response) ws.send(JSON.stringify(response));
    } catch (err) {
      console.error("Error handling MCP message:", err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`MCP WS server running on ws://localhost:${PORT}/mcp`);
});
