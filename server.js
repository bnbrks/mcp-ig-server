// ----------------------------
// MCP IG SERVER (patched)
// ----------------------------

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/transports/sse";
import { Server as WebSocketServer } from "ws";
import { IGClient } from "./igClient.js";   
import { MCPServer } from "@modelcontextprotocol/sdk/server/index.js";

// Shared Secret Authentication
const EXPECTED_SECRET = process.env.MCP_SHARED_SECRET;

function validateSecret(headers) {
    const provided = headers["x-mcp-secret"];
    if (!provided || provided !== EXPECTED_SECRET) {
        console.error("❌ Unauthorized MCP connection attempt");
        return false;
    }
    return true;
}

// Express App Setup
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 8080;

// MCP Server Setup
const mcp = new MCPServer({
    name: "ig-mcp-server",
    version: "1.0.0"
});

// Example handlers
mcp.setRequestHandler("ping", async () => {
    return { result: "pong" };
});

mcp.setRequestHandler("get_markets", async ({ params }) => {
    const ig = new IGClient();
    return await ig.getMarkets(params.searchTerm);
});

mcp.setRequestHandler("place_trade", async ({ params }) => {
    const ig = new IGClient();
    return await ig.placeTrade(params);
});

// SSE Endpoint
app.get("/mcp", (req, res) => {
    if (!validateSecret(req.headers)) {
        res.status(401).send("Unauthorized");
        return;
    }
    const transport = new SSEServerTransport({ req, res });
    mcp.connect(transport);
    console.log("✅ SSE client connected");
});

// Optional WebSocket Support
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    if (!validateSecret(req.headers)) {
        console.log("❌ WS unauthorized");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
    }
    if (req.url === "/mcp") {
        wss.handleUpgrade(req, socket, head, (ws) => {
            mcp.connectWebSocket(ws);
            console.log("🔄 WebSocket client connected");
        });
    }
});

// Root
app.get("/", (_, res) => {
    res.send("IG MCP Server running. Use /mcp to connect.");
});

// Start
server.listen(PORT, () => {
    console.log(`🚀 IG MCP Server running on port ${PORT}`);
});
