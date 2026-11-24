// The keep-alive pool for server fetches to the api host (lib/api/api-pool.ts,
// ui-jobs 825), driven through Node's global fetch as the server's reads are,
// against a local server that counts the connections it accepts. Also the
// wait record the pool keeps for the route gate (lib/api/pool-wait.ts), the
// stale-socket retry, and the home count's cap (lib/home/count-slot.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";

// The modules under test import their siblings without the .ts extension.
const hook = `
export async function resolve(spec, ctx, next) {
  if (/^\\.\\.?\\//.test(spec) && !/\\.[a-z]+$/.test(spec)) return next(new URL(spec + ".ts", ctx.parentURL).href, ctx);
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..") + "/").href;
const { API_CONNECTIONS, API_KEEPALIVE_MS, OriginRouter, createApiPool, installApiPool } = await import(
  ROOT + "lib/api/api-pool.ts"
);
const { withPoolWait } = await import(ROOT + "lib/api/pool-wait.ts");
const { COUNT_CONCURRENCY, countSlot } = await import(ROOT + "lib/home/count-slot.ts");
const { fetchWithRetry } = await import(ROOT + "lib/api/resilient-fetch.ts");

/** A server on 127.0.0.1 that answers after `delayMs` (or `?ms=`), cuts the
 *  socket on /reset, cuts a reused socket on /stale, sends 8 MB on /big, and
 *  counts the connections it accepts and the requests in flight. */
async function startServer(delayMs = 40) {
  const stats = { connections: 0, open: 0, maxOpen: 0, inFlight: 0, maxInFlight: 0, seen: [] };
  const server = http.createServer((req, res) => {
    stats.seen.push(`${req.method} ${req.url}`);
    req.socket.served = (req.socket.served ?? 0) + 1;
    if (req.url === "/reset" || (req.url === "/stale" && req.socket.served > 1)) {
      req.socket.destroy();
      return;
    }
    if (req.url === "/big") {
      res.setHeader("content-type", "application/octet-stream");
      res.end(Buffer.alloc(8 * 1024 * 1024, 1));
      return;
    }
    stats.inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    res.on("close", () => stats.inFlight--);
    const ms = Number(new URL(req.url, "http://x").searchParams.get("ms") ?? delayMs);
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ url: req.url }));
    }, ms);
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
async function withPool(origin, fn, opts = {}) {
  const before = getGlobalDispatcher();
  const router = new OriginRouter(origin, createApiPool(origin, opts), before);
  setGlobalDispatcher(router);
  try {
    return await fn(router);
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

/** Resolves once `cond()` holds, checking every 5 ms. */
async function until(cond, ms = 2_000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Fill every connection with a request the server answers after `ms`. */
async function holdFull(origin, stats, ms) {
  const held = Array.from({ length: API_CONNECTIONS }, (_, i) => read(`${origin}/hold/${i}?ms=${ms}`));
  await until(() => stats.inFlight === API_CONNECTIONS);
  return held;
}

test("a request that times out in the pool's queue is marked queued", async () => {
  const { origin, stats, stop } = await startServer();
  try {
    await withPool(origin, async () => {
      const held = await holdFull(origin, stats, 600);
      let wait;
      await assert.rejects(
        withPoolWait((w) => ((wait = w), fetch(`${origin}/queued`, { signal: AbortSignal.timeout(150) }))),
        { name: "TimeoutError" },
      );
      assert.equal(wait.state, "queued");
      await Promise.all(held);
      assert.ok(!stats.seen.includes("GET /queued"), "the timed-out request never reached the server");
    });
  } finally {
    await stop();
  }
});

test("a request that times out on a connection is marked granted", async () => {
  const { origin, stop } = await startServer();
  try {
    await withPool(origin, async () => {
      let wait;
      await assert.rejects(
        withPoolWait((w) => ((wait = w), fetch(`${origin}/slow?ms=400`, { signal: AbortSignal.timeout(100) }))),
        { name: "TimeoutError" },
      );
      assert.equal(wait.state, "granted");
    });
  } finally {
    await stop();
  }
});

test("a request aborted while queued rejects, never reaches the server, and the queue moves on", async () => {
  const { origin, stats, stop } = await startServer();
  try {
    await withPool(origin, async (router) => {
      // Counted on the client: the server sees a destroyed socket close only
      // after the pool may have opened its replacement.
      const sockets = { opened: 0, open: 0, maxOpen: 0 };
      router.pool.on("connect", () => {
        sockets.opened++;
        sockets.open++;
        sockets.maxOpen = Math.max(sockets.maxOpen, sockets.open);
      });
      router.pool.on("disconnect", () => sockets.open--);
      const held = await holdFull(origin, stats, 300);
      const ctl = new AbortController();
      const aborted = fetch(`${origin}/aborted`, { signal: ctl.signal });
      const next = read(`${origin}/next`);
      ctl.abort();
      await assert.rejects(aborted, { name: "AbortError" });
      assert.equal((await next).url, "/next");
      await Promise.all(held);
      assert.ok(!stats.seen.includes("GET /aborted"), "the aborted request never reached the server");
      // Its turn closes the connection it was handed (undici's abort destroys
      // the socket), so the pool opens one more, after that one has closed.
      assert.equal(sockets.opened, API_CONNECTIONS + 1);
      assert.ok(sockets.maxOpen <= API_CONNECTIONS, `${sockets.maxOpen} open at once`);
    });
  } finally {
    await stop();
  }
});

test("an unread body holds its connection, and a cancelled one frees it", async () => {
  const { origin, stop } = await startServer(5);
  try {
    await withPool(
      origin,
      async () => {
        const unread = await fetch(`${origin}/big`);
        assert.equal(unread.status, 200);
        // Held: the one connection is still carrying the unread 8 MB.
        await assert.rejects(fetch(`${origin}/blocked`, { signal: AbortSignal.timeout(300) }), {
          name: "TimeoutError",
        });
        await unread.body.cancel();
        assert.equal((await read(`${origin}/after-cancel`)).url, "/after-cancel");

        const dropped = await fetch(`${origin}/big`);
        await dropped.body.cancel();
        const res = await fetch(`${origin}/after-drop`, { signal: AbortSignal.timeout(1_000) });
        assert.equal((await res.json()).url, "/after-drop");
      },
      { connections: 1 },
    );
  } finally {
    await stop();
  }
});

test("a GET whose reused socket is cut before any headers is retried once and succeeds", async () => {
  const { origin, stats, stop } = await startServer(5);
  try {
    await withPool(
      origin,
      async () => {
        assert.equal((await read(`${origin}/warm`)).url, "/warm");
        assert.equal((await read(`${origin}/stale`)).url, "/stale");
        assert.deepEqual(
          stats.seen.filter((x) => x === "GET /stale"),
          ["GET /stale", "GET /stale"],
        );
        assert.equal(stats.connections, 2);
      },
      { connections: 1 },
    );
  } finally {
    await stop();
  }
});

test("a POST under the same failure is not retried", async () => {
  const { origin, stats, stop } = await startServer(5);
  try {
    await withPool(
      origin,
      async () => {
        assert.equal((await read(`${origin}/warm`)).url, "/warm");
        await assert.rejects(fetch(`${origin}/stale`, { method: "POST", body: "{}" }));
        assert.deepEqual(
          stats.seen.filter((x) => x.endsWith(" /stale")),
          ["POST /stale"],
        );
      },
      { connections: 1 },
    );
  } finally {
    await stop();
  }
});

test("a socket cut on every try fails after one retry", async () => {
  const { origin, stats, stop } = await startServer(5);
  try {
    await withPool(origin, async () => {
      await assert.rejects(read(`${origin}/reset`));
      assert.equal(stats.seen.filter((x) => x === "GET /reset").length, 2);
    });
  } finally {
    await stop();
  }
});

test("an error status is an answer and is not retried by the pool", async () => {
  const server = http.createServer((req, res) => {
    server.seen = (server.seen ?? 0) + 1;
    res.statusCode = 503;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await withPool(origin, async () => {
      const res = await fetch(`${origin}/x`);
      assert.equal(res.status, 503);
      await res.body.cancel();
      assert.equal(server.seen, 1);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the home count's fan-out has at most four legs in flight", async () => {
  const { origin, stats, stop } = await startServer(15);
  try {
    assert.equal(COUNT_CONCURRENCY, 4);
    await withPool(origin, async () => {
      const legs = Array.from({ length: 60 }, (_, i) =>
        countSlot(async () => {
          const res = await fetchWithRetry(`${origin}/leg/${i}`, {});
          return res.json();
        }),
      );
      const bodies = await Promise.all(legs);
      assert.equal(bodies.length, 60);
    });
    assert.equal(stats.maxInFlight, COUNT_CONCURRENCY);
  } finally {
    await stop();
  }
});
