// Counting JSON-RPC proxy — the measurement rig for the market/system view
// caching work. Listens on 127.0.0.1:$PORT and forwards every POST body to the
// upstream RPC named by $UPSTREAM, counting requests and (because viem may
// batch) the individual calls inside each body, broken down by method.
//
// GET /__count returns the counters as JSON; GET /__reset zeroes them.
//
// Run it from the repo root with the real endpoint in UPSTREAM, then point
// ALCHEMY_URL (or BASE_RPC_URL) at http://127.0.0.1:$PORT for the server under
// measurement. Not part of the app or any check — a rig, kept here so the next
// measurement does not re-derive it.

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8899);
const UPSTREAM = process.env.UPSTREAM;
if (!UPSTREAM) {
  console.error("UPSTREAM is not set — give it the real RPC URL to forward to");
  process.exit(1);
}

let httpRequests = 0;
let rpcCalls = 0;
const byMethod = new Map();

function tally(body) {
  const calls = Array.isArray(body) ? body : [body];
  rpcCalls += calls.length;
  for (const c of calls) {
    const m = c?.method ?? "(unknown)";
    byMethod.set(m, (byMethod.get(m) ?? 0) + 1);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__count") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ httpRequests, rpcCalls, byMethod: Object.fromEntries(byMethod) }));
    return;
  }
  if (req.method === "GET" && req.url === "/__reset") {
    httpRequests = 0;
    rpcCalls = 0;
    byMethod.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"reset":true}');
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks);
    httpRequests += 1;
    try {
      tally(JSON.parse(raw.toString("utf8")));
    } catch {
      // A body that is not JSON still counted as one HTTP request.
    }
    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rpc-counting-proxy listening on http://127.0.0.1:${PORT} -> ${UPSTREAM}`);
});
