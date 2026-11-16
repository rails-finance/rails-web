// lib/sources/api/route-gate.ts during `next build` (rails-ops TO-DO-ui-jobs.md item 686): a
// refused connection, a timeout, a 5xx or a 429 throws RouteDownAtBuild and marks nothing down,
// so no prerender reads the chain in the route's place; at run time the same failures return
// null and mark the key down for 30 s, as before.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("./") && !/\\.[a-z]+$/.test(spec)) return next(new URL(spec + ".ts", ctx.parentURL).href, ctx);
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const API = "https://api.example";
process.env.RAILS_API_URL = API;
const { routeGate } = await import(ROOT + "lib/sources/api/route-gate.ts");

const FAILURES = {
  "a refused connection": async () => {
    throw new TypeError("fetch failed");
  },
  "a 503": async () => new Response("{}", { status: 503 }),
  "a 429": async () => new Response("{}", { status: 429 }),
  "a timeout": (_url, init) => {
    // AbortSignal.timeout's timer does not hold the event loop open.
    const keep = setInterval(() => {}, 1_000);
    return new Promise((_, reject) =>
      init.signal.addEventListener("abort", () => {
        clearInterval(keep);
        reject(init.signal.reason);
      }),
    );
  },
};

test.afterEach(() => {
  test.mock.restoreAll();
  delete process.env.NEXT_PHASE;
});

for (const [name, answer] of Object.entries(FAILURES)) {
  test(`at build, ${name} throws and marks nothing down`, async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    let asked = 0;
    test.mock.method(globalThis, "fetch", async (url, init) => (asked++, answer(url, init)));
    const gate = routeGate();
    for (let i = 0; i < 2; i++)
      await assert.rejects(gate.json("k", `${API}/x`, {}, { timeoutMs: 50 }), { name: "RouteDownAtBuild" });
    assert.equal(asked, 2, "the second ask reached the route");
  });

  test(`at run time, ${name} returns null and marks the key down`, async () => {
    let asked = 0;
    test.mock.method(globalThis, "fetch", async (url, init) => (asked++, answer(url, init)));
    const gate = routeGate();
    assert.equal(await gate.json("k", `${API}/x`, {}, { timeoutMs: 50 }), null);
    assert.equal(await gate.json("k", `${API}/x`, {}, { timeoutMs: 50 }), null);
    assert.equal(asked, 1, "the second ask was not sent");
  });
}

test("at build, a 404 is still an answer", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  test.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 404 }));
  assert.deepEqual(await routeGate().answer("k", `${API}/x`, {}), { status: 404 });
});

test("at build, the caller's own abort returns null", async () => {
  process.env.NEXT_PHASE = "phase-production-build";
  const ctl = new AbortController();
  test.mock.method(globalThis, "fetch", async () => {
    ctl.abort();
    throw new DOMException("aborted", "AbortError");
  });
  assert.equal(await routeGate().json("k", `${API}/x`, {}, { signal: ctl.signal }), null);
});
