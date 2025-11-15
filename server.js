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
const IG_IDENTIFIER = process.env.IG_IDENTIFIER;   // username
const IG_PASSWORD = process.env.IG_PASSWORD;
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID;   // spreadbet / CFD account
const IG_API_URL = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";

let CST = null;
let XST = null;
// --------------------------------------------

// --------------- IG LOGIN ------------------
async function igLogin() {
  console.log("Performing IG login…");

  const res = await fetch(IG_API_URL + "/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json; charset=UTF-8",
      "X-IG-API-KEY": IG_API_KEY,
      "Version": "2"
    },
    body: JSON.stringify({
      identifier: IG_IDENTIFIER,
      password: IG_PASSWORD
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("IG login failed: " + res.status + " | " + text);
  }

  CST = res.headers.get("CST");
  XST = res.headers.get("X-SECURITY-TOKEN");

  console.log("IG login successful, CST/XST refreshed.");
  return { CST, XST };
}
// --------------------------------------------

// -------------- IG REQUEST WRAPPER ----------
async function igHeaders(extra = {}) {
  if (!CST || !XST) {
    await igLogin();
  }

  return {
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json; charset=UTF-8",
      "X-IG-API-KEY": IG_API_KEY,
      CST,
      "X-SECURITY-TOKEN": XST,
      "Version": "2",
      "IG-ACCOUNT-ID": IG_ACCOUNT_ID,
      ...extra.headers
    },
    method: extra.method || "GET",
    body: extra.body || null
  };
}

// Automatically refresh login if token expired
async function igRequest(path, options = {}) {
  const url = IG_API_URL + path;

  // First try
  let res = await fetch(url, await igHeaders(options));
  let json;

  try {
    json = await res.json();
  } catch {
    json = {};
  }

  // If IG token expired → auto re-login → retry once
  if (json.errorCode === "error.security.client-token-invalid") {
    console.log("IG token invalid — refreshing tokens and retrying…");
    await igLogin();

    res = await fetch(url, await igHeaders(options));
    json = await res.json();
  }

  return json;
}
// --------------------------------------------

// --------------- IG METHODS ------------------
const IG = {
  getMarkets(epic) {
    return igRequest(`/markets/${epic}`);
  },

  getPrices(epic, resolution, max = 10) {
    return igRequest(
      `/prices/${epic}?resolution=${resolution}&max=${max}`
    );
  },

  getPositions() {
    return igRequest(`/positions`);
  },

  openPosition(body) {
    return igRequest(`/positions/otc`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },

  closePosition(dealId) {
    return igRequest(`/positions/otc`, {
      method: "POST",
      body: JSON.stringify({
        dealId,
        direction: "SELL",
        size: 1
      })
    });
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
          result: await IG.getPrices(
            params.epic,
            params.resolution,
            params.max
          )
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`Hybrid MCP server running on port ${PORT}`)
);