// lib/aerodrome/position.ts and words.ts against hand-made reads in the shape
// of rails-server's Aerodrome at-block route (rails-ops ui-jobs 566), and the
// claimable check against three positions read on Base on 10 Nov 2026.
// Run: npm test
//
// The modules import Uniswap's math by extensionless relative specifier, so
// this file registers a resolver that adds the `.ts` before loading them.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { aeroPosition, claimableWei, penaltyNow, aeroInQuote, legPrice, poolAside, floorOf } = await import(
  "../../lib/aerodrome/position.ts"
);
const { readoutTable, readoutExplainer, cardExplainer, STAKED_EARNS } = await import("../../lib/aerodrome/words.ts");

/** The table's rows by key, per group. */
const rows = (p) => {
  const t = readoutTable(p);
  const [pos, pool] = t.groups.length === 2 ? t.groups : [null, t.groups[0]];
  return {
    yours: Object.fromEntries((pos?.rows ?? []).map((r) => [r.key, r])),
    pool: Object.fromEntries(pool.rows.map((r) => [r.key, r])),
  };
};
/** The reading contract on the words: every cell a figure or a single word, a note of eight words at
 *  most, a label of one to three words with no punctuation (rails-ops standards/reading-contract.md). */
function assertContract(table) {
  for (const g of table.groups)
    for (const r of g.rows) {
      for (const x of [r.then, r.now]) if (x) assert.doesNotMatch(x, /\.$|, | \w+ \w+ /, `${r.label}: ${x}`);
      assert.ok(r.label.split(" ").length <= 3, r.label);
      assert.doesNotMatch(r.label, /[,.:;()]/, r.label);
      if (r.note) {
        assert.ok(r.note.split(" ").length <= 8, r.note);
        assert.doesNotMatch(r.note, /\.$|^[A-Z]/, r.note);
      }
    }
}
const flat = (groups) =>
  groups.flatMap((g) => g.bullets.map((b) => b.map((x) => (typeof x === "string" ? x : x.fig)).join("")));

const Q128 = BigInt(2) ** BigInt(128);
const E18 = BigInt(10) ** BigInt(18);
const sqrtX96 = (tick) => BigInt(Math.round(Math.sqrt(Math.pow(1.0001, tick)) * 2 ** 96)).toString();
const DAY = 86_400;
const HEAD = { block: 55_693_003, time: 1_794_328_976 };
const THEN = { block: 52_443_727, time: 1_791_676_801 };

const WETH = { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 };
const USDC = { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 };
const AERO = { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO", decimals: 18 };
const CBBTC = { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", decimals: 8 };
const USDT = { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", symbol: "USDT", decimals: 6 };

/** AERO/USDC at 0.5 USDC, AERO/WETH at 0.0002 WETH (AERO token1 in both). */
const LEGS = {
  usdc: {
    pool: "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d",
    kind: "v2-volatile",
    token0: USDC.address,
    token1: AERO.address,
    now: { reserve0: (BigInt(2_000_000) * BigInt(1e6)).toString(), reserve1: (BigInt(4_000_000) * E18).toString() },
    then: null,
  },
  weth: {
    pool: "0x7f670f78B17dEC44d5Ef68a48740b6f8849cc2e6",
    kind: "v2-volatile",
    token0: WETH.address,
    token1: AERO.address,
    now: { reserve0: (BigInt(200) * E18).toString(), reserve1: (BigInt(1_000_000) * E18).toString() },
    then: null,
  },
};

function poolRead(tick, over = {}) {
  return {
    sqrtPriceX96: sqrtX96(tick),
    tick,
    activeLiquidity: (BigInt(10) ** BigInt(20)).toString(),
    feeGrowthGlobal0X128: "0",
    feeGrowthGlobal1X128: "0",
    feeGrowthInside0X128: "0",
    feeGrowthInside1X128: "0",
    positionFeeGrowthInside0LastX128: "0",
    positionFeeGrowthInside1LastX128: "0",
    tokensOwed0: "0",
    tokensOwed1: "0",
    balance0: "1000000000000000000000",
    balance1: "2000000000000",
    lpFee: 500,
    unstakedFee: 100_000,
    stakedLiquidity: (BigInt(6) * BigInt(10) ** BigInt(19)).toString(),
    rewardGrowthGlobalX128: "0",
    rewardGrowthInsideX128: "0",
    rewardRate: "1000000000000000000",
    ...over,
  };
}

const L = BigInt(10) ** BigInt(15);

/** WETH/USDC near 3,000 USDC per WETH (tick −196,256), in range, unstaked at both reads. */
function unstaked(over = {}) {
  return {
    chainId: 8453,
    deployment: "initial",
    nfpm: "0x827922686190790b37229fd06084350E74485b72",
    id: "79368300",
    head: HEAD,
    then: THEN,
    provider: "test",
    owner: "0x00000000000000000000000000000000000000aa",
    pool: "0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59",
    token0: WETH,
    token1: USDC,
    fee: 500,
    tickSpacing: 100,
    tickLower: -197000,
    tickUpper: -195500,
    liquidity: L.toString(),
    now: poolRead(-196256, {
      feeGrowthInside0X128: (Q128 * BigInt(3)).toString(),
      feeGrowthInside1X128: (Q128 * BigInt(9000)).toString(),
      positionFeeGrowthInside0LastX128: (Q128 * BigInt(2)).toString(),
      positionFeeGrowthInside1LastX128: (Q128 * BigInt(6000)).toString(),
      tokensOwed1: "1000000",
    }),
    past: { ...poolRead(-196000), positionLiquidity: L.toString() },
    opened: null,
    daily: Array.from({ length: 30 }, (_, k) => ({
      block: HEAD.block - k * 432_000,
      time: HEAD.time - k * DAY,
      tick: -196300,
      positionLiquidity: L.toString(),
    })),
    staked: null,
    stakedThen: false,
    aero: LEGS,
    ...over,
  };
}

/** The same position staked in its gauge at both reads; 3 AERO a unit of liquidity over the window. */
function staked(over = {}, stakedOver = {}) {
  const base = unstaked();
  return {
    ...base,
    owner: "0xF33a96b5932D9E9B9A0eDA447AbD8C9d48d2e0c8",
    now: { ...base.now, rewardGrowthInsideX128: ((Q128 * BigInt(5) * E18) / L).toString() },
    past: { ...base.past, rewardGrowthInsideX128: ((Q128 * BigInt(2) * E18) / L).toString() },
    staked: {
      gauge: "0xF33a96b5932D9E9B9A0eDA447AbD8C9d48d2e0c8",
      depositor: "0xcc9aecfFC96431304d0d379A3576Ca4903cdAf44",
      depositTimestamp: null,
      earned: null,
      rewards: "0",
      rewardGrowthInsideLastX128: ((Q128 * BigInt(4) * E18) / L).toString(),
      penaltyBps: null,
      minStakeSeconds: null,
      ...stakedOver,
    },
    stakedThen: true,
    ...over,
  };
}

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test("an unstaked position: fees over the window and uncollected at the head, as V3", () => {
  const p = aeroPosition(unstaked());
  assert.equal(p.staked, false);
  assert.equal(p.window.kind, "whole");
  assert.equal(p.aero, null);
  // L × Δ inside / 2^128: 1e15 × 1 WETH-wei and 1e15 × 3000 USDC-wei over the window.
  close(p.fees30dAmounts.base, (1e15 * 3) / 1e18);
  close(p.fees30dAmounts.quote, (1e15 * 9000) / 1e6);
  close(p.fees30d, p.fees30dAmounts.base * p.price + p.fees30dAmounts.quote);
  // tokensOwed + L × (inside − last): 1e15 × 1 WETH-wei and 1 USDC + 1e15 × 3000 USDC-wei.
  close(p.uncollectedAmounts.base, 1e15 / 1e18);
  close(p.uncollectedAmounts.quote, 1 + (1e15 * 3000) / 1e6);
  assert.equal(p.holder, "0x00000000000000000000000000000000000000aa");
  // Its share is of the unstaked liquidity in range: 1e15 of (1e20 − 6e19).
  close(p.shareOfPaying, 1e15 / 4e19);
  const table = readoutTable(p);
  assertContract(table);
  const { yours, pool } = rows(p);
  assert.equal(yours.earned.label, "Swap fees");
  assert.match(yours.earned.now, /^[\d,.]+ (bn )?USDC$/);
  assert.equal(yours.share.label, "Unstaked liquidity share");
  assert.equal(pool.swapFee.now, "0.05%");
  assert.equal(pool.protocolFee.now, "10%");
  assert.ok(
    flat(readoutExplainer(p)).includes(
      "Protocol fee: the share of an unstaked position's fees the pool's voters take.",
    ),
  );
  assert.ok(flat(cardExplainer(p)).some((b) => b.startsWith("Uncollected fees come to ")));
});

test("a staked position: AERO over the window, priced through the leg matching the quote", () => {
  const p = aeroPosition(staked());
  assert.equal(p.staked, true);
  assert.equal(p.holder, "0xcc9aecfFC96431304d0d379A3576Ca4903cdAf44");
  assert.equal(p.uncollected, null);
  assert.equal(p.fees30d, null);
  // L × (5 − 2) × 1e18 / L per unit = 3 AERO.
  close(p.aero.earned30d, 3);
  assert.equal(p.aeroPrice.route.via, "usdc-leg");
  close(p.aeroPrice.price, 0.5);
  close(p.aero.earned30dValue, 1.5);
  // No depositor's earned(): the arithmetic, rewards + L × (5 − 4) per unit = 1 AERO.
  assert.equal(p.aero.claimableFrom, "arithmetic");
  close(p.aero.claimable, 1);
  close(p.shareOfPaying, 1e15 / 6e19);
  const { yours, pool } = rows(p);
  assert.equal(yours.earned.label, "AERO rewards");
  assert.equal(yours.earned.now, "3 AERO");
  assert.equal(yours.earned.note, "worth 1.5 USDC now");
  assert.equal(yours.withEarned.label, "With AERO");
  assert.equal(yours.share.label, "Staked liquidity share");
  assert.equal(yours.penalty, undefined);
  assertContract(readoutTable(p));
  assert.equal(flat(readoutExplainer(p)).filter((b) => b === STAKED_EARNS).length, 1);
  assert.ok(flat(cardExplainer(p)).includes("The wallet that staked it can claim 1 AERO now."));
  // The unstaked fee is not the staked holder's.
  assert.equal(pool.protocolFee, undefined);
});

test("claimable equals the gauge's earned() to the wei, on three positions read on Base", () => {
  const reads = [
    // initial #47,308,849, caps #5,237,362, gv3 #8,098,027 (its penalty window long past).
    [
      "904877546847385",
      "0",
      "718394437190846704971639261277389702786711149",
      "696691105503821507145409775562802298907498884",
      null,
      "57713415223579275434",
    ],
    [
      "55080785606375396954",
      "0",
      "8019948290057993715253884887825174404",
      "904779872014565961120374291829404075",
      null,
      "1151717233348620067",
    ],
    [
      "21223771694512023819",
      "0",
      "144681639461883992699929603047018326862",
      "64170341801413770860898788803765298379",
      null,
      "5021574922722144601",
    ],
  ];
  for (const [l, rewards, now, last, bps, earned] of reads)
    assert.equal(claimableWei(BigInt(l), rewards, now, last, bps).toString(), earned);
  // And the page takes earned() where a depositor was found.
  const p = aeroPosition(staked({}, { earned: "1000000000000000000" }));
  assert.equal(p.aero.claimableFrom, "earned");
  close(p.aero.claimable, 1);
});

test("the early-unstake penalty applies only inside the minimum stake, and is shown only then", () => {
  const s = { depositTimestamp: HEAD.time - 10, penaltyBps: 10_000, minStakeSeconds: 30 };
  assert.deepEqual(penaltyNow(s, HEAD.time), { bps: 10_000, until: HEAD.time + 20 });
  assert.equal(penaltyNow({ ...s, depositTimestamp: HEAD.time - 31 }, HEAD.time), null);
  assert.equal(penaltyNow({ ...s, penaltyBps: null }, HEAD.time), null);
  // 50% of 2 AERO gross.
  assert.equal(claimableWei(BigInt(1), "2000000000000000000", "0", "0", 5000).toString(), "1000000000000000000");

  const inside = aeroPosition(staked({}, s));
  assert.ok(inside.aero.penalty);
  close(inside.aero.claimable, 0); // all of the 1 AERO is forfeit
  const row = rows(inside).yours.penalty;
  assert.equal(row.now, "All");
  assert.match(row.note, /^until \d+ \w+ 2026, \d\d:\d\d UTC$/);
  assert.ok(
    flat(readoutExplainer(inside)).some((b) =>
      /^Claiming or unstaking before .* gives up all of the AERO to claim\.$/.test(b),
    ),
  );
  const past = aeroPosition(staked({}, { ...s, depositTimestamp: HEAD.time - 3600 }));
  assert.equal(past.aero.penalty, null);
  assert.equal(rows(past).yours.penalty, undefined);
  assert.equal(
    flat(readoutExplainer(past)).some((b) => /Claiming or unstaking before/.test(b)),
    false,
  );
});

test("AERO's price legs: the matching leg, the pool itself, through WETH, through USDC, or none", () => {
  close(legPrice(LEGS.usdc, 6), 0.5);
  close(legPrice(LEGS.weth, 18), 0.0002);
  const r = { aero: LEGS };
  assert.equal(aeroInQuote(r, CBBTC, USDC, 90_000).route.via, "usdc-leg");
  const w = aeroInQuote(r, CBBTC, WETH, 30);
  assert.equal(w.route.via, "weth-leg");
  close(w.price, 0.0002);
  assert.deepEqual(aeroInQuote(r, WETH, AERO, 5000), { price: 1, route: { via: "is-quote" } });
  assert.deepEqual(aeroInQuote(r, AERO, CBBTC, 0.00001), { price: 0.00001, route: { via: "pool" } });
  // WETH/USDT: AERO in WETH, then the pool's USDT per WETH.
  const t = aeroInQuote(r, WETH, USDT, 3000);
  assert.equal(t.route.via, "weth-then-pool");
  close(t.price, 0.6);
  const u = aeroInQuote(r, USDC, USDT, 1.001);
  assert.equal(u.route.via, "usdc-then-pool");
  close(u.price, 0.5005);
  const none = aeroInQuote(r, { ...CBBTC, symbol: "X", address: "0x1" }, { ...CBBTC, symbol: "Y", address: "0x2" }, 2);
  assert.deepEqual(none, { price: null, route: { via: "none" } });
});

test("the set-aside rule: empty, young, thin at either read, above 10%", () => {
  const big = { now: 100, then: 100 };
  assert.equal(floorOf(WETH), 20);
  assert.equal(floorOf(USDC), 50_000);
  assert.equal(floorOf(CBBTC), null);
  assert.deepEqual(poolAside({ now: BigInt(0), then: BigInt(1) }, big, 20, 0.01), { kind: "empty" });
  assert.deepEqual(poolAside({ now: BigInt(1), then: null }, big, 20, 0.01), { kind: "young" });
  assert.deepEqual(poolAside({ now: BigInt(1), then: BigInt(1) }, { now: 10, then: 100 }, 20, 0.01), {
    kind: "thin",
    floor: 20,
    at: "now",
  });
  assert.deepEqual(poolAside({ now: BigInt(1), then: BigInt(1) }, { now: 100, then: 10 }, 20, 0.01), {
    kind: "thin",
    floor: 20,
    at: "then",
  });
  assert.deepEqual(poolAside({ now: BigInt(1), then: BigInt(1) }, big, 20, 0.11), { kind: "spike" });
  assert.equal(poolAside({ now: BigInt(1), then: BigInt(1) }, big, 20, 0.09), null);
  // No floor for a quote with none: only the spike test stands.
  assert.equal(poolAside({ now: BigInt(1), then: BigInt(1) }, { now: 1, then: 1 }, null, 0.09), null);

  // On a page: 4e19 of unstaked liquidity near 3,000 USDC holds far more than 50,000 USDC, and the
  // staked side's AERO (rewardRate-fed growth) is worked over 6e19 of staked liquidity.
  const r = unstaked();
  r.now.rewardGrowthGlobalX128 = ((Q128 * E18) / BigInt(10) ** BigInt(12)).toString();
  const p = aeroPosition(r);
  assert.equal(p.pool30d.unstakedLiquidity.now, BigInt(4) * BigInt(10) ** BigInt(19));
  assert.equal(p.pool30d.feesAside, null);
  assert.ok(p.pool30d.fullRangeAero > 0);
  // A pool whose staked liquidity was thin a month ago has its AERO figure set aside.
  const thin = unstaked();
  thin.past.stakedLiquidity = "1000";
  const q = aeroPosition(thin);
  assert.equal(q.pool30d.aeroAside.kind, "thin");
  assert.equal(rows(q).pool.fullRangeReward.now, "—");
  assert.equal(rows(q).pool.fullRangeReward.note, "under 50,000 USDC staked in range then");
  assert.ok(
    flat(readoutExplainer(q)).some((b) =>
      /AERO figure for a staked position is set aside: under 50,000 USDC of staked liquidity in range 30 days ago/.test(
        b,
      ),
    ),
  );
});

test("staked partway through the window: no figure, and the reason", () => {
  const then = aeroPosition(staked({ stakedThen: false }, { depositTimestamp: HEAD.time - 5 * DAY }));
  assert.equal(then.window.kind, "staked-inside");
  assert.equal(then.aero.earned30d, null);
  assert.equal(then.againstHoldingWithEarnings, null);
  assert.equal(rows(then).yours.earned.now, "—");
  assert.equal(rows(then).yours.earned.note, "staked inside the 30 days");
  assert.ok(
    flat(readoutExplainer(then)).some((b) =>
      /^Staked on \d+ \w+ 2026, inside the window; no read was taken that day, so it has no 30-day AERO figure\.$/.test(
        b,
      ),
    ),
  );
  // Claimable now still stands, on the card.
  assert.ok(flat(cardExplainer(then)).includes("The wallet that staked it can claim 1 AERO now."));

  const off = aeroPosition(unstaked({ stakedThen: true }));
  assert.equal(off.window.kind, "unstaked-inside");
  assert.equal(off.fees30d, null);
  assert.ok(off.uncollected > 0);
  assert.equal(rows(off).yours.earned.note, "left the gauge inside the 30 days");
  assert.ok(flat(readoutExplainer(off)).some((b) => /left the gauge inside the window/.test(b)));
});

test("minted inside the window: the daily reads are clipped to the days it existed", () => {
  const r = unstaked({ stakedThen: null });
  r.past.positionLiquidity = null;
  r.daily = r.daily.map((d, k) => (k >= 10 ? { ...d, positionLiquidity: null } : d));
  const p = aeroPosition(r);
  assert.equal(p.window.kind, "minted");
  assert.equal(p.window.firstSeen, HEAD.time - 9 * DAY);
  assert.equal(p.daysInRange.read, 10);
  assert.equal(p.fees30d, null);
  assert.equal(p.againstHolding, null);
  const { yours } = rows(p);
  assert.equal(yours.days.now, "10 of 10");
  assert.equal(yours.days.note, "one read a day since minted");
  assert.match(yours.earned.note, /^first figure on \d+ \w+ 2026$/);
  assert.equal(yours["token:0"].note, "minted inside the 30 days");
  assert.ok(flat(readoutExplainer(p)).some((b) => /^Minted inside the window and first read on/.test(b)));
  assertContract(readoutTable(p));
});

test("no em dash, no restricted words, sentence case on every face string", () => {
  for (const r of [
    unstaked(),
    staked(),
    staked({}, { depositTimestamp: HEAD.time - 1, penaltyBps: 10_000, minStakeSeconds: 30 }),
  ]) {
    const p = aeroPosition(r);
    // The table's empty cells are "—" by the reading contract; its labels and notes are words.
    const words = [
      ...readoutTable(p).groups.flatMap((g) => [g.title, ...g.rows.flatMap((r) => [r.label, r.note])]),
      ...readoutExplainer(p).flatMap((g) => [g.title, ...g.bullets.flat()]),
      ...cardExplainer(p).flatMap((g) => [g.title, ...g.bullets.flat()]),
    ]
      .filter(Boolean)
      .map((s) => (typeof s === "string" ? s : s.fig))
      .join("\n");
    assert.doesNotMatch(words, /—/);
    assert.doesNotMatch(words, /\b(fold|footgun|honest|itself|actually|exactly)\b/i);
  }
});

// ── Velodrome on Optimism: the same modules on Velodrome's site (lib/aerodrome/sites.ts, ui-jobs 578) ──
const { VELODROME, AERODROME, siteOf } = await import("../../lib/aerodrome/sites.ts");
const { notIndexed, frontDoorWords, cardWords, POSITION_PAGE } = await import("../../lib/aerodrome/words.ts");
const OP_USDC = { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6 };
const VELO = { address: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", symbol: "VELO", decimals: 18 };
/** VELO/USDC at 0.025 USDC and VELO/WETH at 0.00001 WETH, VELO token1 in both, as on chain. */
const VELO_LEGS = {
  usdc: {
    ...LEGS.usdc,
    pool: VELODROME.rewardPools.usdc,
    token0: OP_USDC.address,
    token1: VELO.address,
    now: { reserve0: (BigInt(50_000) * BigInt(1e6)).toString(), reserve1: (BigInt(2_000_000) * E18).toString() },
  },
  weth: {
    ...LEGS.weth,
    pool: VELODROME.rewardPools.weth,
    token1: VELO.address,
    now: { reserve0: (BigInt(10) * E18).toString(), reserve1: (BigInt(1_000_000) * E18).toString() },
  },
};
/** The staked position on Optimism: no depositor and no earned(), as rails-server answers off Base. */
const veloStaked = () =>
  staked({ chainId: 10, deployment: "gv2", token1: OP_USDC, aero: VELO_LEGS }, { depositor: null, earned: null });

test("Velodrome: the site by chain, VELO priced through Velodrome's legs, claimable from the reads", () => {
  assert.equal(siteOf(10), VELODROME);
  assert.equal(siteOf(8453), AERODROME);
  assert.equal(siteOf(undefined), AERODROME);
  const p = aeroPosition(veloStaked());
  assert.equal(p.site, VELODROME);
  assert.equal(p.aeroPrice.route.via, "usdc-leg");
  close(p.aeroPrice.price, 0.025);
  // Base's USDC is no quote here: the same read on Optimism's legs prices against Optimism's USDC.
  assert.equal(aeroInQuote(veloStaked(), WETH, USDC, 3000, VELODROME).route.via, "weth-then-pool");
  assert.equal(p.holder, null);
  assert.equal(p.aero.claimableFrom, "arithmetic");
  close(p.aero.claimable, p.aero.claimableArithmetic);
});

test("Velodrome: the words name VELO, Velodrome and Optimism, and state the staked limit and the missing index", () => {
  const p = aeroPosition(veloStaked());
  const words = [
    POSITION_PAGE.title(p),
    POSITION_PAGE.sub(p),
    ...readoutTable(p).groups.flatMap((g) => [g.title, ...g.rows.flatMap((r) => [r.label, r.note])]),
    ...readoutExplainer(p).flatMap((g) => [g.title, ...g.bullets.flat()]),
    ...cardExplainer(p).flatMap((g) => [g.title, ...g.bullets.flat()]),
    ...Object.values(frontDoorWords(VELODROME)).filter((v) => typeof v === "string"),
  ]
    .filter(Boolean)
    .map((s) => (typeof s === "string" ? s : s.fig))
    .join("\n");
  assert.doesNotMatch(words, /\bAERO\b|Aerodrome|\bBase\b/);
  assertContract(readoutTable(p));
  assert.match(words, /VELO/);
  assert.equal(POSITION_PAGE.sub(p), "Slipstream (gauges v2) · tick spacing 100 · Optimism");
  // The wallet off Base is not named: the card says so under an empty Staked by, the receipt says why.
  assert.equal(cardWords(VELODROME).ownerNone, "not named on Optimism");
  assert.equal(cardWords(AERODROME).ownerNone, "no wallet found");
  assert.match(notIndexed(VELODROME, "position"), /^Not indexed yet on Optimism/);
  assert.equal(notIndexed(AERODROME, "wallet"), null);
  assert.equal(notIndexed(AERODROME, "position"), null);
  // The owner tip states what the card shows.
  assert.doesNotMatch(cardWords(VELODROME).ownerTip, /does not yet name/);
  assert.equal(
    cardWords(AERODROME).ownerTip,
    "The wallet that staked the position. The gauge holds the position while it is staked.",
  );
  assert.doesNotMatch(words, /—/);
  assert.doesNotMatch(words, /\b(fold|footgun|honest|itself|actually|exactly)\b/i);
});
