// lib/morpho-at-block/position.ts against wallet 0x6844…b68a's cirBTC/USDC position on Arc (read through
// rails-server's /api/at-block/morpho-arc/position on 11 Nov 2026, rails-ops ui-jobs 577): the debt
// from shares at the totals compounded since the last update, the collateral through the oracle,
// the LTV and room to borrow, dollars at the USDC/USD feed, 30-day interest where the shares match,
// and the withheld cases. Then Optimism's deployment (ui-jobs 578): a real position, the AaveOracle price, the foot.
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

// Optimism (rails-ops ui-jobs 578): wallet 0x88cd…b6e8's WBTC/USDC borrow, read through rails-server's
// /api/at-block/morpho-optimism/position on 11 Nov 2026. Its borrow shares moved inside the 30 days.
const OP_READ = {
  chainId: 10,
  head: {
    block: 159401075,
    time: 1794400927,
  },
  then: {
    block: 158082212,
    time: 1791763201,
  },
  provider: "optimism.gateway.tenderly.co",
  wallet: "0x88cd0d18e608b689fbab5644b83b08f7a267b6e8",
  market: {
    id: "0x8e77af0efaf4a3d59f37126c77f6f0ee7b56bcb1363c0986b8f6087b93ba833e",
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
      lastUpdate: "1794400555",
      fee: "0",
    },
    borrowRate: "1976256180",
    rateAtTarget: "2033702600",
    price: "738597328643000000000000000000000000000",
  },
  position: {
    supplyShares: "0",
    borrowShares: "343252122114835888",
    collateral: "848555312",
  },
  past: {
    position: {
      supplyShares: "0",
      borrowShares: "336537626599415933",
      collateral: "848555312",
    },
    state: {
      totalSupplyAssets: "478907648927",
      totalSupplyShares: "463531363864022193",
      totalBorrowAssets: "435594162031",
      totalBorrowShares: "419670180356703212",
      lastUpdate: "1791761095",
      fee: "0",
    },
    borrowRate: "1892065507",
  },
  tokens: {
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": {
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    "0x68f180fcce6836688e9084f035309e29bf0a2095": {
      symbol: "WBTC",
      decimals: 8,
      name: "Wrapped BTC",
    },
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

test("Optimism: the WBTC/USDC borrow, its dollars at the Chainlink USDC feed", () => {
  const f = morphoAtBlockPosition(OP_READ);
  near(f.collateral, 8.48555312, 1e-9, "collateral in WBTC");
  near(f.oraclePrice, 73859.7328643, 0.001, "one WBTC in USDC at the oracle");
  near(f.debt, (343252122114835888 / 364056602443360623) * 380152.91881, 1, "debt in USDC");
  near(f.ltv, f.debt / f.collateralInLoan, 1e-12, "LTV");
  assert.equal(f.usd.feed.source, "chainlink", "the price names its source");
  near(f.debtUsd, f.debt * 0.99971629, 1e-6, "debt at the USDC/USD feed");
  assert.equal(f.debtInterest.state, "changed", "the shares moved inside the 30 days");
});

test("Optimism: a loan token with no feed takes Aave V3's oracle price, 8 decimals", () => {
  const usdFeeds = [
    {
      token: OP_READ.market.loanToken,
      feed: "0xd81eb3728a631871a7ebbad631b5f424909f0c77",
      name: "AaveOracle",
      description: null,
      decimals: 8,
      answer: "100010000",
      updatedAt: null,
      source: "aave-oracle",
    },
  ];
  const f = morphoAtBlockPosition({ ...OP_READ, usdFeeds });
  near(f.usd.price, 1.0001, 1e-12, "getAssetPrice ÷ 10^8");
  assert.equal(f.usd.feed.source, "aave-oracle", "named as the AaveOracle's");
  near(f.collateralUsd, f.collateralInLoan * 1.0001, 1e-6, "collateral at the oracle, then the Aave price");
});

const { dollarFoot } = await import("../../lib/morpho-at-block/words.ts");
const { MORPHO_ARC, MORPHO_OPTIMISM } = await import("../../lib/morpho-at-block/types.ts");

test("the card's foot names the read that priced the loan token", () => {
  const arc = morphoAtBlockPosition(READ);
  assert.equal(
    dollarFoot(arc, MORPHO_ARC),
    "Dollar values use the Chainlink USDC / USD feed on Arc; collateral is valued through the market's oracle in USDC.",
    "Arc's line as it was",
  );
  assert.equal(
    dollarFoot(morphoAtBlockPosition({ ...READ, usdFeeds: [] }), MORPHO_ARC),
    "Arc has no Chainlink feed for USDC in Aave's address book, so the figures stay in USDC.",
    "Arc's unpriced line as it was",
  );
  const op = morphoAtBlockPosition({
    ...OP_READ,
    usdFeeds: [
      { ...OP_READ.usdFeeds[0], feed: MORPHO_OPTIMISM.aaveOracle.address, source: "aave-oracle", decimals: 8 },
    ],
  });
  assert.match(
    dollarFoot(op, MORPHO_OPTIMISM),
    /^Dollar values use Aave V3's oracle on Optimism for USDC;/,
    "the Aave source",
  );
  assert.match(
    dollarFoot(morphoAtBlockPosition({ ...OP_READ, usdFeeds: [] }), MORPHO_OPTIMISM),
    /^Optimism has no Chainlink feed for USDC in Aave's address book and Aave V3's oracle there does not price it/,
    "neither source",
  );
  assert.equal(MORPHO_OPTIMISM.contracts.morpho, "0xce95afbb8ea029495c66020883f87aae8864af92", "Morpho on Optimism");
});
