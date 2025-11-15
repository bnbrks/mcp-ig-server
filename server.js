import express from "express";
import { createMCPServer } from "@modelcontextprotocol/sdk/server";
import { SseTransport } from "@modelcontextprotocol/sdk/server/transports/sse.js";
import IGClient from "./igClient.js";

const app = express();
const port = process.env.PORT || 8080;

const REQUIRED_SECRET = process.env.MCP_SHARED_SECRET;

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized (missing Bearer token)" });
  }
  const token = auth.split(" ")[1];
  if (token !== REQUIRED_SECRET) {
    return res.status(401).json({ error: "Unauthorized (invalid token)" });
  }
  next();
}

const server = createMCPServer({
  name: "ig-mcp-server",
  version: "1.0.0",
  description: "IG Trading MCP Server"
});

const ig = new IGClient({
  apiKey: process.env.IG_API_KEY,
  identifier: process.env.IG_IDENTIFIER,
  password: process.env.IG_PASSWORD,
  accountId: process.env.IG_ACCOUNT_ID,
  useDemo: process.env.IG_USE_DEMO === "true"
});

server.tool("ig_get_historical", {
  description: "Get IG historical price data",
  input: { epic: "string", resolution: "string", max: "number" },
  execute: async ({ epic, resolution, max }) => {
    const data = await ig.getHistoricalPrices(epic, resolution, max);
    return { data };
  }
});

app.use("/mcp", authMiddleware, (req, res) => {
  const transport = new SseTransport({ req, res });
  server.connect(transport);
});

app.get("/", (req, res) => res.send("IG MCP Server running"));

app.listen(port, () => console.log(`MCP SSE server running on ${port}`));
