import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- SECURITY -----------------
if (!process.env.MCP_AUTH_TOKEN) {
  throw new Error("FATAL: MCP_AUTH_TOKEN environment variable is missing.");
}
const AUTH = process.env.MCP_AUTH_TOKEN;
// --------------------------------------------

// ---------------- IG VARIABLES --------------
const IG_API_KEY = process.env.IG_API_KEY;
const IG_IDENTIFIER = process.env.IG_IDENTIFIER;
const IG_PASSWORD = process.env.IG_PASSWORD;
const IG_API_URL = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";
// --------------------------------------------

let CST = null;
let XST = null;

// --------------- IG LOGIN ------------------
async function igLogin() {
  const res = await fetch(IG_API_URL + "/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-IG-API-KEY": IG_API_KEY
    },
    body: JSON.stringify({
      identifier: IG_IDENTIFIER,
      password: IG_PASSWORD
    })
  });

  CST = res.headers.get("CST");
  XST = res.headers.get("X-SECURITY-TOKEN");

  if (!res.ok) throw new Error("IG login failed: " + res.status);

  return { CST, XST };
}
// --------------------------------------------

// Retrieve headers with refreshed tokens if needed
async function igHeaders() {
  if (!CST || !XST) await igLogin();

  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-IG-API-KEY": IG_API_KEY,
    CST,
    "X-SECURITY-TOKEN": XST
  };
}

// --------------- IG METHODS ------------------
const IG = {
  async getMarkets(epic) {
    const res = await fetch(`${IG_API_URL}/markets/${epic}`, {
      headers: await igHeaders()
    });
    return res.json();
  },

  async getPrices(epic, resolution, max = 10) {
    const res = await fetch(
      `${IG_API_URL}/prices/${epic}?resolution=${resolution}&max=${max}`,
      { headers: await igHeaders() }
    );
    return res.json();
  },

  async getPositions() {
    const res = await fetch(`${IG_API_URL}/positions`, {
      headers: await igHeaders()
    });
    return res.json();
  },

  async openPosition(body) {
    const res = await fetch(`${IG_API_URL}/positions/otc`, {
      method: "POST",
      headers: await igHeaders(),
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async closePosition(dealId) {
    const res = await fetch(`${IG_API_URL}/positions/otc`, {
      method: "POST",
      headers: await igHeaders(),
      body: JSON.stringify({
        dealId,
        direction: "SELL",
        size: 1
      })
    });
    return res.json();
  }
};
// --------------------------------------------

// --------------- JSON-RPC HANDLER -----------
async function handleRPC({ id, method, params }) {
  try {
    switch (method) {
      case "ping":
        return { id, result: { pong: true } };

      case "ig.login":
        return { id, result: await igLogin() };

      case "ig.getMarkets":
        return { id, result: await IG.getMarkets(params.epic) };

      case "ig.getPrices":
        return {
          id,
          result: await IG.getPrices(params.epic, params.resolution, params.max)
        };

      case "ig.getPositions":
        return { id, result: await IG.getPositions() };

      case "ig.openPosition":
        return { id, result: await IG.openPosition(params) };

      case "ig.closePosition":
        return { id, result: await IG.closePosition(params.dealId) };

      default:
        return { id, error: "Unknown method" };
    }
  } catch (err) {
    return { id, error: err.toString() };
  }
}
// --------------------------------------------

// -------------- AUTH MIDDLEWARE -------------
function checkAuth(req, res) {
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${AUTH}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
// --------------------------------------------

// ----------------- POST /rpc ----------------
app.post("/rpc", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const rpc = req.body;
  const response = await handleRPC(rpc);
  res.json(response);
});
// --------------------------------------------

// ----------------- SSE /mcp -----------------
app.get("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  // Notify client that connection is ready
  res.write(
    "data: " +
      JSON.stringify({ jsonrpc: "2.0", method: "ready" }) +
      "\n\n"
  );

  req.on("data", async chunk => {
    try {
      const rpc = JSON.parse(chunk.toString());
      const response = await handleRPC(rpc);
      res.write("data: " + JSON.stringify(response) + "\n\n");
    } catch {
      res.write('data: {"error":"Invalid JSON"}\n\n');
    }
  });

  req.on("close", () => res.end());
});
// --------------------------------------------

// ----------------- PORT FIX -----------------
const PORT = process.env.PORT || 8080;
// --------------------------------------------

app.listen(PORT, () => {
  console.log("Hybrid MCP server running on", PORT);
});