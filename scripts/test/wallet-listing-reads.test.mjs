// The wallet read's listing reads (rails-ops ui-jobs 794): beside the summary
// route, the Liquity V1 Trove and the V1 and V2 deposit listings. A read that
// fails, hangs past its own wait or answers part of the wallet is named and
// leaves the answer partial; a partial counts answer is never kept; the page
// and the counts read take the same rows. The backend is a stubbed fetch.
// The modules import through `@/`, resolved here as wallet-sections.test.mjs
// does. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  // server-only throws outside Next; next's subpath entries are files
  // without an exports map.
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";

const W = "0x2291f52bddc937b5b840d15e551e1da8c80c2b3c";
const E18 = "000000000000000000";

// The backend, by route. `v2sp` sets how the V2 deposit listing answers.
let v2sp = "ok";
let calls = [];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  calls.push(url.pathname);
  if (url.pathname === `/api/wallet/${W}/positions`)
    return json({ address: W, rows: [], total: 0, open: 0, closed: 0, limit: 500, offset: 0 });
  if (url.pathname === "/api/liquity-v1/positions")
    return json({
      rows: [
        {
          wallet: W,
          epoch: 2,
          status: "open",
          collBalanceRaw: `4${E18}`,
          debtBalanceRaw: `2000${E18}`,
          peakCollRaw: `4${E18}`,
          peakDebtRaw: `2000${E18}`,
          lastActivityAt: 1725440591,
          lastBlockNumber: 20676195,
          lastTxHash: "0x",
          txCount: 5,
          liquidationCount: 0,
          redemptionCount: 0,
          closedByRedemption: false,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
  if (url.pathname === "/api/liquity-v1/stability-pool")
    return json({
      rows: [{ depositor: W, status: "open", deposit_raw: `5${E18}`, deposited_raw: `5${E18}`, tx_count: 1 }],
      pagination: { total: 1 },
    });
  if (url.pathname === "/api/liquity-v2/stability-pool") {
    if (v2sp === "fail") return json({ error: "down" }, 500);
    if (v2sp === "hang")
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    if (v2sp === "truncated")
      return json({ rows: [{ collateral_type: "WETH", depositor: W, status: "open" }], pagination: { total: 4 } });
    return json({
      rows: [{ collateral_type: "WETH", depositor: W, status: "open", deposit_raw: `3${E18}`, tx_count: 1 }],
      pagination: { total: 1 },
    });
  }
  return json({ error: `no stub for ${url.pathname}` }, 404);
};

const { readListingRows, readSummary, readWalletCounts } = await import("../../lib/wallet/read-wallet.ts");

const signal = () => new AbortController().signal;

test("every listing answers: the rows of each kind, nothing failed", async () => {
  v2sp = "ok";
  const r = await readListingRows(W, signal());
  assert.deepEqual(r.failed, []);
  assert.deepEqual(
    r.rows.map((x) => `${x.family}:${x.kind ?? "troves"}`),
    ["liquity-v1:troves", "liquity-v1:deposits", "liquity-v2:deposits"],
  );
});

test("a listing that fails is named; the others' rows stand", async () => {
  v2sp = "fail";
  const r = await readListingRows(W, signal());
  assert.deepEqual(
    r.failed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
  assert.equal(r.rows.length, 2);
});

test("a listing that hangs fails alone at its own wait", async () => {
  v2sp = "hang";
  const t0 = Date.now();
  const r = await readListingRows(W, signal(), undefined, 50);
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(
    r.failed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
  assert.match(r.failed[0].error, /no answer/);
  assert.equal(r.rows.length, 2);
});

test("a listing that answers part of the wallet counts as failed", async () => {
  v2sp = "truncated";
  const r = await readListingRows(W, signal());
  assert.deepEqual(
    r.failed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
  assert.match(r.failed[0].error, /1 of 4/);
});

test("the summary carries the listing rows and their failures", async () => {
  v2sp = "fail";
  const s = await readSummary(W, signal());
  assert.equal(s.total, 2);
  assert.equal(s.open, 2);
  assert.deepEqual(
    s.listingFailed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
});

test("counts: partial while a listing failed, and not kept; whole and kept after", async () => {
  v2sp = "fail";
  const first = await readWalletCounts(W);
  assert.deepEqual(first.partial, ["Liquity V2 Stability Pool deposits"]);
  assert.equal(first.total, 2);
  await new Promise((r) => setTimeout(r, 0));
  v2sp = "ok";
  calls = [];
  const second = await readWalletCounts(W);
  assert.ok(calls.length > 0, "a partial answer is read again");
  assert.equal(second.partial, undefined);
  assert.equal(second.total, 3);
  assert.deepEqual(
    second.families.map((f) => `${f.family}:${f.positions}`),
    ["liquity-v1:2", "liquity-v2:1"],
  );
  await new Promise((r) => setTimeout(r, 0));
  calls = [];
  await readWalletCounts(W);
  assert.equal(calls.length, 0, "a whole answer is kept");
});
