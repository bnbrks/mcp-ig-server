import express from "express";
import axios from "axios";

const PORT = process.env.PORT || 8080;

// ---- Security ----
const SECRET = process.env.MCP_SHARED_SECRET;

// ---- Express ----
const app = express();
app.use(express.json());

// ---- Auth Check ----
function auth(req, res) {
  const provided = req.headers["x-mcp-secret"];
  if (!SECRET) return true;
  if (provided !== SECRET) {
    res.writeHead(401);
    res.end("Unauthorized");
    return false;
  }
  return true;
}

// ---- SSE MCP Endpoint ----
app.get("/mcp", (req, res) => {
  if (!auth(req, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // send message to ChatGPT
  function send(msg) {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  // handle incoming data
  req.on("close", () => res.end());

  // Handle incoming JSON-RPC messages
  req.on("data", async (chunk) => {
    const raw = chunk.toString().trim();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      send({ error: "Invalid JSON" });
      return;
    }

    const { id, method, params } = data;

    async function respond(result) {
      send({ id, result });
    }

    async function respondErr(error) {
      send({ id, error });
    }

    try {
      // ---- IG CLIENT ----
      const ig = new IGClient();

      switch (method) {
        case "ping":
          return respond({ pong: true });

        case "ig.getMarkets":
          return respond(await ig.getMarkets(params.searchTerm));

        case "ig.placeTrade":
          return respond(await ig.placeTrade(params));

        case "ig.getHistorical":
          return respond(await ig.getHistorical(params.epic, params.resolution, params.max));

        case "ig.getHistoricalRange":
          return respond(await ig.getHistoricalRange(params.epic, params.resolution, params.from, params.to));

        case "ig.call":
          return respond(await ig.call(params.endpoint, params.options || {}));

        default:
          return respondErr("Unknown method: " + method);
      }
    } catch (err) {
      return respondErr(err.toString());
    }
  });
});


// ---- IG Client ----
class IGClient {
  constructor() {
    this.apiKey = process.env.IG_API_KEY;
    this.username = process.env.IG_USERNAME;
    this.password = process.env.IG_PASSWORD;
    this.apiUrl = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";
    this.cst = null;
    this.token = null;
  }

  async ensureSession() {
    if (this.cst && this.token) return;

    const res = await axios.post(
      this.apiUrl + "/session",
      { identifier: this.username, password: this.password },
      { headers: { "X-IG-API-KEY": this.apiKey, "Content-Type": "application/json" } }
    );

    this.cst = res.headers["cst"];
    this.token = res.headers["x-security-token"];
  }

  async igHeaders() {
    await this.ensureSession();
    return {
      "X-IG-API-KEY": this.apiKey,
      CST: this.cst,
      "X-SECURITY-TOKEN": this.token,
      Accept: "application/json"
    };
  }

  async getMarkets(term) {
    const headers = await this.igHeaders();
    const res = await axios.get(this.apiUrl + "/markets", {
      params: { searchTerm: term },
      headers
    });
    return res.data;
  }

  async placeTrade(body) {
    const headers = await this.igHeaders();
    const res = await axios.post(this.apiUrl + "/positions/otc", body, {
      headers: { ...headers, "Content-Type": "application/json", Version: "2" }
    });
    return res.data;
  }

  async getHistorical(epic, resolution, max = 100) {
    const headers = await this.igHeaders();
    const res = await axios.get(this.apiUrl + "/prices/" + epic, {
      params: { resolution, max },
      headers
    });
    return res.data;
  }

  async getHistoricalRange(epic, resolution, from, to) {
    const headers = await this.igHeaders();
    const res = await axios.get(this.apiUrl + "/prices/" + epic, {
      params: { resolution, from, to },
      headers
    });
    return res.data;
  }

  async call(endpoint, options) {
    const headers = await this.igHeaders();
    const url = this.apiUrl + "/" + endpoint;
    const method = (options.method || "GET").toLowerCase();

    if (method === "get") {
      return (await axios.get(url, { headers, params: options.params })).data;
    }

    return (
      await axios({
        url,
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        data: options.body || {}
      })
    ).data;
  }
}

// ---- Start ----
app.listen(PORT, () => console.log("MCP SSE server running on", PORT));
