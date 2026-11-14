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
const { cardExplainer, readoutExplainer, readoutTable, rateText, rateSub, CARD_WORDS, FRONT_DOOR } = await import(
  "../../lib/balancer/words.ts"
);

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
  assert.equal(rateText(p), "—");
  assert.equal(rateSub(p), "pool under 30 days old");
  const table = readoutTable(p);
  assert.equal(table.then, null);
  assert.equal(table.groups[1].rows.find((r) => r.key === "rate").now, "—");
});

test("the readout: the wallet's rows, then the pool's, each a past figure and a present one", () => {
  const table = readoutTable(balPosition(read()));
  assert.match(table.then, /^\d+ \w+ 2026$/);
  const [wallet, pool] = table.groups;
  assert.deepEqual(
    wallet.rows.map((r) => r.label),
    ["BPT", "Share of pool", "waEthWETH", "rETH"],
  );
  assert.deepEqual(
    pool.rows.map((r) => r.label),
    ["BPT total supply", "waEthWETH", "rETH", "BPT rate", "Swap fee", "Status"],
  );
  assert.equal(pool.rows[4].now, "0.04%");
  assert.equal(pool.rows[5].now, "Open");
  assert.equal(readoutTable(balPosition(read({ recoveryMode: true }))).groups[1].rows[5].now, "Recovery mode");
  // Every cell is a figure or a single word: no sentence at the top level.
  for (const r of [...wallet.rows, ...pool.rows])
    for (const x of [r.then, r.now]) if (x) assert.doesNotMatch(x, /\.$|, | \w+ \w+ /);
  // A wallet with no shares at either block has no rows.
  const gone = readoutTable(balPosition(read({ balance: "0", past: { ...read().past, balance: "0" } })));
  assert.deepEqual(
    gone.groups.map((g) => g.title),
    ["The pool"],
  );
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
  assert.equal(FRONT_DOOR.rowShare(0.000001), "under 0.001% of the pool");
  assert.equal(FRONT_DOOR.rowShare(0), "0.000% of the pool");
  assert.equal(w.staked, null);
  assert.equal(
    FRONT_DOOR.found("Ethereum"),
    "Pools are found from every transfer of BPT to or from this wallet since Balancer V3 launched on Ethereum.",
  );
});

test("shares staked in a gauge sum into a part of the pool", () => {
  const row = {
    pool: read().pool,
    name: null,
    symbol: "rETH-waEthWETH",
    balance: "0",
    totalSupply: "1000000000000000000000",
    tokens: read().tokens,
    balancesRaw: read().now.balancesRaw,
    staked: [
      { gauge: "0x62A66eB9aBf7a788F48D0ce7C0C065df9e09dA19", balance: "8000000000000000000" },
      { gauge: "0x0000000000000000000000000000000000000001", balance: "2000000000000000000" },
    ],
  };
  const w = walletRow(row);
  // Held plus staked: none in the wallet, 10 of 1,000 shares in gauges.
  assert.equal(w.share, 0.01);
  assert.equal(w.staked.shares, 10);
  assert.equal(w.staked.share, 0.01);
  assert.equal(w.staked.gauges.length, 2);
  assert.equal(FRONT_DOOR.rowStaked(w.staked.share), "Of which staked in a gauge: 1.000%");
  assert.equal(walletRow({ ...row, staked: [] }).staked, null);
  assert.equal(walletRow({ ...row, balance: "5000000000000000000" }).share, 0.015);
});

test("a stake counts in the card's share and withholds the wallet's 30-day lines", () => {
  const staked = [{ gauge: "0x62A66eB9aBf7a788F48D0ce7C0C065df9e09dA19", balance: read().balance }];
  const p = balPosition(read({ staked }));
  const plain = balPosition(read());
  assert.ok(Math.abs(p.now.share - 2 * plain.now.share) < 1e-12);
  assert.equal(p.split.held, plain.now.shares);
  assert.equal(p.windowWithheld, true);
  const [wallet, pool] = readoutTable(p).groups;
  for (const r of wallet.rows) assert.equal(r.then, null);
  assert.notEqual(pool.rows[0].then, null);
  assert.equal(plain.windowWithheld, false);
  assert.notEqual(readoutTable(plain).groups[0].rows[0].then, null);
});

test("each chain names itself on the front door and in a receipt's grid", async () => {
  const { BAL_CHAINS, balChain } = await import("../../lib/balancer/chains.ts");
  assert.match(FRONT_DOOR.line(BAL_CHAINS[42161].name), /on Arbitrum\.$/);
  assert.match(balChain(42161).grid, /UTC midnight/);
  assert.equal(balChain(1).session, "balancer-v3");
  assert.equal(balChain(42161).session, "balancer-v3-arbitrum");
});

test("the card's (i) tells this position's story in its own figures", () => {
  const groups = cardExplainer(balPosition(read()));
  assert.deepEqual(
    groups.map((g) => g.title),
    ["Holdings", "Rate", "History"],
  );
  const all = groups.flatMap((g) => g.bullets);
  assert.ok(all.some((b) => /waEthWETH and rETH earn yield/.test(b)));
  assert.ok(
    all.some((b) => /^This wallet held 10 BPT on .*; the BPT added since had only part of the window\.$/.test(b)),
  );
  assert.ok(all.some((b) => /^Its latest move was an add on .*, after a remove on /.test(b)));
  for (const b of all) {
    assert.ok(b.split(" ").length <= 20, b);
    assert.doesNotMatch(b, /\b(you|your|safe|good|bad|should)\b/i);
  }
  // None held at the past block: the change predates the wallet's shares.
  const none = cardExplainer(balPosition(read({ past: { ...read().past, balance: "0" } }))).flatMap((g) => g.bullets);
  assert.ok(none.some((b) => /held none on .*, so the change was measured before its current BPT was added/.test(b)));
  assert.equal(CARD_WORDS.last({ kind: "add", time: 1_790_000_000 }), "last 21 Sept 2026");
});

test("the readout names all the pool's shares, and its (i) the past block per chain", () => {
  assert.equal(readoutTable(balPosition(read())).groups[1].rows[0].label, "BPT total supply");
  assert.match(readoutExplainer(1)[0].bullets[0], /30 to 31 days back/);
  assert.match(readoutExplainer(42161)[0].bullets[0], /UTC midnight/);
  const staked = [{ gauge: "0x62A66eB9aBf7a788F48D0ce7C0C065df9e09dA19", balance: read().balance }];
  assert.match(readoutTable(balPosition(read({ staked }))).then, /^\d+ \w+ 2026$/);
});

test("the readout's (i) says the share of pool moves with other holders and what the swap fee does", () => {
  const [compare, wallet, pool] = readoutExplainer(42161);
  assert.match(compare.bullets.join(" "), /staked BPT has figures for now only/);
  assert.match(wallet.bullets.join(" "), /rises when other liquidity providers withdraw/);
  assert.match(pool.bullets.join(" "), /charged on each swap/);
});

test("each chain's explorer path is the URL slug's, with a page behind it", async () => {
  const { BAL_CHAINS } = await import("../../lib/balancer/chains.ts");
  // The Arbitrum roster session is "balancer-v3-arbitrum"; its pages live under the slug.
  assert.equal(BAL_CHAINS[42161].home, "/arbitrum/balancer-v3");
  assert.equal(BAL_CHAINS[1].home, "/ethereum/balancer-v3");
  const { existsSync } = await import("node:fs");
  for (const c of Object.values(BAL_CHAINS)) {
    const dir = new URL(`../../app/(app)${c.home}/`, import.meta.url);
    assert.ok(existsSync(new URL("page.tsx", dir)), `${c.home} has a front door`);
    assert.ok(existsSync(new URL("info/page.tsx", dir)), `${c.home}/info exists`);
    assert.ok(existsSync(new URL("position/[pool]/[wallet]/page.tsx", dir)), `${c.home}/position exists`);
  }
});
