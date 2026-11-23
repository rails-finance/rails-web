// The wallet read's hop to the api host (lib/wallet/api-hop.ts, ui-jobs 813):
// what counts as a connection failure, the one retry, and the cap on requests
// at once.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..") + "/").href;
const { isConnectionFailure, createLimiter, retryOnConnectionFailure } = await import(ROOT + "lib/wallet/api-hop.ts");

/** undici's shape for a reset: TypeError("fetch failed") with the socket error as its cause. */
const reset = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("Client network socket disconnected before secure TLS connection was established"), {
      code: "ECONNRESET",
    }),
  });

test("a reset, a cut TLS handshake and undici's fetch failed are connection failures", () => {
  assert.equal(isConnectionFailure(reset()), true);
  assert.equal(isConnectionFailure(Object.assign(new Error("read"), { code: "ECONNRESET" })), true);
  assert.equal(isConnectionFailure(Object.assign(new Error("x"), { code: "UND_ERR_SOCKET" })), true);
  assert.equal(isConnectionFailure(new Error("socket hang up")), true);
});

test("an HTTP answer, an abort and a short page are not", () => {
  assert.equal(isConnectionFailure(new Error("/api/wallet/0xabc/positions answered 503")), false);
  assert.equal(isConnectionFailure(new Error("answered 20 of 31 rows")), false);
  assert.equal(isConnectionFailure(Object.assign(new Error("aborted"), { name: "AbortError" })), false);
  assert.equal(
    isConnectionFailure(Object.assign(new TypeError("fetch failed"), { cause: { name: "AbortError" } })),
    false,
  );
  assert.equal(isConnectionFailure(undefined), false);
});

test("a connection failure is retried once, and the second answer stands", async () => {
  let calls = 0;
  const out = await retryOnConnectionFailure(
    async () => {
      calls++;
      if (calls === 1) throw reset();
      return "rows";
    },
    undefined,
    0,
  );
  assert.equal(out, "rows");
  assert.equal(calls, 2);
});

test("a second connection failure is thrown, with no third try", async () => {
  let calls = 0;
  await assert.rejects(
    retryOnConnectionFailure(
      async () => {
        calls++;
        throw reset();
      },
      undefined,
      0,
    ),
    /fetch failed/,
  );
  assert.equal(calls, 2);
});

test("an HTTP answer is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    retryOnConnectionFailure(
      async () => {
        calls++;
        throw new Error("answered 500");
      },
      undefined,
      0,
    ),
    /answered 500/,
  );
  assert.equal(calls, 1);
});

test("no retry once the budget's signal has aborted", async () => {
  const ctl = new AbortController();
  let calls = 0;
  await assert.rejects(
    retryOnConnectionFailure(
      async () => {
        calls++;
        ctl.abort();
        throw reset();
      },
      ctl.signal,
      0,
    ),
  );
  assert.equal(calls, 1);
});

test("the limiter runs at most its cap at once, in the order given", async () => {
  const limit = createLimiter(3);
  let running = 0;
  let peak = 0;
  const started = [];
  const job = (i) => () =>
    new Promise((done) => {
      running++;
      peak = Math.max(peak, running);
      started.push(i);
      setTimeout(() => {
        running--;
        done(i);
      }, 5);
    });
  const out = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => limit(job(i))));
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 3);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("a failed job frees its slot", async () => {
  const limit = createLimiter(1);
  await assert.rejects(limit(async () => Promise.reject(new Error("no"))));
  assert.equal(await limit(async () => "next"), "next");
});
