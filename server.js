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
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID;
const IG_API_URL = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";
// --------------------------------------------

let CST = null;
let XST = null;

// ------------------- IG LOGIN (Version 2) ----------------------
async function igLogin() {
  console.log("Performing IG login (Version 2)…");

  const res = await fetch(`${IG_API_URL}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json; charset=UTF-8",
      "X-IG-API-KEY": IG_API_KEY,
      "Version": "2"   // LOGIN MUST USE VERSION 2
    },
    body: JSON.stringify({
      identifier: IG_IDENTIFIER,
      password: IG_PASSWORD
    })
  });

  const json = await res.json();

  if (!res.ok) {
    console.log("IG Login Failed:", json);
    throw new Error(`IG login failed: ${res.status} | ${JSON.stringify(json)}`);
  }

  CST = res.headers.get("CST");
  XST = res.headers.get("X-SECURITY-TOKEN");

  console.log("IG Login Success. CST/XST updated.");
  return { CST, XST };
}
// --------------------------------------------------------------


// ------- IG HEADERS WITH VERSION SELECTION PER ENDPOINT --------
async function igHeaders(endpointType = "trade") {
  if (!CST || !XST) {
    await igLogin();
  }

  let version;

  switch (endpointType) {
    case "login":
      version = "2"; break;
    case "market":
    case "price":
      version = "1"; break;  // MARKET DATA USES VERSION 1
    case "trade":
    default:
      version = "3"; break;  // POSITIONS & TRADES USE VERSION 3
  }

  return {
    "Content-Type": "application/json",
    "Accept": "application/json; charset=UTF-8",
    "X-IG-API-KEY": IG_API_KEY,
    CST,
    "X-SECURITY-TOKEN": XST,
    "X-IG-ACCOUNT-ID": IG_ACCOUNT_ID,
    "Version": version
  };
}
// --------------------------------------------------------------


// ---------------- IG REQUEST WRAPPER --------------------------
async function igRequest(path, options = {}) {
  const endpointType = options.endpointType || "trade";
  const url = IG_API_URL + path;

  // Initial request
  let res = await fetch(url, {
    method: options.method || "GET",
    headers: await igHeaders(endpointType),
    body: options.body || null
  });

  let json;
  try { json = await res.json(); } catch { json = {}; }

  // Auto-refresh login on invalid token
  if (json.errorCode === "error.security.client-token-invalid") {
    console.log("Token invalid — refreshing CST/XST with login…");

    await igLogin();

    res = await fetch(url, {
      method: options.method || "GET",
      headers: await igHeaders(endpointType),
      body: options.body || null
    });

    try { json = await res.json(); } catch { json = {}; }
  }

  return json;
}
// --------------------------------------------------------------


// ----------------- IG METHODS --------------------------------
const IG = {
  getMarkets(epic) {
    return igRequest(`/markets/${epic}`, {
      endpointType: "market"
    });
  },

  getPrices(epic, resolution, max = 10) {
    return igRequest(
      `/prices/${epic}?resolution=${resolution}&max=${max}`,
      { endpointType: "price" }
    );
  },

  getPositions() {
    return igRequest(`/positions`, { endpointType: "trade" });
  },

  openPosition(body) {
    return igRequest(`/positions/otc`, {
      method: "POST",
      body: JSON.stringify(body),
      endpointType: "trade"
    });
  },

  closePosition(dealId) {
    return igRequest(`/positions/otc`, {
      method: "POST",
      body: JSON.stringify({
        dealId,
        direction: "SELL",
        size: 1
      }),
      endpointType: "trade"
    });
  }
};
// --------------------------------------------------------------


// ---------------- JSON-RPC HANDLER ----------------------------
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
// --------------------------------------------------------------


// ------------------- AUTH MIDDLEWARE --------------------------
function checkAuth(req, res) {
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${AUTH}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
// --------------------------------------------------------------


// -------------------- POST /rpc -------------------------------
app.post("/rpc", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const rpc = req.body;
  const response = await handleRPC(rpc);
  res.json(response);
});
// --------------------------------------------------------------


// ---------------- SSE /mcp ------------------------------------
app.get("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

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
// --------------------------------------------------------------


// -------------------- START SERVER ----------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Hybrid MCP server running on port", PORT);
});