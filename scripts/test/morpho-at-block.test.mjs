// lib/morpho-at-block/position.ts against wallet 0x6844…b68a's cirBTC/USDC position on Arc (read through
// rails-server's /api/at-block/morpho-arc/position on 11 Nov 2026, rails-ops ui-jobs 577): the debt
// from shares at the totals compounded since the last update, the collateral through the oracle,
// the LTV and room to borrow, dollars at the USDC/USD feed, 30-day interest where the shares match,
// and the withheld cases.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { accrue, morphoAtBlockPosition, morphoAtBlockWalletPositions, toAssetsUp, wTaylorCompounded } = await import(
  "../../lib/morpho-at-block/position.ts"
);

const READ = {
  chainId: 5042,
  head: { block: 30679130, time: 1794394891 },
  then: { block: 25494000, time: 1791763536 },
  provider: "arc.gateway.tenderly.co",
  wallet: "0x6844a3da0405879445099c8071baca780bbab68a",
  market: {
    id: "0xc2db905f174e5defcce01d321b09f15f78856a36a21b90cc7e1abbc29225815d",
    loanToken: "0x3600000000000000000000000000000000000000",
    collateralToken: "0x171a4217b86a807a64eb94757db6849fb4bdbaa0",
    oracle: "0x2aa87ff48933ce6aba240bee916fc2e6ec1e51ab",
    irm: "0xf02615d094fc02fc031c35fe705e175aa4653f20",
    lltv: "860000000000000000",
    state: {
      totalSupplyAssets: "175047061790048",
      totalSupplyShares: "174456391889209151736",
      totalBorrowAssets: "159292847095747",
      totalBorrowShares: "158684647762766074149",
      lastUpdate: "1794394806",
      fee: "0",
    },
    borrowRate: "1157894426",
    rateAtTarget: "890679569",
    price: "739214869031300000000000000000000000000",
  },
  position: { supplyShares: "0", borrowShares: "7995093157099105", collateral: "18334232" },
  past: {
    position: { supplyShares: "0", borrowShares: "7995093157099105", collateral: "18334232" },
    state: {
      totalSupplyAssets: "194986972819074",
      totalSupplyShares: "194842770526284608989",
      totalBorrowAssets: "193986984255917",
      totalBorrowShares: "193792225431139632773",
      lastUpdate: "1791758365",
      fee: "0",
    },
    borrowRate: "861794460",
  },
  tokens: {
    "0x3600000000000000000000000000000000000000": { symbol: "USDC", decimals: 6, name: "USDC" },
    "0x171a4217b86a807a64eb94757db6849fb4bdbaa0": { symbol: "cirBTC", decimals: 8, name: "Circle Wrapped Bitcoin" },
  },
  usdFeeds: [
    {
      token: "0x3600000000000000000000000000000000000000",
      feed: "0xbc88a5182848151ae1f7b4877021f828d8f4d735",
      name: "SVR_USDC__USD",
      description: "USDC / USD",
      decimals: 8,
      answer: "99976679",
      updatedAt: "1794324484",
    },
  ],
};

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the Taylor term is Morpho's: x·n + (x·n)²/2 + (x·n)³/6 in WAD", () => {
  const WAD = BigInt("1000000000000000000");
  const x = WAD / BigInt(10);
  const got = wTaylorCompounded(x, BigInt(1));
  assert.equal(
    got,
    x + (x * x) / (BigInt(2) * WAD) + (((x * x) / (BigInt(2) * WAD)) * x) / (BigInt(3) * WAD),
    "three terms",
  );
});

test("the market's totals compound from the last update to the block", () => {
  const t = accrue(READ.market.state, READ.market.borrowRate, READ.head.time);
  assert.equal(t.elapsed, 85, "85 seconds since the last update");
  assert.ok(t.accrued > BigInt(0), "interest accrued");
  assert.equal(t.borrowAssets - BigInt(READ.market.state.totalBorrowAssets), t.accrued, "added to the borrow total");
  assert.equal(t.supplyAssets - BigInt(READ.market.state.totalSupplyAssets), t.accrued, "and to the supply total");
  assert.equal(toAssetsUp(BigInt(1), BigInt(0), BigInt(0)), BigInt(1), "debt rounds up");
});

test("the position: debt, collateral through the oracle, LTV, room and dollars", () => {
  const f = morphoAtBlockPosition(READ);
  near(f.debt, 8025.9, 0.2, "debt in USDC");
  near(f.collateral, 0.18334232, 1e-9, "collateral in cirBTC");
  near(f.oraclePrice, 73921.4869, 0.001, "one cirBTC in USDC at the oracle");
  near(f.collateralInLoan, 13552.9, 0.2, "collateral in USDC");
  near(f.ltv, 0.5922, 0.0005, "LTV");
  near(f.roomToBorrow, 13552.9 * 0.86 - 8025.9, 0.5, "room to borrow to the LLTV");
  near(f.liquidationDrop, 1 - 0.5922 / 0.86, 0.001, "the drop that liquidates");
  near(f.debtUsd, f.debt * 0.99976679, 1e-6, "debt at the USDC/USD feed");
  near(f.borrowApr, (1157894426 / 1e18) * 31_536_000, 1e-12, "borrow rate a year");
});

test("30 days of interest where the shares match, withheld where they do not", () => {
  const f = morphoAtBlockPosition(READ);
  assert.equal(f.debtInterest.state, "ok", "the same shares at both reads");
  near(f.debtInterest.amount, 22.57, 0.05, "interest over the 30 days, USDC");
  assert.equal(f.supplyInterest, null, "no supply side");
  const changed = morphoAtBlockPosition({
    ...READ,
    past: { ...READ.past, position: { ...READ.past.position, borrowShares: "1" } },
  });
  assert.equal(changed.debtInterest.state, "changed", "a different share count");
  const opened = morphoAtBlockPosition({
    ...READ,
    past: { ...READ.past, position: { ...READ.past.position, borrowShares: "0" } },
  });
  assert.equal(opened.debtInterest.state, "opened", "none 30 days back");
  assert.equal(morphoAtBlockPosition({ ...READ, past: null }).debtInterest.state, "unread", "the past read failed");
});

test("a loan token with no feed on Arc has no dollar figure", () => {
  const f = morphoAtBlockPosition({ ...READ, usdFeeds: [] });
  assert.equal(f.debtUsd, null, "no debt dollars");
  assert.equal(f.collateralUsd, null, "no collateral dollars");
  assert.equal(f.debtInterest.usd, null, "no interest dollars");
});

test("the wallet's positions, largest dollar value first", () => {
  const small = {
    ...READ.market,
    id: "0x" + "11".repeat(32),
    createdBlock: 2,
    position: { ...READ.position, collateral: "1" },
  };
  const big = { ...READ.market, createdBlock: 1, position: READ.position };
  const rows = morphoAtBlockWalletPositions({
    ...READ,
    list: { from: 1, keptTo: 2, toBlock: 3 },
    marketsRead: 2,
    positions: [small, big],
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    [READ.market.id, small.id],
    "the larger collateral first",
  );
});

// The markets list (lib/morpho-at-block/unlisted.ts): the markets rails-server marks unlisted stay off the
// list; the idle market stays.
const { listedMarkets, atBlockUnlisted } = await import("../../lib/morpho-at-block/unlisted.ts");

test("the markets list leaves out the test-token and never-supplied markets, and keeps the idle market", () => {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const state = (supply) => ({
    totalSupplyAssets: supply,
    totalSupplyShares: supply === "0" ? "0" : supply + "000000",
    totalBorrowAssets: "0",
    totalBorrowShares: "0",
    lastUpdate: "100",
    fee: "0",
  });
  const mk = (id, o) => ({
    ...READ.market,
    id,
    createdBlock: 1,
    createdTx: "0x",
    createdTime: 100,
    state: state("1000000"),
    unlisted: null,
    ...o,
  });
  const markets = [
    mk("0xidle", {
      loanToken: ZERO,
      collateralToken: ZERO,
      oracle: ZERO,
      irm: ZERO,
      lltv: "980000000000000000",
      state: state("0"),
    }),
    mk("0xbtc", {}),
    mk("0xmock", { unlisted: "test-token" }),
    mk("0xdead", { unlisted: "never-funded", state: state("0") }),
  ];
  const r = {
    chainId: 5042,
    head: READ.head,
    provider: "arc.gateway.tenderly.co",
    morpho: "0x34cd04070dd72b14e241112f6d83812df5af7fcd",
    irm: READ.market.irm,
    list: { from: 1, keptTo: 2, toBlock: 3 },
    markets,
    tokens: READ.tokens,
    loanTokenSupply: {},
    usdFeeds: READ.usdFeeds,
  };
  assert.deepEqual(
    listedMarkets(markets).map((m) => m.id),
    ["0xidle", "0xbtc"],
    "the two unlisted markets are left out; the idle market stays",
  );
  const u = atBlockUnlisted(r);
  assert.deepEqual([u.test, u.never, u.idle?.id], [1, 1, "0xidle"], "the line's counts and the idle market");
});
