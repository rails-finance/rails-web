// lib/uniswap/position.ts, pairs.ts and words.ts against hand-made reads in
// the shape of rails-server's at-block routes (rails-ops ui-jobs 556).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { poolPosition, hookPermissions, protocolCut, amountsFor } from "../../lib/uniswap/position.ts";
import { pairCards, orderCards } from "../../lib/uniswap/pairs.ts";
import { readoutLines, readoutExplainer, cutSentence, cutShort, num, pct, PAIR_DOOR } from "../../lib/uniswap/words.ts";

const Q128 = BigInt(2) ** BigInt(128);
const sqrtX96 = (tick) => BigInt(Math.round(Math.sqrt(Math.pow(1.0001, tick)) * 2 ** 96)).toString();
const DAY = 86_400;
const HEAD = { block: 26_378_811, time: 1_794_000_000 };
const THEN = { block: HEAD.block - 216_000, time: HEAD.time - 30 * DAY };

const WETH = { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 };
const USDT = { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 };
const USDC = { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 };
const BALLR = { address: "0x1111111111111111111111111111111111111111", symbol: "BALLR", decimals: 18 };

function poolRead(tick, over = {}) {
  return {
    sqrtPriceX96: sqrtX96(tick),
    tick,
    activeLiquidity: "1000000000000",
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
    protocolFee: 0x66,
    lpFee: 3000,
    ...over,
  };
}

/** V3 WETH/USDT at 2,130 USDT per WETH, set for about 4,247 to 5,597 (#1,083,471's shape). */
function v3OutOfRange() {
  const L = "1000000000000000";
  return {
    chainId: 1,
    version: "v3",
    id: "1083471",
    head: HEAD,
    then: THEN,
    provider: "test",
    owner: "0x00000000000000000000000000000000000000aa",
    pool: "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
    token0: WETH,
    token1: USDT,
    fee: 3000,
    tickSpacing: null,
    hooks: null,
    hasSubscriber: false,
    tickLower: -192780,
    tickUpper: -190020,
    liquidity: L,
    now: poolRead(-199680, { tokensOwed1: "30600000" }),
    past: { ...poolRead(-197000), positionLiquidity: L },
    opened: { block: 20_000_000, time: HEAD.time - 400 * DAY },
    daily: Array.from({ length: 30 }, (_, k) => ({
      block: HEAD.block - k * 7200,
      time: HEAD.time - k * DAY,
      tick: -199000,
    })),
    history: {
      increase: [{ block: 20_000_000, liquidity: L, amount0: "500000000000000000", amount1: "1000000000" }],
      decrease: [],
      collect: [],
    },
  };
}

test("an out-of-range V3 position: Range leads, it holds only the base, and earns nothing", () => {
  const p = poolPosition(v3OutOfRange());
  assert.equal(p.base.symbol, "WETH");
  assert.equal(p.quote.symbol, "USDT");
  assert.equal(p.inRange, false);
  assert.equal(p.side, "below");
  assert.equal(p.holds.quote, 0);
  assert.ok(p.holds.base > 0);
  assert.ok(Math.abs(p.price - 2130) / 2130 < 0.01, `price ${p.price}`);
  assert.ok(Math.abs(p.range.low - 4247) / 4247 < 0.01, `low ${p.range.low}`);
  assert.equal(p.fees30d, 0);
  assert.equal(p.uncollected, 30.6);
  assert.deepEqual(p.daysInRange, { inRange: 0, read: 30, from: HEAD.block - 29 * 7200, to: HEAD.block });

  const lines = readoutLines(p);
  assert.deepEqual(
    lines.map((l) => l.key),
    ["range", "size", "fees", "withdrawals", "against", "steward"],
  );
  const by = Object.fromEntries(lines.map((l) => [l.key, l]));
  assert.match(
    by.range.yours,
    /^Out of range, below it: the price is 2,1\d\d USDT per WETH, the range 4,2\d\d to 5,5\d\d\./,
  );
  assert.match(by.range.yours, /It holds only WETH and earns no fees while the price is outside\./);
  assert.match(by.range.yours, /In range on 0 of the last 30 days, read once a day\.$/);
  assert.equal(by.fees.yours, "Earned 0 USDT in fees in the last 30 days. Not yet collected: 30.6 USDT.");
  assert.equal(by.size.yours, "None of the liquidity in range now: the position is out of range.");
  assert.equal(by.withdrawals.yours, "Can be withdrawn at any block. The pool has no pause and no hook.");
  assert.match(by.steward.pool, /^Nobody can change this pool's 0\.3% fee\. Uniswap takes 1\/6 of the swap fees/);
  assert.match(by.against.pool, /^Since its first deposit on /);
  assert.match(by.size.pool, /^The pool holds 1,000 WETH and 2 M USDT; 30 days ago/);
});

test("fees over the window are liquidity times the change in fee growth inside", () => {
  const r = v3OutOfRange();
  // In range now and then, 2 raw USDT per unit of liquidity over the window.
  r.tickLower = -200040;
  r.tickUpper = -199020;
  r.liquidity = "1000000";
  r.past.positionLiquidity = "1000000";
  r.now.feeGrowthInside1X128 = (Q128 * BigInt(2)).toString();
  const p = poolPosition(r);
  assert.equal(p.inRange, true);
  assert.equal(p.fees30d, 2);
  assert.ok(p.againstHolding !== null && p.againstHoldingWithFees > p.againstHolding);
  assert.equal(readoutLines(p)[0].key, "size");
});

test("a position whose liquidity changed in the window states no 30-day fees", () => {
  const r = v3OutOfRange();
  r.past.positionLiquidity = "1";
  const by = Object.fromEntries(readoutLines(poolPosition(r)).map((l) => [l.key, l]));
  assert.match(by.fees.yours, /^Its liquidity changed inside the window/);
  assert.match(by.against.yours, /^Its liquidity changed inside the window/);
});

test("a position opened inside the window says when its first 30-day figure lands", () => {
  const r = v3OutOfRange();
  r.opened = { block: HEAD.block - 7200, time: HEAD.time - DAY };
  r.past.positionLiquidity = null;
  r.daily = r.daily.slice(0, 2);
  const by = Object.fromEntries(readoutLines(poolPosition(r)).map((l) => [l.key, l]));
  assert.match(by.fees.yours, /^Opened on .*, inside the window: its first 30-day figure is on /);
  assert.equal(by.against.yours, "Opened inside the window.");
  assert.match(by.range.yours, /In range on 0 of 2 daily reads since it opened on /);
});

test("a hooked V4 pool with a dynamic fee: the hook's actions in words, no function names", () => {
  const hook = "0x00000000000000000000000000000000000000cc";
  assert.deepEqual(hookPermissions(hook), [
    "beforeSwap",
    "afterSwap",
    "beforeSwapReturnsDelta",
    "afterSwapReturnsDelta",
  ]);
  const r = {
    ...v3OutOfRange(),
    version: "v4",
    id: "225457",
    pool: "0x" + "ab".repeat(32),
    token0: BALLR,
    token1: WETH,
    fee: 0x800000,
    tickSpacing: 60,
    hooks: hook,
    hasSubscriber: false,
    tickLower: 0,
    tickUpper: 600,
    now: poolRead(-5000, {
      balance0: null,
      balance1: null,
      protocolFee: 500 | (500 << 12),
      lpFee: 30000,
      tokensOwed1: "0",
    }),
    past: { ...poolRead(-4000, { balance0: null, balance1: null }), positionLiquidity: "1000000000000000" },
    history: null,
  };
  const p = poolPosition(r);
  assert.equal(p.quote.symbol, "WETH");
  assert.equal(p.dynamicFee, true);
  assert.equal(p.lpFeePct, 3);
  const lines = readoutLines(p);
  const by = Object.fromEntries(lines.map((l) => [l.key, l]));
  assert.equal(
    by.withdrawals.yours,
    "Can be withdrawn at any block. The pool's hook 0x0000…00cc runs on swaps, and has no permission on withdrawals.",
  );
  assert.equal(
    by.steward.pool,
    "The hook 0x0000…00cc sets this pool's fee, 3% now. Uniswap adds a 0.05% protocol fee to each swap, paid by the swapper on top of the pool's fee.",
  );
  assert.equal(by.size.pool, "Rails does not read a V4 pool's balances yet: V4 keeps every pool in one contract.");
  assert.equal(by.against.pool, "Since its first deposit: Rails does not read a V4 position's own deposits yet.");
  const MACHINERY = /\(\)|slot0|feeGrowth|NPM|StateView|PositionManager|beforeSwap|afterSwap|DEX lane|block \d/;
  for (const l of lines) {
    assert.doesNotMatch(l.yours ?? "", MACHINERY, l.key);
    assert.doesNotMatch(l.pool ?? "", MACHINERY, l.key);
  }
  const groups = readoutExplainer(
    p,
    lines.map((l) => l.key),
  );
  assert.deepEqual(
    groups.map((g) => g.title),
    lines.map((l) => l.label),
  );
});

test("a hook with withdrawal permissions says it can block or take from a withdrawal", () => {
  // beforeRemoveLiquidity is bit 9.
  const hook = "0x0000000000000000000000000000000000000200";
  assert.deepEqual(hookPermissions(hook), ["beforeRemoveLiquidity"]);
  const r = { ...v3OutOfRange(), version: "v4", hooks: hook, history: null };
  const by = Object.fromEntries(readoutLines(poolPosition(r)).map((l) => [l.key, l]));
  assert.equal(
    by.withdrawals.yours,
    "The pool's hook 0x0000…0200 runs on every withdrawal and can block it or take from it.",
  );
});

test("the protocol's cut in words", () => {
  assert.equal(cutSentence(protocolCut("v3", 0)), "Uniswap takes none of this pool's fees.");
  assert.equal(
    cutSentence(protocolCut("v3", 0x44)),
    "Uniswap takes 1/4 of the swap fees, out of what liquidity providers earn.",
  );
  assert.equal(cutShort(protocolCut("v3", 0x44)), "1/4 of LP fees");
  assert.equal(cutShort(protocolCut("v4", 25 | (25 << 12))), "0.0025% added to swaps");
  assert.equal(cutShort(protocolCut("v4", 0)), "none");
});

test("amounts below, inside and above a range", () => {
  const L = BigInt(10) ** BigInt(18);
  const [a0, a1] = amountsFor(L, Math.sqrt(Math.pow(1.0001, -100)), 0, 100);
  assert.ok(a0 > 0 && a1 === 0);
  const [b0, b1] = amountsFor(L, Math.sqrt(Math.pow(1.0001, 200)), 0, 100);
  assert.ok(b0 === 0 && b1 > 0);
  const [c0, c1] = amountsFor(L, Math.sqrt(Math.pow(1.0001, 50)), 0, 100);
  assert.ok(c0 > 0 && c1 > 0);
});

test("formatting", () => {
  assert.equal(num(2337.4), "2,337");
  assert.equal(num(7_400_000), "7.4 M");
  assert.equal(num(0.001145), "0.001145");
  assert.equal(pct(-0.0115), "−1.15%");
  assert.equal(pct(0.000001), "0.00%");
});

// ── Door 2 ─────────────────────────────────────────────────────────────────

const READS = [0, 1, 2, 3].map((k) => ({ block: HEAD.block - k * 216_000, time: HEAD.time - k * 30 * DAY }));
const ONE = (BigInt(2) ** BigInt(96)).toString();
/** A USDC/USDT read at price 1 whose full-range fees grew by `share` of value per window. */
const stableAt = (k, share, over = {}) => ({
  sqrtPriceX96: ONE,
  tick: 0,
  liquidity: "1000000000000",
  feeGrowthGlobal0X128: "0",
  feeGrowthGlobal1X128: ((Q128 * BigInt(Math.round(share * 2 * 1e9) * (3 - k))) / BigInt(1e9)).toString(),
  balance0: "1000000000000",
  balance1: "1000000000000",
  protocolFee: 0x44,
  ...over,
});

test("pair cards: windows, size, and the set-aside rule", () => {
  const read = {
    chainId: 1,
    reads: READS,
    tokens: [USDC, USDT],
    pools: [
      {
        version: "v3",
        fee: 100,
        tickSpacing: null,
        key: "0xpool-a",
        token0: USDC.address,
        token1: USDT.address,
        at: [0, 1, 2, 3].map((k) => stableAt(k, 0.0006)),
      },
      {
        version: "v3",
        fee: 500,
        tickSpacing: null,
        key: "0xpool-empty",
        token0: USDC.address,
        token1: USDT.address,
        at: [0, 1, 2, 3].map((k) => stableAt(k, 0.0006, { liquidity: k === 0 ? "0" : "1000000000000" })),
      },
      {
        version: "v4",
        fee: 3000,
        tickSpacing: 60,
        key: "0xpool-thin",
        token0: USDC.address,
        token1: USDT.address,
        at: [0, 1, 2, 3].map((k) =>
          stableAt(k, 0.0006, { balance0: null, balance1: null, liquidity: k === 2 ? "1000" : "1000000000000" }),
        ),
      },
      {
        version: "v4",
        fee: 10000,
        tickSpacing: 200,
        key: "0xpool-spike",
        token0: USDC.address,
        token1: USDT.address,
        at: [0, 1, 2, 3].map((k) => stableAt(k, 0.2, { balance0: null, balance1: null })),
      },
      {
        version: "v4",
        fee: 100,
        tickSpacing: 1,
        key: "0xpool-young",
        token0: USDC.address,
        token1: USDT.address,
        at: [stableAt(0, 0.0006), null, null, null],
      },
    ],
  };
  const cards = pairCards(read, "usdc-usdt");
  const by = Object.fromEntries(cards.map((c) => [c.key, c]));
  assert.ok(Math.abs(by["0xpool-a"].windows[0] - 0.0006) < 1e-12);
  assert.equal(by["0xpool-a"].size, 2_000_000);
  assert.equal(by["0xpool-a"].priceMove, 0);
  assert.equal(by["0xpool-a"].aside, null);
  assert.deepEqual(by["0xpool-empty"].aside, { kind: "empty" });
  assert.deepEqual(by["0xpool-thin"].aside, { kind: "thin-then", floor: 50_000 });
  assert.deepEqual(by["0xpool-spike"].aside, { kind: "spike" });
  assert.deepEqual(by["0xpool-young"].aside, { kind: "young" });
  assert.equal(by["0xpool-thin"].size, null);
  assert.equal(
    PAIR_DOOR.card.aside(by["0xpool-thin"].aside, "USDT"),
    "Set aside: under 50,000 USDT in range at one of the reads 30, 60 or 90 days back, which inflates a fee figure.",
  );
  assert.equal(PAIR_DOOR.card.sub(by["0xpool-a"]), "Uniswap V3 · 0.01% · Ethereum · no hook");
  // Largest first; V4 pools, whose size is not read, after.
  assert.deepEqual(
    orderCards(cards, "size").map((c) => c.version),
    ["v3", "v3", "v4", "v4", "v4"],
  );
  assert.equal(orderCards(cards, "fees")[0].key, "0xpool-spike");
});

test("a pair naming ETH: V4 pools with WETH say so", () => {
  const read = {
    chainId: 1,
    reads: READS,
    tokens: [{ ...USDC }, { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", decimals: 18 }],
    pools: [
      {
        version: "v4",
        fee: 500,
        tickSpacing: 10,
        key: "0xweth",
        token0: USDC.address,
        token1: WETH.address,
        at: [0, 1, 2, 3].map((k) => stableAt(k, 0.0006, { balance0: null, balance1: null })),
      },
    ],
  };
  const [c] = pairCards(read, "eth-usdc");
  assert.equal(c.weth, true);
  assert.equal(PAIR_DOOR.card.sub(c), "Uniswap V4 · 0.05% (WETH) · Ethereum · no hook");
});
