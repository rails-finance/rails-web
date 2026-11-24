// lib/sources/api/route-gate.ts behind the keep-alive pool (lib/api/api-pool.ts):
// a gate request whose wait runs out while it queues for one of the pool's
// connections returns null and marks nothing down, since the api was not asked;
// one that times out on a connection marks its key down as before. Against a
// local 127.0.0.1 server.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) return next(${JSON.stringify(ROOT)} + spec.slice(2) + ".ts", ctx);
  if (/^\\.\\.?\\//.test(spec) && !/\\.[a-z]+$/.test(spec)) return next(new URL(spec + ".ts", ctx.parentURL).href, ctx);
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { API_CONNECTIONS, OriginRouter, createApiPool } = await import(ROOT + "lib/api/api-pool.ts");
const { routeGate } = await import(ROOT + "lib/sources/api/route-gate.ts");

/** A server that answers after `?ms=` (default 5) and lists what it was asked. */
async function startServer() {
  const seen = [];
  let inFlight = 0;
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    inFlight++;
    res.on("close", () => inFlight--);
    const ms = Number(new URL(req.url, "http://x").searchParams.get("ms") ?? 5);
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ url: req.url }));
    }, ms);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const before = getGlobalDispatcher();
  const router = new OriginRouter(origin, createApiPool(origin), before);
  setGlobalDispatcher(router);
  process.env.RAILS_API_URL = origin;
  const stop = async () => {
    setGlobalDispatcher(before);
    await router.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { origin, seen, inFlight: () => inFlight, stop };
}

async function until(cond, ms = 2_000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("a gate request that waits out its time in the pool's queue does not mark its key down", async () => {
  const api = await startServer();
  try {
    const held = Array.from({ length: API_CONNECTIONS }, (_, i) =>
      fetch(`${api.origin}/hold/${i}?ms=500`).then((r) => r.json()),
    );
    await until(() => api.inFlight() === API_CONNECTIONS);
    const gate = routeGate();
    assert.equal(await gate.json("k", `${api.origin}/queued`, {}, { timeoutMs: 150 }), null);
    await Promise.all(held);
    assert.ok(!api.seen.includes("/queued"), "the queued request never reached the api");
    // The key is not down: the next ask reaches the api and is answered.
    assert.deepEqual(await gate.json("k", `${api.origin}/next`, {}, { timeoutMs: 1_000 }), { url: "/next" });
  } finally {
    await api.stop();
  }
});

test("a gate request that times out on a connection marks its key down", async () => {
  const api = await startServer();
  try {
    const gate = routeGate();
    assert.equal(await gate.json("k", `${api.origin}/slow?ms=400`, {}, { timeoutMs: 100 }), null);
    assert.equal(await gate.json("k", `${api.origin}/next`, {}, { timeoutMs: 1_000 }), null);
    assert.ok(!api.seen.includes("/next"), "the key is down, so the second ask was not sent");
  } finally {
    await api.stop();
  }
});
