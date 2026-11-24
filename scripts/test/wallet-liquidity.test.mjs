// The wallet page's Liquidity section (W9): its owner routes
// (lib/wallet/liquidity/sources.ts) and the limit every request shares
// (lib/wallet/liquidity/limit.ts). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { LIQUIDITY_SOURCES, ownerPath, walletLiquidityLine } from "../../lib/wallet/liquidity/sources.ts";
import { createLimit } from "../../lib/wallet/liquidity/limit.ts";

const W = "0xAbC0000000000000000000000000000000000001";
const src = (key) => LIQUIDITY_SOURCES.find((s) => s.key === key);

test("eleven owner routes, one per explorer and chain", () => {
  assert.equal(LIQUIDITY_SOURCES.length, 11);
  assert.equal(new Set(LIQUIDITY_SOURCES.map((s) => s.key)).size, 11);
});

test("Ethereum's Uniswap and Base's Aerodrome take no chain; the rest name theirs", () => {
  assert.equal(ownerPath(src("uniswap:1"), W), `/api/at-block/uniswap/positions?owner=${W.toLowerCase()}`);
  assert.equal(ownerPath(src("aerodrome:8453"), W), `/api/at-block/aerodrome/positions?owner=${W.toLowerCase()}`);
  assert.equal(
    ownerPath(src("pancakeswap:42161"), W),
    `/api/at-block/pancakeswap/positions?chain=42161&owner=${W.toLowerCase()}`,
  );
  assert.equal(
    ownerPath(src("velodrome:10"), W),
    `/api/at-block/velodrome/positions?chain=10&owner=${W.toLowerCase()}`,
  );
  assert.equal(
    ownerPath(src("balancer:42161"), W),
    `/api/at-block/balancer/positions?chainId=42161&owner=${W.toLowerCase()}`,
  );
});

test("the empty state names each explorer once with its chains", () => {
  assert.equal(
    walletLiquidityLine(),
    "Uniswap V3 and V4 on Ethereum, Arbitrum, Optimism and Arc; Uniswap V3 on Base; PancakeSwap V3 on Base and Arbitrum; Aerodrome on Base; Velodrome on Optimism; Balancer V3 on Ethereum and Arbitrum",
  );
});

test("the limit holds at most n in flight and runs every call", async () => {
  const limit = createLimit(4);
  let active = 0;
  let peak = 0;
  const call = (i) =>
    limit(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (i === 3) throw new Error("one fails");
      return i;
    });
  const settled = await Promise.allSettled(Array.from({ length: 11 }, (_, i) => call(i)));
  assert.equal(peak, 4);
  assert.equal(settled.filter((s) => s.status === "fulfilled").length, 10);
  assert.equal(settled[3].status, "rejected");
});

// The card builders import sibling modules extensionless: resolve them to their .ts files.
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
const { uniCardRead, slipstreamCardRead, balancerCardRead } = await import("../../lib/wallet/liquidity/cards.ts");

const HEAD = { block: 100, time: 1_794_000_000 };
const T0 = { address: "0x0000000000000000000000000000000000000001", symbol: "A", decimals: 18 };
const T1 = { address: "0x0000000000000000000000000000000000000002", symbol: "B", decimals: 6 };
const POOL = { sqrtPriceX96: "79228162514264337593543950336", tick: 0 };

test("a Uniswap row with its head fields is the card's read at the head, with no history", () => {
  const row = {
    version: "v3",
    id: "9",
    token0: T0,
    token1: T1,
    fee: 500,
    liquidity: "1",
    pool: "0xp",
    owner: "0xo",
    tickLower: -10,
    tickUpper: 10,
    tickSpacing: null,
    hooks: null,
    hasSubscriber: false,
    now: POOL,
    stake: null,
  };
  const r = uniCardRead({ chainId: 42161, head: HEAD, positions: [row], truncated: false }, row);
  assert.equal(r.chainId, 42161);
  assert.deepEqual(r.then, HEAD);
  assert.equal(r.staked, null);
  assert.equal(r.past, null);
  assert.deepEqual(r.daily, []);
  assert.equal(r.history, null);
  assert.equal(uniCardRead({ chainId: 1, head: HEAD, positions: [], truncated: false }, { ...row, now: null }), null);
});

test("a Slipstream row needs its pool, fee, head state and the reward's price", () => {
  const aero = { usdc: {}, weth: {} };
  const row = {
    deployment: "gv3",
    id: "4",
    token0: T0,
    token1: T1,
    tickSpacing: 100,
    liquidity: "1",
    staked: true,
    gauge: "0xg",
    pool: "0xp",
    owner: "0xg",
    tickLower: -100,
    tickUpper: 100,
    fee: 400,
    now: POOL,
    stake: { gauge: "0xg" },
  };
  const a = { chainId: 8453, head: HEAD, positions: [row], aero, truncated: false };
  const r = slipstreamCardRead(a, row);
  assert.equal(r.nfpm, "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53");
  assert.deepEqual(r.staked, { gauge: "0xg" });
  assert.equal(r.stakedThen, null);
  assert.equal(slipstreamCardRead(a, { ...row, now: null }), null);
  assert.equal(slipstreamCardRead(a, { ...row, pool: null }), null);
  assert.equal(slipstreamCardRead({ ...a, aero: null }, row), null);
});

test("a Balancer row is the card's read from the owner route alone", () => {
  const row = {
    pool: "0xP",
    name: "n",
    symbol: "S",
    balance: "5",
    totalSupply: "10",
    tokens: [T0, T1],
    balancesRaw: ["1", "2"],
    staked: [],
  };
  const r = balancerCardRead(
    {
      chainId: 1,
      vault: "0xv",
      wallet: "0xw",
      head: HEAD,
      provider: "p",
      sources: [],
      checked: 1,
      positions: [row],
      truncated: false,
    },
    row,
  );
  assert.equal(r.balance, "5");
  assert.deepEqual(r.now, { totalSupply: "10", balancesRaw: ["1", "2"], liveBalancesScaled18: null, bptRate: null });
  assert.equal(r.tokens[0].tokenType, 0);
  assert.deepEqual(r.flows, []);
  assert.equal(r.past, null);
});
