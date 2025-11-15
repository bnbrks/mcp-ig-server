import express from "express";
import { MCPServer } from "@modelcontextprotocol/sdk/server/index.js";
import { IGClient } from "./igClient.js";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.MCP_SHARED_SECRET;

const app = express();

// ----- Auth -----
function checkAuth(req, res) {
  if (!SECRET) return true;
  const provided = req.headers["x-mcp-secret"];
  if (provided !== SECRET) {
    res.writeHead(401);
    res.end("Unauthorized");
    return false;
  }
  return true;
}

// ----- MCP server -----
const mcp = new MCPServer({ name: "ig-mcp-sse", version: "1.0.0" });

mcp.setRequestHandler("ping", async () => ({ pong: true }));

mcp.setRequestHandler("ig.getMarkets", async ({ params }) => {
  const ig = new IGClient();
  return await ig.getMarkets(params.searchTerm);
});

mcp.setRequestHandler("ig.placeTrade", async ({ params }) => {
  const ig = new IGClient();
  return await ig.placeTrade(params);
});

// ----- SSE Endpoint -----
app.get("/mcp", (req, res) => {
  if (!checkAuth(req, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const transport = {
    send: msg => res.write(`data: ${JSON.stringify(msg)}

`),
    close: () => res.end()
  };

  mcp.connect(transport);

  req.on("close", () => transport.close());
});

app.get("/", (_, res) => res.send("IG MCP SSE server running."));

app.listen(PORT, () => console.log("SSE MCP running on", PORT));
