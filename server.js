import express from "express";
import cors from "cors";
import IGClient from "./igClient.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.MCP_SHARED_SECRET || "potato";

function checkAuth(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    res.writeHead(401); res.end("Unauthorized"); return false;
  }
  if (auth.substring(7) !== SHARED_SECRET) {
    res.writeHead(403); res.end("Forbidden"); return false;
  }
  return true;
}

app.get("/mcp", (req, res) => {
  if (!checkAuth(req, res)) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache", Connection: "keep-alive"
  });

  req.on("data", async chunk => handleRPC(chunk, res));
  req.on("close", () => res.end());
});

app.get("/public-mcp", (req, res) => {
  req.headers.authorization = "Bearer " + SHARED_SECRET;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache", Connection: "keep-alive"
  });

  req.on("data", async chunk => handleRPC(chunk, res));
  req.on("close", () => res.end());
});

async function handleRPC(chunk, res) {
  try {
    const { id, method, params } = JSON.parse(chunk.toString());
    const ig = new IGClient();

    function send(resp) {
      res.write("data: " + JSON.stringify(resp) + "\n\n");
    }

    try {
      switch (method) {
        case "ping": return send({ id, result: { pong: true }});
        case "getMarketDetails": return send({ id, result: await ig.getMarketDetails(params.epic) });
        case "getHistoricalPrices": return send({ id, result: await ig.getHistoricalPrices(params.epic, params.resolution, params.max) });
        case "placeOrder": return send({ id, result: await ig.placeOrder(params) });
        case "getPositions": return send({ id, result: await ig.getPositions() });
        case "getAccountSummary": return send({ id, result: await ig.getAccountSummary() });
        case "closePosition": return send({ id, result: await ig.closePosition(params.dealId) });
        default: return send({ id, error: "Unknown method" });
      }
    } catch(e) {
      return send({ id, error: e.toString() });
    }
  } catch {
    res.write("data: {"error":"Invalid JSON"}\n\n");
  }
}

app.listen(PORT, ()=>console.log("MCP server running on",PORT));
