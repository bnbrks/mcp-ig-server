import express from "express";
import IGClient from "./igClient.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const SECRET = process.env.MCP_SHARED_SECRET;

// ---- AUTH ----
function checkAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.writeHead(401);
    res.end("Unauthorized");
    return false;
  }
  const token = auth.split(" ")[1];
  if (token !== SECRET) {
    res.writeHead(401);
    res.end("Unauthorized");
    return false;
  }
  return true;
}

// ---- SSE MCP ----
app.get("/mcp", (req, res) => {
  if (!checkAuth(req, res)) return;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const ig = new IGClient();

  function send(msg) {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  req.on("data", async chunk => {
    try {
      const data = JSON.parse(chunk.toString());
      const { id, method, params } = data;

      async function ok(result) { send({ id, result }); }
      async function err(e) { send({ id, error: e.toString() }); }

      try {
        switch (method) {
          case "ping":
            return ok({ pong: true });

          case "ig.getMarkets":
            return ok(await ig.getMarkets(params.searchTerm));

          case "ig.placeTrade":
            return ok(await ig.placeTrade(params));

          case "ig.getHistorical":
            return ok(await ig.getHistorical(params.epic, params.resolution, params.max));

          case "ig.getHistoricalRange":
            return ok(await ig.getHistoricalRange(params.epic, params.resolution, params.from, params.to));

          case "ig.call":
            return ok(await ig.call(params.endpoint, params));

          default:
            return err("Unknown method " + method);
        }
      } catch (e) {
        return err(e);
      }

    } catch (e) {
      send({ error: "Invalid JSON" });
    }
  });

  req.on("close", () => res.end());
});

app.get("/", (_, res) => {
  res.send("IG MCP Server (Real Trading Enabled)");
});

app.listen(PORT, () => console.log("IG MCP REAL server running on", PORT));
