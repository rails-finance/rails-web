// The wallet read's families with no store, read at visit (rails-ops decision 0071, group 4;
// lib/wallet/families/visit.ts): Aave V3, Compound V3 and Morpho Blue on Optimism, Morpho Blue on
// Arc, each on while its explorer is launched; and Euler V2 on Arbitrum beside Base
// (lib/wallet/families/euler.ts). Each module's read, a failed read, no position, a module whose
// explorer is unlaunched making no call and drawing nothing, the shared limiter, and the reads
// starting only once the summary and listing reads have settled; the Optimism cards' receipts stating
// the collateral the total sums, an unpriced Comet with no health factor, and a narrowed read keeping
// every launched module's pill. The launch flags are flipped in
// memory on the roster's entries (protocolForSession), never in lib/shared/protocols.ts. The backend is a
// stubbed fetch; the modules import through `@/`, resolved as wallet-listing-reads.test.mjs does.
// Run: npm test
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
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";

const W = "0xb32cb14f2a5b17d1f1343749e302316be5133321";
const HEAD = { block: 159398857, time: 1794396491 };

// ── Fixtures: each explorer's wallet read, cut to one position ─────────────

const AAVE = {
  chainId: 10,
  head: HEAD,
  then: { block: 158082212, time: 1791763201 },
  provider: "optimism.gateway.tenderly.co",
  wallet: W,
  pool: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  oracle: "0xd81eb3728a631871a7ebbad631b5f424909f0c77",
  uiPoolDataProvider: "0x68100bd5345ea474d93577127c11f39ff8463e93",
  addressesProvider: "0xa97684ead0e402dc232d5a977953df7ecbab3cdb",
  account: {
    totalCollateralBase: "209760110169659",
    totalDebtBase: "80661260014283",
    availableBorrowsBase: "77749575185843",
    currentLiquidationThreshold: "7941",
    ltv: "7552",
    healthFactor: "2065318645528579441",
  },
  emode: null,
  emodeThen: 0,
  reserves: [
    {
      asset: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      id: 4,
      aToken: "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
      variableDebtToken: "0x0c84331e39d6658cd6e6b9ba04736cc4c4734351",
      configuration: "7237005577332262213973187317040823326737042680862827524912462693536075882304",
      liquidityRate: "11491774911008572539466594",
      variableBorrowRate: "18179257628101253881043118",
      scaledSupply: "101153302657292818385",
      scaledDebt: "155487213848006013",
      isCollateral: true,
      indexes: { income: "1058247745729097140191268612", debt: "1119033064499447314507595212" },
      price: "205688063737",
      priceSource: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
      past: null,
    },
  ],
};
const AAVE_EMPTY = {
  ...AAVE,
  reserves: AAVE.reserves.map((x) => ({ ...x, scaledSupply: "0", scaledDebt: "0" })),
};

const comet = (extra) => ({
  key: "usdc",
  label: "cUSDCv3",
  comet: "0x2e44e174f7d53f0212823acc11c01a11d58c5bcb",
  baseSymbol: "USDC",
  baseToken: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  baseDecimals: 6,
  quoteUnit: "USD",
  baseFeed: "0x16a9fa2fda030272ce99b29cf780dfa30361e0f3",
  basePrice: "100000000",
  supply: "0",
  borrow: "1000000000",
  principal: "-1000000000",
  isBorrowCollateralized: true,
  isLiquidatable: false,
  collateral: [
    {
      asset: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      scale: "1000000000000000000",
      priceFeed: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
      price: "200000000000",
      balance: "1000000000000000000",
      borrowCollateralFactor: "830000000000000000",
      liquidateCollateralFactor: "880000000000000000",
      liquidationFactor: "930000000000000000",
    },
  ],
  ...extra,
});
const COMPOUND = {
  chainId: 10,
  head: HEAD,
  provider: "optimism.gateway.tenderly.co",
  wallet: W,
  comets: [
    comet(),
    // A Comet the wallet holds nothing in draws nothing.
    comet({
      key: "usdt",
      label: "cUSDTv3",
      comet: "0x995e394b8b2437ac8ce61ee0bc610d617962b214",
      borrow: "0",
      principal: "0",
      collateral: [],
    }),
  ],
  ethUsd: null,
};

const MARKET_ID = "0x8e77af0efaf4a3d59f37126c77f6f0ee7b56bcb1363c0986b8f6087b93ba833e";
const MORPHO = {
  chainId: 10,
  head: HEAD,
  provider: "optimism.gateway.tenderly.co",
  wallet: W,
  list: { from: 130770075, keptTo: 159398857, toBlock: 159398857 },
  marketsRead: 40,
  positions: [
    {
      id: MARKET_ID,
      loanToken: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      collateralToken: "0x68f180fcce6836688e9084f035309e29bf0a2095",
      oracle: "0x78900c74cc6b50819f19a04acd561e94606137ac",
      irm: "0x8cd70a8f399428456b29546bc5dbe10ab6a06ef6",
      lltv: "860000000000000000",
      state: {
        totalSupplyAssets: "438916713206",
        totalSupplyShares: "422527799807233456",
        totalBorrowAssets: "380152918810",
        totalBorrowShares: "364056602443360623",
        lastUpdate: "1794396400",
        fee: "0",
      },
      borrowRate: "1976256180",
      rateAtTarget: "2033702600",
      price: "738597328643000000000000000000000000000",
      createdBlock: 130800000,
      createdTx: "0x",
      createdTime: 1735000000,
      position: { supplyShares: "0", borrowShares: "343252122114835888", collateral: "848555312" },
    },
  ],
  tokens: {
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": { symbol: "USDC", decimals: 6, name: "USD Coin" },
    "0x68f180fcce6836688e9084f035309e29bf0a2095": { symbol: "WBTC", decimals: 8, name: "Wrapped BTC" },
  },
  usdFeeds: [
    {
      token: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      feed: "0x16a9fa2fda030272ce99b29cf780dfa30361e0f3",
      name: "USDC__USD",
      description: "USDC / USD",
      decimals: 8,
      answer: "99971629",
      updatedAt: "1794339931",
      source: "chainlink",
    },
  ],
};

// ── The backend, by route ────────────────────────────────────────────────

const AT_BLOCK = {
  "/api/at-block/aave-v3-optimism/position": () => answers.aave,
  "/api/at-block/compound-v3-optimism/wallet": () => answers.compound,
  "/api/at-block/morpho-optimism/wallet": () => answers.morpho,
  "/api/at-block/morpho-arc/wallet": () => answers.morpho,
  "/api/at-block/euler/positions": () => answers.euler,
};
let answers;
const SESSIONS = ["aave-v3-optimism", "compound-v3-optimism", "morpho-optimism", "morpho-arc"];
const OPTIMISM = SESSIONS.slice(0, 3);
/** The sessions launched for a test; the others as protocols.ts has them. */
let launched = OPTIMISM;
const reset = (opts = {}) => {
  launched = opts.launched ?? OPTIMISM;
  for (const s of SESSIONS) {
    const e = protocolForSession(s);
    if (launched.includes(s)) delete e.unlaunched;
    else if (FLAGS[s]) e.unlaunched = true;
    else delete e.unlaunched;
  }
  answers = { aave: AAVE, compound: COMPOUND, morpho: MORPHO, euler: 502 };
  summaryDelay = 0;
};
let summaryDelay = 0;
/** Each request's start and end, in order, with its path. */
let events = [];
let urls = [];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const path = url.pathname;
  urls.push(url);
  events.push({ at: "start", path });
  const end = (res) => {
    events.push({ at: "end", path });
    return res;
  };
  if (/^\/api\/wallet\/[^/]+\/positions$/.test(path)) {
    await pause(summaryDelay);
    return end(json({ address: W, rows: [], total: 0, open: 0, closed: 0, limit: 500, offset: 0 }));
  }
  if (path === "/api/liquity-v1/positions") {
    await pause(summaryDelay);
    return end(json({ rows: [], total: 0, limit: 100, offset: 0 }));
  }
  if (/^\/api\/[a-z0-9-]+\/(stability-pool|staking)$/.test(path)) {
    await pause(summaryDelay);
    return end(json({ rows: [], pagination: { total: 0 } }));
  }
  const at = AT_BLOCK[path];
  if (at) {
    const a = at();
    return end(typeof a === "number" ? json({ error: "read_failed" }, a) : json(a));
  }
  return end(json({ error: `no stub for ${path}` }, 404));
};

const { protocolForSession } = await import("../../lib/shared/protocols.ts");
/** The flags as protocols.ts has them today. */
const FLAGS = Object.fromEntries(SESSIONS.map((s) => [s, protocolForSession(s)?.unlaunched === true]));
test.after(() => {
  for (const s of SESSIONS) {
    const e = protocolForSession(s);
    if (FLAGS[s]) e.unlaunched = true;
    else delete e.unlaunched;
  }
});

const { readWalletUncached, walletFamiliesLine, walletVisitLine, WALLET_VISIT_FAMILIES } = await import(
  "../../lib/wallet/read-wallet.ts"
);
const { readVisitFamilies } = await import("../../lib/wallet/families/visit.ts");
const { aaveV3Optimism, compoundV3Optimism } = await import("../../lib/wallet/families/optimism.ts");
const { morphoArc, morphoOptimism, morphoAtBlockModule } = await import("../../lib/wallet/families/morpho-at-block.ts");
const { MORPHO_ARC } = await import("../../lib/morpho-at-block/types.ts");
const { eulerV2Arbitrum, eulerV2Base } = await import("../../lib/wallet/families/euler.ts");
const { apiHop, API_CONCURRENCY } = await import("../../lib/wallet/api-hop.ts");
const { bufferFromHealth } = await import("../../lib/wallet/summary-row.ts");
const { opPosition } = await import("../../lib/aave-v3-optimism/position.ts");
const { opWalletSuppliedProv } = await import("../../lib/aave-v3-optimism/provenance.ts");
const { accountFigures } = await import("../../lib/compound-v3-optimism/position.ts");
const { opcWalletLentProv } = await import("../../lib/compound-v3-optimism/provenance.ts");

const atBlockCalls = () => urls.filter((u) => u.pathname.startsWith("/api/at-block/")).map((u) => u.pathname);

// ── Each module's read ───────────────────────────────────────────────────

test("Aave V3 Optimism: one account at Aave's oracle, its health factor and the head block", async () => {
  reset();
  const r = await readVisitFamilies([aaveV3Optimism], W, 2000);
  assert.deepEqual(r.failed, []);
  assert.equal(r.positions.length, 1);
  const p = r.positions[0];
  assert.equal(p.chain, 10);
  assert.equal(p.family, "aave-v3");
  assert.equal(p.href, `/optimism/aave-v3/${W}`);
  assert.equal(p.status, "open");
  assert.equal(p.kind, "loans");
  assert.equal(p.headRead, "read");
  assert.equal(p.readAtBlock, HEAD.block);
  assert.equal(p.readAt, HEAD.time);
  assert.equal(p.usdOwnOracle, true);
  assert.equal(p.card.kind, "aave-v3-optimism");
  assert.ok(p.collateralUsd > 200_000 && p.debtUsd > 300, "collateral and debt in dollars");
  assert.equal(p.riskFigure.label, "Health factor");
  assert.ok(Math.abs(p.buffer - (1 - 1 / 2.065318645528579)) < 1e-9, "buffer from the health factor");
  assert.equal(p.liquidatable, false);
  assert.ok(p.debtRate > 0.018 && p.debtRate < 0.0182, "the borrowed reserve's rate");
  assert.deepEqual(
    r.families.map((f) => [f.id, f.headRead, f.positions, f.reads]),
    [["aave-v3-optimism", "read", 1, 1]],
  );
});

test("Compound V3 Optimism: one position per Comet the wallet holds, at the Comet's prices", async () => {
  reset();
  const r = await readVisitFamilies([compoundV3Optimism], W, 2000);
  assert.equal(r.positions.length, 1, "the empty Comet draws nothing");
  const p = r.positions[0];
  assert.equal(p.market, "cUSDCv3");
  assert.equal(p.href, `/optimism/compound-v3/usdc/${W}`);
  assert.equal(p.collateralUsd, 2000);
  assert.equal(p.debtUsd, 1000);
  assert.equal(p.kind, "loans");
  // The liquidation line: 2000 × 0.88 ÷ 1000.
  assert.equal(p.riskFigure.value, "1.76 HF");
  assert.equal(p.card.read.comets.length, 1, "the card holds its Comet alone");
  assert.equal(p.card.read.comets[0].key, "usdc");
});

test("Morpho Blue Optimism: one position per market, dollars kept out of the tiles", async () => {
  reset();
  const r = await readVisitFamilies([morphoOptimism], W, 2000);
  assert.equal(r.positions.length, 1);
  const p = r.positions[0];
  assert.equal(p.family, "morpho");
  assert.equal(p.chain, 10);
  assert.equal(p.market, "USDC / WBTC");
  assert.equal(p.positionId, `optimism:${MARKET_ID}`);
  assert.equal(p.href, `/optimism/morpho/${W}/${MARKET_ID}`);
  assert.equal(p.usdOwnOracle, false);
  assert.match(p.usdSource, /Chainlink USD feed on Optimism/);
  assert.match(p.riskFigure.value, /% LTV$/);
  assert.equal(p.riskFigure.label, "LLTV 86.0%");
  assert.ok(p.buffer > 0 && p.buffer < 1);
  assert.deepEqual(p.card, { kind: "morpho-at-block", dep: "optimism", read: MORPHO });
  // The card crosses to the page: nothing in it a JSON answer cannot carry.
  assert.doesNotThrow(() => JSON.stringify(r.positions));
});

// ── The Optimism cards' receipts, and an unpriced Comet ─────────────────

const fig = (x) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

/** The receipt's "Collateral $X": as a row, and in its prose. */
const statedCollateral = (prov) => {
  const row = prov.inputs.find((x) => x.label === "Collateral");
  assert.ok(row, "a Collateral row");
  assert.ok(prov.summary.includes(`Collateral ${row.value}, `), "the prose states it");
  return row.value;
};

test("Aave V3 Optimism: Supplied's receipt states the collateral the wallet total sums", async () => {
  reset();
  // A borrower with its reserve as collateral, and a lender with the switch off.
  const lender = {
    ...AAVE,
    reserves: AAVE.reserves.map((x) => ({ ...x, scaledDebt: "0", isCollateral: false })),
  };
  for (const read of [AAVE, lender]) {
    answers.aave = read;
    const [row] = (await readVisitFamilies([aaveV3Optimism], W, 2000)).positions;
    const prov = opWalletSuppliedProv({ p: opPosition(read), r: read });
    assert.equal(statedCollateral(prov), `$${fig(row.collateralUsd)}`);
    assert.match(prov.summary, /^Supplied in USD\./, "the Supplied headline's receipt");
  }
  assert.equal(statedCollateral(opWalletSuppliedProv({ p: opPosition(lender), r: lender })), "$0");
});

test("Compound V3 Optimism: Lent's receipt states the collateral the wallet total sums", async () => {
  reset();
  const lender = comet({ supply: "1000000000", borrow: "0", principal: "1000000000" });
  answers.compound = { ...COMPOUND, comets: [lender] };
  const [row] = (await readVisitFamilies([compoundV3Optimism], W, 2000)).positions;
  assert.equal(row.kind, "deposits");
  assert.equal(row.collateralUsd, 2000, "the posted WETH, the lent USDC left out");
  const ctx = (a) => ({ a, f: accountFigures(a, null), head: HEAD, ethUsd: null });
  const prov = opcWalletLentProv(ctx(lender));
  assert.equal(statedCollateral(prov), "$2,000");
  assert.match(prov.summary, /^USDC lent in USD\./, "the Lent headline's receipt");
  // A lender with nothing posted states $0.
  const bare = comet({ supply: "1000000000", borrow: "0", principal: "1000000000", collateral: [] });
  assert.equal(statedCollateral(opcWalletLentProv(ctx(bare))), "$0");
});

test("Compound V3 Optimism: an unpriced collateral gives no health factor and no collateral figure", async () => {
  reset();
  const base = comet();
  const unpriced = comet({
    collateral: [
      ...base.collateral,
      { ...base.collateral[0], asset: "0x68f180fcce6836688e9084f035309e29bf0a2095", symbol: "WBTC", price: "0" },
    ],
  });
  answers.compound = { ...COMPOUND, comets: [unpriced] };
  const [row] = (await readVisitFamilies([compoundV3Optimism], W, 2000)).positions;
  assert.equal(row.riskFigure, undefined, "no health factor");
  assert.equal(row.buffer, bufferFromHealth(null));
  assert.equal(row.collateralUsd, undefined);
  assert.equal(row.debtUsd, 1000);
  // The receipt states no collateral the total does not sum.
  const prov = opcWalletLentProv({ a: unpriced, f: accountFigures(unpriced, null), head: HEAD, ethUsd: null });
  assert.equal(
    prov.inputs.some((x) => x.label === "Collateral"),
    false,
  );
});

// ── A failed read, and no position ───────────────────────────────────────

test("a read that fails is named as a listing read is, and draws nothing", async () => {
  reset();
  answers.compound = 502;
  const r = await readVisitFamilies([aaveV3Optimism, compoundV3Optimism], W, 2000);
  assert.deepEqual(r.failed, ["Compound V3 on Optimism"]);
  assert.deepEqual(
    r.positions.map((p) => p.family),
    ["aave-v3"],
  );
  const f = r.families.find((x) => x.id === "compound-v3-optimism");
  assert.equal(f.headRead, "failed");
  assert.deepEqual(f.unanswered, { family: "compound-v3", what: "Compound V3 on Optimism" });
  assert.match(f.error, /answered 502/);
});

test("an answer outside the route's shape fails the read", async () => {
  reset();
  answers.morpho = { nothing: true };
  const r = await readVisitFamilies([morphoOptimism], W, 2000);
  assert.deepEqual(r.failed, ["Morpho Blue on Optimism"]);
});

test("a wallet holding nothing on a family draws no section and names no failure", async () => {
  reset();
  answers.aave = AAVE_EMPTY;
  answers.compound = { ...COMPOUND, comets: [COMPOUND.comets[1]] };
  answers.morpho = { ...MORPHO, positions: [] };
  const r = await readVisitFamilies([aaveV3Optimism, compoundV3Optimism, morphoOptimism], W, 2000);
  assert.deepEqual(r, { positions: [], families: [], failed: [] });
});

// ── Each module behind its explorer's launch flag ────────────────────────

test("with today's flags every module is off", () => {
  for (const s of SESSIONS) assert.equal(FLAGS[s], true, `${s} is unlaunched in protocols.ts`);
  reset({ launched: [] });
  assert.deepEqual(
    WALLET_VISIT_FAMILIES.map((m) => [m.id, m.on]),
    SESSIONS.map((s) => [s, false]),
  );
});

test("each module turns on when its explorer's flag flips, and no other does", () => {
  for (const s of SESSIONS) {
    reset({ launched: [s] });
    assert.deepEqual(
      WALLET_VISIT_FAMILIES.filter((m) => m.on).map((m) => m.id),
      [s],
    );
  }
  assert.deepEqual([aaveV3Optimism.id, compoundV3Optimism.id, morphoOptimism.id, morphoArc.id], SESSIONS);
});

test("a module that is off makes no call and leaves the page: totals, sections, counts, pills", async () => {
  reset({ launched: [] });
  urls = [];
  const read = await readWalletUncached(W);
  assert.deepEqual(atBlockCalls(), []);
  assert.deepEqual(read.positions, []);
  assert.deepEqual(read.families, []);
  assert.deepEqual(read.held, []);
  assert.equal(read.total, 0);
  assert.equal(read.partial, undefined);
  // One launched: that family alone joins the page.
  reset({ launched: ["compound-v3-optimism"] });
  urls = [];
  const one = await readWalletUncached(W);
  assert.deepEqual(atBlockCalls(), ["/api/at-block/compound-v3-optimism/wallet"]);
  assert.deepEqual(
    one.positions.map((p) => p.family),
    ["compound-v3"],
  );
  assert.deepEqual(
    one.held.map((h) => h.slug),
    ["compound-v3"],
  );
  assert.equal(one.total, 1);
});

test("Morpho Arc follows morpho-arc's flag; built and working once on", async () => {
  reset();
  assert.equal(morphoArc.on, false);
  urls = [];
  const off = await readVisitFamilies([morphoAtBlockModule(MORPHO_ARC, false)], W, 2000);
  assert.deepEqual(off, { positions: [], families: [], failed: [] });
  assert.deepEqual(atBlockCalls(), []);
  // Built and working once on: the Arc route, the Arc pages.
  const on = await readVisitFamilies([morphoAtBlockModule(MORPHO_ARC, true)], W, 2000);
  assert.deepEqual(atBlockCalls(), ["/api/at-block/morpho-arc/wallet"]);
  assert.equal(on.positions[0].chain, 5042);
  assert.equal(on.positions[0].href, `/arc/morpho/${W}/${MARKET_ID}`);
  assert.equal(on.positions[0].card.dep, "arc");
});

test("the wallet read calls each launched route once per visit, Arc only once launched", async () => {
  reset();
  urls = [];
  await readWalletUncached(W);
  let calls = atBlockCalls();
  assert.equal(calls.includes("/api/at-block/morpho-arc/wallet"), false);
  reset({ launched: SESSIONS });
  urls = [];
  await readWalletUncached(W);
  calls = atBlockCalls();
  assert.equal(calls.filter((c) => c === "/api/at-block/morpho-arc/wallet").length, 1);
  for (const p of [
    "/api/at-block/aave-v3-optimism/position",
    "/api/at-block/compound-v3-optimism/wallet",
    "/api/at-block/morpho-optimism/wallet",
  ])
    assert.equal(calls.filter((c) => c === p).length, 1, `${p} once per visit`);
});

// ── The limiter and the ordering ─────────────────────────────────────────

test("the reads queue behind the wallet read's limiter (apiHop)", async () => {
  reset();
  urls = [];
  const held = [];
  const holds = Array.from({ length: API_CONCURRENCY }, () =>
    apiHop(() => new Promise((resolve) => held.push(resolve))),
  );
  const read = readVisitFamilies([aaveV3Optimism], W, 2000);
  await pause(20);
  assert.deepEqual(atBlockCalls(), [], "no slot, no call");
  held.forEach((r) => r());
  await Promise.all(holds);
  const r = await read;
  assert.deepEqual(atBlockCalls(), ["/api/at-block/aave-v3-optimism/position"]);
  assert.equal(r.positions.length, 1);
});

test("the reads start only once the summary and the listing reads have settled", async () => {
  reset();
  summaryDelay = 40;
  events = [];
  await readWalletUncached(W);
  const firstVisit = events.findIndex((e) => e.at === "start" && e.path.startsWith("/api/at-block/"));
  assert.ok(firstVisit > 0, "a read at visit was made");
  const lastSummaryEnd = events.findLastIndex((e) => e.at === "end" && !e.path.startsWith("/api/at-block/"));
  assert.ok(lastSummaryEnd >= 0);
  assert.ok(firstVisit > lastSummaryEnd, "every summary and listing request ended before the first read at visit");
});

// ── The page's answer ────────────────────────────────────────────────────

test("the wallet read: the positions join the page's, count in its total and name their protocols", async () => {
  reset();
  const read = await readWalletUncached(W);
  assert.equal(read.error, undefined);
  assert.equal(read.partial, undefined);
  assert.deepEqual(read.positions.map((p) => `${p.family}:${p.chain}`).sort(), [
    "aave-v3:10",
    "compound-v3:10",
    "morpho:10",
  ]);
  assert.equal(read.total, 3);
  assert.deepEqual(
    read.held.map((h) => [h.slug, h.positions]),
    [
      ["aave-v3", 1],
      ["compound-v3", 1],
      ["morpho", 1],
    ],
  );
});

test("the wallet read: a failed read leaves the answer partial and names its family", async () => {
  reset();
  answers.aave = 503;
  const read = await readWalletUncached(W);
  assert.deepEqual(read.partial, ["Aave V3 on Optimism"]);
  const f = read.families.find((x) => x.id === "aave-v3-optimism");
  assert.deepEqual(f.unanswered, { family: "aave-v3", what: "Aave V3 on Optimism" });
  assert.equal(read.total, 2);
});

test("one protocol chosen: every launched module is read for the pills, and only its positions are drawn", async () => {
  reset();
  urls = [];
  const read = await readWalletUncached(W, undefined, { protocol: "compound-v3" });
  assert.deepEqual(atBlockCalls().sort(), [
    "/api/at-block/aave-v3-optimism/position",
    "/api/at-block/compound-v3-optimism/wallet",
    "/api/at-block/morpho-optimism/wallet",
  ]);
  assert.deepEqual(
    read.held.map((h) => [h.slug, h.positions]),
    [
      ["aave-v3", 1],
      ["compound-v3", 1],
      ["morpho", 1],
    ],
    "the other launched modules keep their pills",
  );
  assert.deepEqual(
    read.positions.map((p) => p.family),
    ["compound-v3"],
  );
  assert.deepEqual(
    read.families.map((f) => f.id),
    ["compound-v3-optimism"],
  );
  assert.equal(read.total, 1);
  assert.equal(read.protocol, "compound-v3");
});

// ── The empty state's lines ──────────────────────────────────────────────

test("the empty state names the launched families read at visit by chain, and none while none is", () => {
  assert.deepEqual(
    WALLET_VISIT_FAMILIES.map((m) => m.id),
    SESSIONS,
  );
  reset({ launched: [] });
  assert.equal(walletVisitLine(), "");
  reset({ launched: ["aave-v3-optimism", "morpho-optimism"] });
  assert.equal(walletVisitLine(), "Aave V3 and Morpho Blue on Optimism");
  reset();
  assert.equal(walletVisitLine(), "Aave V3, Compound V3 and Morpho Blue on Optimism");
  reset({ launched: SESSIONS });
  assert.equal(walletVisitLine(), "Aave V3, Compound V3 and Morpho Blue on Optimism; Morpho Blue on Arc");
  const line = walletFamiliesLine();
  assert.match(line, /Aave V3, Compound V3 and Morpho Blue on Arbitrum once the wallet has been opened there/);
  assert.match(line, /; Euler V2 on Arbitrum(;|$)/);
  assert.match(line, /Euler V2[^;]* on Base/);
});

// ── Euler V2 on Arbitrum ─────────────────────────────────────────────────

const eulerRow = (chain) => ({
  chain,
  family: "euler-v2",
  positionId: `${W}-0xvault`,
  owner: W,
  market: "0xvault",
  status: "open",
  collateral: null,
  debt: null,
  collateralUsd: null,
  debtUsd: null,
  usdSource: null,
  peakCollateral: null,
  peakDebt: null,
  openedAt: null,
  closedAt: null,
  lastActivityAt: null,
  txCount: 1,
  liquidationCount: 0,
  readBlock: 1,
  readAt: null,
  href: `/${chain}/euler-v2/${W}`,
  card: { account: W, index: 0, vault: "0xvault", shares: "1", collateral: false, controller: false },
  writtenAt: "2026-11-24T00:00:00Z",
});

test("Euler V2: the Arbitrum module takes Arbitrum's rows, reads chain 42161, and Base keeps 8453", async () => {
  reset();
  assert.equal(eulerV2Arbitrum.summaryChain, "arbitrum");
  assert.equal(eulerV2Arbitrum.id, "euler-v2-arbitrum");
  assert.equal(eulerV2Base.id, "euler-v2-base");
  const [p] = await eulerV2Arbitrum.shape([eulerRow("arbitrum")]);
  assert.equal(p.chain, 42161);
  assert.equal(p.card.kind, "euler-v2");
  for (const [m, chain] of [
    [eulerV2Arbitrum, "42161"],
    [eulerV2Base, "8453"],
  ]) {
    urls = [];
    await assert.rejects(m.head([p], W, new AbortController().signal, 1000, { rows: [] }), /answered with no read/);
    const u = urls.find((x) => x.pathname === "/api/at-block/euler/positions");
    assert.equal(u.searchParams.get("chain"), chain);
  }
});

test("Euler V2 on Arbitrum is safe with no rows: no read, no family", async () => {
  reset();
  urls = [];
  const read = await readWalletUncached(W);
  assert.equal(
    urls.some((u) => u.pathname === "/api/at-block/euler/positions"),
    false,
  );
  assert.equal(
    read.families.some((f) => f.id.startsWith("euler")),
    false,
  );
});
