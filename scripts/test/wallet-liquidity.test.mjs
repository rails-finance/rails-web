// The wallet page's Liquidity section (W9): its owner routes and position reads
// (lib/wallet/liquidity/sources.ts) and the limit every request shares
// (lib/wallet/liquidity/limit.ts). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { LIQUIDITY_SOURCES, ownerPath, positionPath, walletLiquidityLine } from "../../lib/wallet/liquidity/sources.ts";
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

test("each position read is the one its explorer's page makes", () => {
  assert.equal(
    positionPath(src("uniswap:8453"), { version: "v3", id: "12" }, W),
    "/api/at-block/uniswap/position?chain=8453&version=v3&id=12",
  );
  assert.equal(
    positionPath(src("aerodrome:8453"), { deployment: "gv3", id: "7" }, W),
    "/api/at-block/aerodrome/position?deployment=gv3&id=7",
  );
  assert.equal(
    positionPath(src("balancer:1"), { pool: "0xPOOL" }, W),
    `/api/at-block/balancer/position?chainId=1&pool=0xpool&wallet=${W.toLowerCase()}`,
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
