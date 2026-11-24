// The keep-alive pool for server fetches to the api host (lib/api/api-pool.ts,
// ui-jobs 825), driven through Node's global fetch as the server's reads are,
// against a local server that counts the connections it accepts.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..") + "/").href;
const { API_CONNECTIONS, API_KEEPALIVE_MS, OriginRouter, createApiPool, installApiPool } = await import(
  ROOT + "lib/api/api-pool.ts"
);

/** A server on 127.0.0.1 that answers after `delayMs`, cuts the socket on
 *  /reset, and counts the connections it accepts. */
async function startServer(delayMs = 40) {
  const stats = { connections: 0, open: 0, maxOpen: 0 };
  const server = http.createServer((req, res) => {
    if (req.url === "/reset") {
      req.socket.destroy();
      return;
    }
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ url: req.url }));
    }, delayMs);
  });
  server.keepAliveTimeout = 60_000;
  server.on("connection", (socket) => {
    stats.connections++;
    stats.open++;
    stats.maxOpen = Math.max(stats.maxOpen, stats.open);
    socket.on("close", () => stats.open--);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const stop = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { origin, stats, stop };
}

/** Route `origin` through a fresh pool as the global dispatcher for `fn`'s run. */
async function withPool(origin, fn) {
  const before = getGlobalDispatcher();
  const router = new OriginRouter(origin, createApiPool(origin), before);
  setGlobalDispatcher(router);
  try {
    return await fn();
  } finally {
    setGlobalDispatcher(before);
    await router.close();
  }
}

const read = async (url) => {
  const res = await fetch(url);
  return res.json();
};

test("the cap sits below kings-cross's burst and the idle time inside Caddy's", () => {
  assert.ok(API_CONNECTIONS >= 4 && API_CONNECTIONS < 8);
  assert.ok(API_KEEPALIVE_MS > 0 && API_KEEPALIVE_MS < 300_000);
});

test("a burst of concurrent api-host requests opens at most the cap's connections", async () => {
  const { origin, stats, stop } = await startServer();
  try {
    const n = API_CONNECTIONS * 4;
    const bodies = await withPool(origin, () =>
      Promise.all(Array.from({ length: n }, (_, i) => read(`${origin}/r/${i}`))),
    );
    assert.equal(bodies.length, n);
    assert.deepEqual(
      bodies.map((b) => b.url),
      Array.from({ length: n }, (_, i) => `/r/${i}`),
    );
    assert.ok(stats.connections <= API_CONNECTIONS, `${stats.connections} connections for ${n} requests`);
    assert.ok(stats.maxOpen <= API_CONNECTIONS);
  } finally {
    await stop();
  }
});

// fetch hands back a read body a tick before undici frees its connection, so
// the second of two back-to-back requests opens a second one (Node's default
// dispatcher does the same); from then on the two are reused.
test("sequential requests reuse their connections", async () => {
  const { origin, stats, stop } = await startServer(5);
  try {
    await withPool(origin, async () => {
      for (let i = 0; i < 12; i++) assert.equal((await read(`${origin}/s/${i}`)).url, `/s/${i}`);
    });
    assert.ok(stats.connections <= 2, `${stats.connections} connections for 12 requests`);
  } finally {
    await stop();
  }
});

test("a reset connection fails only its request and is replaced", async () => {
  const { origin, stats, stop } = await startServer();
  try {
    await withPool(origin, async () => {
      // Warm the pool to its cap, then send a burst with one request the server cuts.
      await Promise.all(Array.from({ length: API_CONNECTIONS }, (_, i) => read(`${origin}/w/${i}`)));
      const warm = stats.connections;
      const paths = Array.from({ length: 12 }, (_, i) => (i === 5 ? "/reset" : `/b/${i}`));
      const results = await Promise.allSettled(paths.map((p) => read(origin + p)));
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [paths[i]] : []));
      assert.deepEqual(failed, ["/reset"]);
      // The next request finds a working connection, and the cut one was replaced.
      assert.equal((await read(`${origin}/after`)).url, "/after");
      assert.ok(stats.connections > warm, "a new connection replaced the reset one");
      assert.ok(stats.maxOpen <= API_CONNECTIONS);
    });
  } finally {
    await stop();
  }
});

test("installApiPool routes only the api origin and installs once", async () => {
  const api = await startServer();
  const other = await startServer();
  const before = getGlobalDispatcher();
  try {
    const router = installApiPool(`${api.origin}/api`);
    assert.ok(router);
    assert.equal(installApiPool("http://127.0.0.1:1"), router);
    assert.equal(getGlobalDispatcher(), router);
    const n = API_CONNECTIONS + 4;
    await Promise.all(Array.from({ length: n }, (_, i) => read(`${api.origin}/a/${i}`)));
    await Promise.all(Array.from({ length: n }, (_, i) => read(`${other.origin}/o/${i}`)));
    assert.ok(api.stats.connections <= API_CONNECTIONS);
    assert.ok(other.stats.connections > API_CONNECTIONS, "another origin keeps the process's dispatcher");
    await router.close();
  } finally {
    setGlobalDispatcher(before);
    delete globalThis[Symbol.for("rails.api.pool")];
    await api.stop();
    await other.stop();
  }
});

test("without an api URL nothing is installed", () => {
  const before = getGlobalDispatcher();
  assert.equal(installApiPool(undefined), undefined);
  assert.equal(installApiPool("not a url"), undefined);
  assert.equal(getGlobalDispatcher(), before);
});
