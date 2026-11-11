// lib/aave-v4-arc/position.ts against wallet 0xff65…503b's Main spoke account on Arc (read through
// rails-server's /api/at-block/aave-v4-arc/position on 11 Nov 2026, rails-ops ui-jobs 577): the
// amounts, dollars at the spoke oracle, the health factor, the borrow limit agreeing with the
// spoke's own health factor, 30-day interest where the shares match, and the withheld cases.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { arcPosition, arcWalletSpokes, interestOf } = await import("../../lib/aave-v4-arc/position.ts");

const pos = (drawn, supplied) => ({
  drawnShares: drawn,
  premiumShares: "0",
  premiumOffsetRay: "0",
  suppliedShares: supplied,
  dynamicConfigKey: 0,
});
const reserve = (o) => ({
  hub: "0x17288dfc86205301064577b98b02b81017e6f79c",
  assetId: 0,
  hasBorrow: false,
  collateralRisk: 0,
  paused: false,
  frozen: false,
  borrowable: true,
  maxLiquidationBonus: 10500,
  liquidationFee: 1000,
  priceSource: null,
  ...o,
});
const READ = {
  chainId: 5042,
  head: { block: 30671646, time: 1794391097 },
  then: { block: 25494000, time: 1791763536 },
  provider: "arc.gateway.tenderly.co",
  wallet: "0xff653908bd39fb1457464a4a060dffb36867503b",
  hub: { key: "core", name: "Core", address: "0x17288dfc86205301064577b98b02b81017e6f79c" },
  spoke: {
    key: "main",
    name: "Main",
    address: "0xb843bdc3a87a05e77e07df9fe48928b3a34b134d",
    oracle: "0x6ffe98f3422041236c19923edb949f18a69e8a09",
    priceDecimals: 8,
    liquidationConfig: null,
    reserveCount: 4,
  },
  account: {
    riskPremium: "0",
    avgCollateralFactor: "782117949075600031",
    healthFactor: "1794427538835181450",
    totalCollateralValue: "0",
    totalDebtValueRay: "0",
    activeCollateralCount: "2",
    borrowCount: "1",
  },
  reserves: [
    reserve({
      reserveId: 0,
      symbol: "USDC",
      underlying: "0x3600000000000000000000000000000000000000",
      decimals: 6,
      supplied: "0",
      debt: "457640519",
      isCollateral: false,
      hasBorrow: true,
      position: pos("455764241", "0"),
      collateralFactor: 7800,
      price: "99976679",
      drawnRate: "36242268295135933527472566",
      past: { supplied: "0", debt: "400420220", position: pos("399956126", "0") },
    }),
    reserve({
      reserveId: 2,
      symbol: "cirBTC",
      underlying: "0x171a4217b86a807a64eb94757db6849fb4bdbaa0",
      decimals: 8,
      supplied: "1365013",
      debt: "0",
      isCollateral: true,
      position: pos("0", "1365008"),
      collateralFactor: 7800,
      price: "7364492092447",
      drawnRate: "2566443250563798836842623",
      past: { supplied: "1071504", debt: "0", position: pos("0", "1071501") },
    }),
    reserve({
      reserveId: 3,
      symbol: "WETH",
      underlying: "0x128cc466b61f542da60c70e3aa11c10e19b84edb",
      decimals: 18,
      supplied: "21728780506167023",
      debt: "0",
      isCollateral: true,
      position: pos("0", "21728017790063163"),
      collateralFactor: 8300,
      price: "204638340000",
      drawnRate: "5062569551599394469506248",
      past: { supplied: "21728030603676878", debt: "0", position: pos("0", "21728017790063163") },
    }),
  ],
};

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);

test("amounts, dollars and the health factor", () => {
  const p = arcPosition(READ);
  near(p.debtUsd, 457.640519 * 0.99976679, 1e-9, "debt in USD");
  near(p.suppliedUsd, 0.01365013 * 73644.92092447 + 0.021728780506167023 * 2046.3834, 1e-6, "supplied in USD");
  near(p.healthFactor, 1.79442753883518145, 1e-12, "the spoke's health factor");
  assert.deepEqual(
    p.supplied.map((x) => x.symbol),
    ["cirBTC", "WETH"],
    "the two supplied reserves",
  );
  assert.deepEqual(p.unpriced, [], "every balance priced");
});

test("the borrow limit over the debt is the spoke's health factor", () => {
  const p = arcPosition(READ);
  near(p.borrowLimitUsd / p.debtUsd, p.healthFactor, 1e-6, "Σ collateral × factor ÷ debt");
});

test("30-day interest: stated where the shares match, withheld where they moved", () => {
  const p = arcPosition(READ);
  const weth = p.supplied.find((x) => x.symbol === "WETH");
  assert.equal(weth.supplyInterest.state, "ok", "WETH's shares match");
  near(weth.supplyInterest.amount, 749902490145 / 1e18, 1e-21, "WETH interest, from the integer difference");
  assert.equal(p.supplied.find((x) => x.symbol === "cirBTC").supplyInterest.state, "changed", "cirBTC was added to");
  assert.equal(p.borrowed[0].debtInterest.state, "changed", "USDC was borrowed again");
  near(p.borrowed[0].drawnApr, 0.036242268295135933, 1e-15, "USDC's drawn rate");
});

test("a balance opened inside the window, and one with no past read", () => {
  const r = { ...READ.reserves[2], past: { supplied: "0", debt: "0", position: pos("0", "0") } };
  assert.deepEqual(interestOf("supply", r, 1), { state: "opened" }, "no shares 30 days back");
  assert.deepEqual(interestOf("supply", { ...r, past: null }, 1), { state: "unread" }, "no past read");
});

test("no debt: no health factor", () => {
  const p = arcPosition({
    ...READ,
    account: { ...READ.account, healthFactor: (2n ** 256n - 1n).toString() },
    reserves: READ.reserves.slice(1),
  });
  assert.equal(p.healthFactor, null, "uint256 max reads as none");
});

test("a wallet's spokes keep only those with a balance", () => {
  const spoke = (key, reserves) => ({
    key,
    name: key,
    address: "0x" + "1".repeat(40),
    oracle: "0x" + "2".repeat(40),
    priceDecimals: 8,
    account: { ...READ.account, healthFactor: (2n ** 256n - 1n).toString() },
    reserves,
  });
  const out = arcWalletSpokes({
    chainId: 5042,
    head: READ.head,
    provider: "x",
    wallet: READ.wallet,
    spokes: [
      spoke("main", [
        {
          reserveId: 0,
          underlying: "0x36",
          symbol: "USDC",
          decimals: 6,
          supplied: "9000006",
          debt: "0",
          isCollateral: false,
          price: "99976679",
        },
      ]),
      spoke("forex", [
        {
          reserveId: 0,
          underlying: "0x36",
          symbol: "USDC",
          decimals: 6,
          supplied: "0",
          debt: "0",
          isCollateral: true,
          price: "99976679",
        },
      ]),
    ],
  });
  assert.deepEqual(
    out.map((s) => s.key),
    ["main"],
    "a collateral flag with no balance is not a holding",
  );
  near(out[0].suppliedUsd, 9.000006 * 0.99976679, 1e-9, "supplied in USD");
  assert.equal(out[0].healthFactor, null, "no debt");
});
