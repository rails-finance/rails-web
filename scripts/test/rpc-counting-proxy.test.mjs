// The RPC proxy counts what the upstream answered, per lane: an HTTP status, a
// JSON-RPC error inside a 200 (its code and first 80 characters), a timeout.
// Run against a local stub upstream; no provider is called.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROXY = join(HERE, "..", "verify", "rpc-counting-proxy.mjs");
const LONG =
  "Log response size exceeded. You can make eth_getLogs requests with up to a 10K block range and no limit on the response size";

let stub;
let proxy;
let dir;
let port;
let stubPort;
const hanging = [];

before(async () => {
  stub = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const body = JSON.parse(b);
      if (body.method === "x_refuse") {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end('{"error":"Monthly capacity limit exceeded"}');
      }
      if (body.method === "x_rpcerror") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: LONG } }));
      }
      if (body.method === "x_hang") return void hanging.push(res); // never answers
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x1" }));
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  stubPort = stub.address().port;
  dir = mkdtempSync(join(tmpdir(), "rpc-proxy-test-"));
  port = 19000 + Math.floor(Math.random() * 500);
  proxy = spawn(process.execPath, [PROXY], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      RPC_CACHE_DIR: dir,
      RPC_QUIET: "1",
      UPSTREAM: `http://127.0.0.1:${stubPort}/secret-key-abc123`,
      UPSTREAM_TIMEOUT_MS: "400",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/__pins`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("the proxy never listened");
});

after(() => {
  proxy?.kill("SIGKILL");
  for (const r of hanging) r.destroy();
  stub?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const call = (method) =>
  fetch(`http://127.0.0.1:${port}/upstream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });

test("a 429, a JSON-RPC error in a 200 and a timeout are each counted, with the host and no key", async () => {
  assert.equal((await call("x_refuse")).status, 429);
  assert.equal((await call("x_rpcerror")).status, 200);
  assert.equal((await call("x_rpcerror")).status, 200);
  assert.equal((await call("x_hang")).status, 502);
  const count = await (await fetch(`http://127.0.0.1:${port}/__count`)).json();
  const o = count.lanesCount.upstream.outcomes;
  assert.equal(o["429"], 1);
  assert.equal(o[`200/-32602 "${LONG.slice(0, 80)}…"`], 2);
  assert.equal(o.timeout, 1);
  assert.equal(count.hosts.upstream, `127.0.0.1:${stubPort}`);
  assert.ok(!JSON.stringify(count).includes("secret-key-abc123"), "the key never appears in the count");
});
