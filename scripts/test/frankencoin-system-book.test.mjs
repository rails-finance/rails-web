// lib/sources/api/frankencoin-system-book.ts (rails-ops TO-DO-ui-jobs.md item 826): the
// system book's sweep asks a failed page again, so one page that fails once does not
// withhold the whole book; a page that keeps failing still gives the stale stub.
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
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (spec.startsWith("@/")) return next(${JSON.stringify(ROOT)} + spec.slice(2) + ".ts", ctx);
  if (spec.startsWith("./") && !/\\.[a-z]+$/.test(spec)) return next(new URL(spec + ".ts", ctx.parentURL).href, ctx);
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

process.env.RAILS_API_URL = "https://api.example";
const { loadFrankencoinBook } = await import(ROOT + "lib/sources/api/frankencoin-system-book.ts");

const TOTAL = 150;
/** One raw position row as the index serves it; every field the row builder reads. */
function raw(i) {
  return {
    position: `0x${i.toString(16).padStart(40, "0")}`,
    original: null,
    hub_version: "V2",
    owner: "0x" + "a".repeat(40),
    status: "open",
    collateral_token: "0x" + "c".repeat(40),
    collateral_symbol: "WETH",
    collateral_decimals: 18,
    collateral_raw: "1",
    minted_raw: "0",
    price_raw: null,
    challenge_count: "0",
    challenge_succeeded_count: "0",
    last_activity_at: "0",
    last_block_number: "0",
    last_tx_hash: "0x" + "0".repeat(64),
    event_count: "1",
    tx_count: "1",
  };
}

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A fetch that serves the roster in pages of 100 and fails `offset=100` the first `failures` times. */
function sweep(failures) {
  const asked = [];
  let failed = 0;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const offset = Number(u.searchParams.get("offset"));
    asked.push(offset);
    if (offset === 100 && failed < failures) {
      failed++;
      return new Response("{}", { status: 503, statusText: "Service Unavailable" });
    }
    const rows = Array.from({ length: Math.max(0, Math.min(100, TOTAL - offset)) }, (_, k) => raw(offset + k));
    return new Response(JSON.stringify({ rows, total: TOTAL, limit: 100, offset }), { status: 200 });
  };
  return asked;
}

test("a page that fails once is asked again, and the book is read whole", async () => {
  const asked = sweep(1);
  const book = await loadFrankencoinBook();
  assert.equal(book.bookStale, false);
  assert.equal(book.total, TOTAL);
  assert.deepEqual(asked, [0, 100, 100]);
});

test("a page that fails on every attempt still gives the stale book", async () => {
  const asked = sweep(Infinity);
  const book = await loadFrankencoinBook();
  assert.equal(book.bookStale, true);
  assert.equal(book.total, 0);
  assert.deepEqual(asked, [0, 100, 100, 100]);
});
