import express from "express";
import cors from "cors";
import { createSseStream, MCPServer } from "@modelcontextprotocol/sdk/server/sse.js";

const INTERNAL_MCP_PATH = "/mcp";
const PUBLIC_BRIDGE_PATH = "/public-mcp";

const IG_API_KEY = process.env.IG_API_KEY;
const IG_API_IDENTIFIER = process.env.IG_API_IDENTIFIER;
const IG_API_PASSWORD = process.env.IG_API_PASSWORD;
const SHARED_SECRET = process.env.SHARED_SECRET || "potato";

const app = express();
app.use(cors());
app.use(express.json());

const mcpServer = new MCPServer({
  name: "ig-mcp",
});

mcpServer.tool("ping", {
  description: "Basic connectivity check",
  execute: async () => ({ ok: true, timestamp: Date.now() })
});

app.get(INTERNAL_MCP_PATH, async (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  const token = auth.substring(7);

  if (token !== SHARED_SECRET) {
    return res.status(403).json({ error: "Invalid Bearer token" });
  }

  const stream = createSseStream(mcpServer);
  stream.handleRequest(req, res);
});

app.get(PUBLIC_BRIDGE_PATH, async (req, res) => {
  req.headers.authorization = `Bearer ${SHARED_SECRET}`;
  const stream = createSseStream(mcpServer);
  stream.handleRequest(req, res);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
});
