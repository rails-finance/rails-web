// lib/balancer/position.ts and words.ts against a read in the shape of
// rails-server's Balancer V3 at-block route (rails-ops ui-jobs 569): pool
// 0x1ea5…13e3 (rETH-waEthWETH) and wallet 0x66c0…b67c, read on Ethereum on
// 10 Nov 2026 at block 26,387,748; the past side is hand-made.
// Run: npm test
//
// The modules import Uniswap's words by extensionless relative specifier, so
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

const { balPosition, fraction, sharesOf, units, walletRow } = await import("../../lib/balancer/position.ts");
const { readoutLines, rateText, FRONT_DOOR } = await import("../../lib/balancer/words.ts");

const HEAD = { block: 26_387_748, time: 1_794_336_000 };
const THEN = { block: 26_164_800, time: 1_791_660_000 };
const read = (over = {}) => ({
  chainId: 1,
  vault: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
  pool: "0x1ea5870f7C037930CE1d5d8d9317c670e89e13E3",
  wallet: "0x66c0D9152209b51977047b9DC3b0B5Bf2339b67c",
  head: HEAD,
  then: THEN,
  provider: "mainnet.gateway.tenderly.co",
  name: "Balancer rETH - Aave WETH",
  symbol: "rETH-waEthWETH",
  tokens: [
    {
      address: "0x0bfc9d54Fc184518A81162F8fB99c2eACa081202",
      symbol: "waEthWETH",
      decimals: 18,
      tokenType: 1,
      rateProvider: "0xBe7bE04807762Bc433911dD927fD54a385Fa91d6",
    },
    {
      address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
      symbol: "rETH",
      decimals: 18,
      tokenType: 1,
      rateProvider: "0x1a8F81c256aee9C640e14bB0453ce247ea0DFE6F",
    },
  ],
  paused: false,
  recoveryMode: false,
  swapFee: "400000000000000",
  balance: "13714766666125401992",
  now: {
    totalSupply: "1511444628924060889479",
    balancesRaw: ["723204822390121305068", "653799403480060405164"],
    liveBalancesScaled18: ["776039637089637007994", "768537796400562746507"],
    bptRate: "1021921163073799731",
  },
  past: {
    balance: "10000000000000000000",
    totalSupply: "1400000000000000000000",
    balancesRaw: ["700000000000000000000", "600000000000000000000"],
    liveBalancesScaled18: null,
    bptRate: "1018000000000000000",
  },
  flows: [
    { kind: "add", block: 22_000_000, time: 1_741_000_000, txHash: "0x01", amountsRaw: ["5", "6"] },
    { kind: "remove", block: 26_000_000, time: 1_789_000_000, txHash: "0x02", amountsRaw: ["1", "2"] },
    { kind: "add", block: 26_100_000, time: 1_790_000_000, txHash: "0x03", amountsRaw: ["1", "2"] },
  ],
  ...over,
});

test("units and fraction keep 18 places", () => {
  assert.equal(units("1500000", 6), 1.5);
  assert.equal(units("13714766666125401992", 18), 13.714766666125402);
  assert.equal(fraction("1", "4"), 0.25);
  assert.equal(fraction("5", "0"), 0);
});

test("the wallet's part of each token: balance × shares ÷ supply", () => {
  const [a, b] = sharesOf(read().tokens, read().now.balancesRaw, read().balance, read().now.totalSupply);
  // 723.2048… × 13.7148 ÷ 1511.4446 and 653.7994… × the same.
  assert.ok(Math.abs(a - 6.5624) < 1e-3, String(a));
  assert.ok(Math.abs(b - 5.9325) < 1e-3, String(b));
});

test("a pool share now and 30 days back", () => {
  const p = balPosition(read());
  assert.ok(Math.abs(p.now.share - 0.009074) < 1e-6, String(p.now.share));
  assert.ok(Math.abs(p.then.share - 10 / 1400) < 1e-15);
  assert.deepEqual(p.then.holds, [5, 600 / 140]);
  assert.ok(Math.abs(p.rateChange - (1.021921163073799731 / 1.018 - 1)) < 1e-12);
  assert.equal(p.feePct, 0.04);
  assert.deepEqual(p.firstAdd, { block: 22_000_000, time: 1_741_000_000 });
  assert.equal(p.adds, 2);
  assert.equal(p.removes, 1);
  assert.equal(rateText(p), "+0.39%");
});

test("a pool younger than the window: no past side, no rate change", () => {
  const p = balPosition(read({ past: null }));
  assert.equal(p.then, null);
  assert.equal(p.rateChange, null);
  assert.equal(rateText(p), "Pool younger than 30 days");
  const rate = readoutLines(p).find((l) => l.key === "rate");
  assert.equal(rate.pool, "The pool is younger than 30 days.");
});

test("the readout: shares, share, one line per token, value per share, the pool", () => {
  const lines = readoutLines(balPosition(read()));
  assert.deepEqual(
    lines.map((l) => l.key),
    ["shares", "share", "token:0", "token:1", "rate", "status"],
  );
  assert.equal(lines[2].label, "waEthWETH");
  assert.equal(lines[5].pool, "Swap fee 0.04%. Trading.");
  const recovery = readoutLines(balPosition(read({ recoveryMode: true })));
  assert.match(recovery[5].pool, /recovery mode/);
  for (const l of lines) for (const s of [l.yours, l.pool]) if (s) assert.doesNotMatch(s, /, not |honest|fold/i);
});

test("a wallet row and the words that say what the search misses", () => {
  const w = walletRow({
    pool: read().pool,
    name: null,
    symbol: null,
    balance: read().balance,
    totalSupply: read().now.totalSupply,
    tokens: read().tokens,
    balancesRaw: read().now.balancesRaw,
  });
  assert.equal(w.symbol, "waEthWETH-rETH");
  assert.equal(FRONT_DOOR.rowShare(w.share), "0.907% of the pool");
  assert.match(FRONT_DOOR.notFound, /received by transfer, or staked in a gauge/);
});

test("each chain names itself on the front door and in a receipt's grid", async () => {
  const { BAL_CHAINS, balChain } = await import("../../lib/balancer/chains.ts");
  assert.match(FRONT_DOOR.line(BAL_CHAINS[42161].name), /on Arbitrum,/);
  assert.match(balChain(42161).grid, /UTC midnight/);
  assert.equal(balChain(1).session, "balancer-v3");
  assert.equal(balChain(42161).session, "balancer-v3-arbitrum");
});
