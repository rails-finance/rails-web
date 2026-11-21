// The wallet read's listing reads (rails-ops ui-jobs 794, 738): beside the
// summary route, the Liquity V1 Trove and the V1, V2 and fork deposit listings. A read that
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

// The backend, by route. `v2sp` sets how the V2 deposit listing answers;
// `ebisuSp` the rows Ebisu's deposit listing answers (the other forks' none).
let v2sp = "ok";
let ebisuSp = [];
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
  if (url.pathname === "/api/liquity-v1/staking")
    return json({
      rows: [{ staker: W, status: "open", stake_raw: `7${E18}`, staked_raw: `7${E18}`, tx_count: 1 }],
      pagination: { total: 1 },
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
  if (url.pathname === "/api/ebisu/stability-pool")
    return json({ rows: ebisuSp, pagination: { total: ebisuSp.length } });
  if (url.pathname === "/api/asymmetry/stability-pool" || url.pathname === "/api/basedollar/stability-pool")
    return json({ rows: [], pagination: { total: 0 } });
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
    ["liquity-v1:troves", "liquity-v1:deposits", "liquity-v1:stakes", "liquity-v2:deposits"],
  );
});

test("a fork's deposits read from its deposit listing, under the fork's slug", async () => {
  v2sp = "ok";
  ebisuSp = [
    {
      collateral_type: "WBTC",
      depositor: W,
      status: "closed",
      deposit_raw: "0",
      deposited_raw: `9${E18}`,
      tx_count: 2,
    },
  ];
  const r = await readListingRows(W, signal());
  ebisuSp = [];
  assert.deepEqual(r.failed, []);
  const fork = r.rows.find((x) => x.family === "ebisu");
  assert.equal(fork.kind, "deposits");
  assert.equal(fork.chain, "ethereum");
  assert.equal(fork.positionId, `WBTC:${W}`);
  assert.equal(fork.href, `/ethereum/ebisu/stability-pool/WBTC/${W}`);
  assert.equal(fork.collateral.symbol, "ebUSD");
});

test("a listing that fails is named; the others' rows stand", async () => {
  v2sp = "fail";
  const r = await readListingRows(W, signal());
  assert.deepEqual(
    r.failed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
  assert.equal(r.rows.length, 3);
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
  assert.equal(r.rows.length, 3);
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
  assert.equal(s.total, 3);
  assert.equal(s.open, 3);
  assert.deepEqual(
    s.listingFailed.map((f) => f.what),
    ["Liquity V2 Stability Pool deposits"],
  );
});

test("counts: partial while a listing failed, and not kept; whole and kept after", async () => {
  v2sp = "fail";
  const first = await readWalletCounts(W);
  assert.deepEqual(first.partial, ["Liquity V2 Stability Pool deposits"]);
  assert.equal(first.total, 3);
  await new Promise((r) => setTimeout(r, 0));
  v2sp = "ok";
  calls = [];
  const second = await readWalletCounts(W);
  assert.ok(calls.length > 0, "a partial answer is read again");
  assert.equal(second.partial, undefined);
  assert.equal(second.total, 4);
  assert.deepEqual(
    second.families.map((f) => `${f.family}:${f.positions}`),
    ["liquity-v1:3", "liquity-v2:1"],
  );
  await new Promise((r) => setTimeout(r, 0));
  calls = [];
  await readWalletCounts(W);
  assert.equal(calls.length, 0, "a whole answer is kept");
});

// The deposit modules' head reads, the pool reader stubbed.
const { liquityV1DepositHead, liquityV2DepositHead } = await import("../../lib/wallet/families/liquity-listing.ts");

const depositPos = (kind, row) => ({
  chain: 1,
  family: kind === "liquity-v1-deposit" ? "liquity-v1" : "liquity-v2",
  familyName: "x",
  positionId: "d",
  href: "/x",
  status: "open",
  kind: "deposits",
  card: { kind, row },
  headRead: "none",
});
const v1Chain = (extra = {}) => ({
  depositor: W,
  blockNumber: 26462239,
  blockTimestamp: 0,
  compoundedRaw: `1000${E18}`,
  recordedRaw: `1100${E18}`,
  frontEnd: "0x0",
  ethGainRaw: `5${E18.slice(1)}`, // 0.5 ETH
  lqtyGainRaw: `2${E18}`,
  priceRaw: `3000${E18}`,
  priceStale: false,
  totalDepositsRaw: null,
  ...extra,
});
const v2Chain = (extra = {}) => ({
  branch: "WETH",
  depositor: W,
  blockNumber: 26462240,
  blockTimestamp: 0,
  compoundedRaw: `300${E18}`,
  recordedRaw: `310${E18}`,
  collGainRaw: `1${E18.slice(1)}`, // 0.1 WETH
  stashRaw: `2${E18.slice(1)}`, // 0.2 WETH
  yieldGainRaw: "0",
  priceRaw: `2000${E18}`,
  priceStale: false,
  totalDepositsRaw: null,
  ...extra,
});

test("V1 head: the deposit plus the ETH owed at the read's PriceFeed price, scaled; LQTY not valued", async () => {
  const head = liquityV1DepositHead(async () => v1Chain());
  const { positions } = await head([depositPos("liquity-v1-deposit", { depositor: W })]);
  const p = positions[0];
  assert.equal(p.headRead, "read");
  assert.equal(p.collateralUsd, 2500);
  assert.equal(p.readAtBlock, 26462239);
  assert.equal(p.card.head.blockNumber, 26462239);
  assert.deepEqual(
    p.usdParts.map((x) => [x.label, x.usd, x.source]),
    [
      ["deposit", 1000, "LUSD's $1 face"],
      ["ETH gain", 1500, "the Liquity V1 PriceFeed's fetchPrice at block 26,462,239"],
      ["LQTY", null, "not valued"],
    ],
  );
  assert.equal(p.usdSource, "LUSD's $1 face and the Liquity V1 PriceFeed's fetchPrice at block 26,462,239");
});

test("V2 head: the collateral gain and the stash at the branch PriceFeed price of the same read", async () => {
  const head = liquityV2DepositHead(async () => v2Chain());
  const { positions } = await head([depositPos("liquity-v2-deposit", { collateral_type: "WETH", depositor: W })]);
  const p = positions[0];
  // 300 BOLD + (0.1 + 0.2) WETH × 2000.
  assert.equal(Math.round(p.collateralUsd * 100) / 100, 900);
  assert.equal(p.usdParts[1].source, "the Liquity V2 WETH PriceFeed's fetchPrice at block 26,462,240");
});

test("a stale price is named as lastGoodPrice", async () => {
  const v1 = await liquityV1DepositHead(async () => v1Chain({ priceStale: true }))([
    depositPos("liquity-v1-deposit", { depositor: W }),
  ]);
  assert.match(v1.positions[0].usdParts[1].source, /lastGoodPrice at block/);
  const v2 = await liquityV2DepositHead(async () => v2Chain({ priceStale: true }))([
    depositPos("liquity-v2-deposit", { collateral_type: "WETH", depositor: W }),
  ]);
  assert.match(v2.positions[0].usdParts[1].source, /lastGoodPrice at block/);
});

test("a gain with no price, or a stale chain read, fails the deposit's head read", async () => {
  const noPrice = await liquityV2DepositHead(async () => v2Chain({ priceRaw: null }))([
    depositPos("liquity-v2-deposit", { collateral_type: "WETH", depositor: W }),
  ]);
  assert.equal(noPrice.positions[0].headRead, "failed");
  assert.equal(noPrice.positions[0].collateralUsd, undefined);
  const stale = await liquityV1DepositHead(async () => v1Chain({ chainStale: true }))([
    depositPos("liquity-v1-deposit", { depositor: W }),
  ]);
  assert.equal(stale.positions[0].headRead, "failed");
});

const { liquityV1StakeHead } = await import("../../lib/wallet/families/liquity-listing.ts");

test("V1 stake head: the LUSD fees at $1 and the ETH fees at the read's PriceFeed price; the LQTY not valued", async () => {
  const chain = (extra = {}) => ({
    staker: W,
    blockNumber: 26463047,
    blockTimestamp: 0,
    stakeRaw: `100${E18}`,
    lusdGainRaw: `2${E18}`,
    ethGainRaw: `1${E18.slice(3)}`, // 0.001 ETH
    totalStakedRaw: null,
    priceRaw: `3000${E18}`,
    priceStale: false,
    ...extra,
  });
  const pos = {
    chain: 1,
    family: "liquity-v1",
    familyName: "x",
    positionId: `stake:${W}`,
    href: "/x",
    status: "open",
    kind: "stakes",
    card: { kind: "liquity-v1-stake", row: { staker: W } },
    headRead: "none",
  };
  const { positions } = await liquityV1StakeHead(async () => chain())([pos]);
  const p = positions[0];
  assert.equal(p.headRead, "read");
  assert.equal(p.collateralUsd, 5);
  assert.deepEqual(
    p.usdParts.map((x) => [x.label, x.usd, x.source]),
    [
      ["LUSD fees", 2, "LUSD's $1 face"],
      ["ETH fees", 3, "the Liquity V1 PriceFeed's fetchPrice at block 26,463,047"],
      ["LQTY", null, "not valued"],
    ],
  );
  assert.equal(p.usdSource, "LUSD's $1 face and the Liquity V1 PriceFeed's fetchPrice at block 26,463,047");
  assert.equal(p.card.head.stakeRaw, `100${E18}`);
  const noPrice = await liquityV1StakeHead(async () => chain({ priceRaw: null }))([pos]);
  assert.equal(noPrice.positions[0].headRead, "failed");
});
