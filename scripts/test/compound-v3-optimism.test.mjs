// lib/compound-v3-optimism/position.ts against wallet 0xa24d…6c10's account in Compound V3's USDC Comet on
// Optimism (read through rails-server's /api/at-block/compound-v3-optimism/position on 11 Nov 2026, rails-ops
// ui-jobs 578): collateral at the Comet's prices, the borrowing limit and absorb line agreeing with the
// Comet's own verdicts, 30-day interest where the principal held, the withheld cases, and the WETH Comet's
// dollars through the USDC Comet's WETH price.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { positionFigures, accountFigures, interestOf, fxOf } = await import(
  "../../lib/compound-v3-optimism/position.ts"
);

const READ = {
  chainId: 10,
  head: {
    block: 159399872,
    time: 1794398521,
  },
  then: {
    block: 158082212,
    time: 1791763201,
  },
  provider: "optimism.gateway.tenderly.co",
  wallet: "0xa24dbaef7b10866d9f195ca829395676f8da6c10",
  account: {
    key: "usdc",
    label: "cUSDCv3",
    comet: "0x2e44e174f7d53f0212823acc11c01a11d58c5bcb",
    baseSymbol: "USDC",
    baseToken: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    baseDecimals: 6,
    quoteUnit: "USD",
    baseFeed: "0x16a9fa2fda030272ce99b29cf780dfa30361e0f3",
    basePrice: "99971629",
    supply: "0",
    borrow: "11935324547",
    principal: "-10276737766",
    isBorrowCollateralized: true,
    isLiquidatable: false,
    collateral: [
      {
        asset: "0x4200000000000000000000000000000000000042",
        symbol: "OP",
        scale: "1000000000000000000",
        priceFeed: "0x0d276fc14719f9292d5c1ea2198673d1f4269246",
        price: "10028266",
        balance: "182923520114486955283",
        borrowCollateralFactor: "650000000000000000",
        liquidateCollateralFactor: "700000000000000000",
        liquidationFactor: "800000000000000000",
      },
      {
        asset: "0x4200000000000000000000000000000000000006",
        symbol: "WETH",
        scale: "1000000000000000000",
        priceFeed: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
        price: "205408000000",
        balance: "4889000000000000000",
        borrowCollateralFactor: "830000000000000000",
        liquidateCollateralFactor: "880000000000000000",
        liquidationFactor: "930000000000000000",
      },
      {
        asset: "0x68f180fcce6836688e9084f035309e29bf0a2095",
        symbol: "WBTC",
        scale: "100000000",
        priceFeed: "0x718a5788b89454aae3a028ae9c111a29be6c2a6f",
        price: "7376276044524",
        balance: "4971875",
        borrowCollateralFactor: "800000000000000000",
        liquidateCollateralFactor: "850000000000000000",
        liquidationFactor: "900000000000000000",
      },
      {
        asset: "0x1f32b1c2345538c0c6f582fcb022739c4a194ebb",
        symbol: "wstETH",
        scale: "1000000000000000000",
        priceFeed: "0x5d173813b4505701e79e654b36a95e6c1fad4448",
        price: "256533858831",
        balance: "5953742847870199097",
        borrowCollateralFactor: "800000000000000000",
        liquidateCollateralFactor: "850000000000000000",
        liquidationFactor: "900000000000000000",
      },
    ],
  },
  ethUsd: null,
  utilization: "925268683790786352",
  supplyRate: "3767651224",
  borrowRate: "4313036678",
  rewards: {
    contract: "0x443ea0340cb75a160f31a440722dec7b5bc3c2e9",
    token: "0x7e7d4467112689329f7e06571ed0e8cbad4910ee",
    owed: "5181455000000000000",
  },
  past: {
    principal: "-10276737766",
    supply: "0",
    borrow: "11853742710",
  },
};

const close = (a, b, what) => assert.ok(Math.abs(a - b) <= Math.abs(b) * 1e-9, `${what}: ${a} vs ${b}`);

test("a USDC borrower: debt at the base price, collateral at each feed, verdicts agree", () => {
  const p = positionFigures(READ);
  assert.equal(p.borrowed, 11935.324547, "borrowBalanceOf in USDC");
  assert.equal(p.supplied, 0, "nothing lent");
  close(p.debtValue, 11935.324547 * 0.99971629, "debt value at the USDC feed");
  assert.deepEqual(
    p.collateral.map((c) => c.symbol),
    ["wstETH", "WETH", "WBTC", "OP"],
    "largest value first",
  );
  const weth = p.collateral.find((c) => c.symbol === "WETH");
  close(weth.value, 4.889 * 2054.08, "WETH at its feed");
  assert.equal(weth.borrowFactor, 0.83, "borrow factor");
  assert.equal(weth.liquidateFactor, 0.88, "liquidate factor");
  close(
    p.borrowCapacity,
    p.collateral.reduce((t, c) => t + c.value * c.borrowFactor, 0),
    "borrow capacity",
  );
  assert.ok(p.limitUsed > 0 && p.limitUsed < 1, "inside the limit");
  assert.equal(p.limitUsed < 1, READ.account.isBorrowCollateralized, "agrees with isBorrowCollateralized");
  assert.equal(p.lineReached >= 1, READ.account.isLiquidatable, "agrees with isLiquidatable");
  close(p.dropToLine, 1 - p.lineReached, "the drop to the line");
  close(p.roomToBorrow, (p.borrowCapacity - p.debtValue) / p.basePrice, "room in USDC");
  assert.equal(p.fx, 1, "a USD Comet's dollars are its quote");
  close(p.borrowApr, (4313036678 * 31536000) / 1e18, "the borrow rate a year");
  assert.equal(p.rewardsOwed, 5.181455, "COMP owed");
});

test("30-day interest: the principal held, so the balance now less the balance then", () => {
  const i = interestOf(READ, 1);
  assert.equal(i.state, "ok", "the principal is the same at both reads");
  close(i.amount, 81.581837, "11,935.324547 − 11,853.74271 USDC");
  close(i.usd, 81.581837 * 0.99971629, "at the USDC feed");
});

test("withheld interest: opened, changed, unread; none without base", () => {
  assert.deepEqual(
    interestOf({ ...READ, past: { principal: "0", supply: "0", borrow: "0" } }, 1),
    { state: "opened" },
    "opened",
  );
  assert.deepEqual(
    interestOf({ ...READ, past: { principal: "-576437273", supply: "0", borrow: "652002535" } }, 1),
    { state: "changed" },
    "changed",
  );
  assert.deepEqual(interestOf({ ...READ, past: null }, 1), { state: "unread" }, "unread");
  assert.equal(
    interestOf({ ...READ, account: { ...READ.account, principal: "0", borrow: "0" } }, 1),
    null,
    "no base, no interest",
  );
});

test("the WETH Comet: figures in ETH, dollars at the USDC Comet's WETH price", () => {
  const ethUsd = {
    comet: "0x2e44e174f7d53f0212823acc11c01a11d58c5bcb",
    priceFeed: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
    price: "205408000000",
  };
  assert.equal(fxOf("ETH", ethUsd), 2054.08, "WETH in dollars");
  assert.equal(fxOf("ETH", null), null, "unread: no dollars");
  const a = {
    ...READ.account,
    key: "weth",
    quoteUnit: "ETH",
    baseSymbol: "WETH",
    baseDecimals: 18,
    basePrice: "100000000",
    borrow: "10000113033982",
    principal: "-9445821183713",
    collateral: [{ ...READ.account.collateral[3], price: "124889906", balance: "68437190613155" }],
  };
  const f = accountFigures(a, ethUsd);
  close(f.borrowedUsd, 0.000010000113033982 * 2054.08, "debt in dollars");
  close(f.collateralUsd, 0.000068437190613155 * 1.24889906 * 2054.08, "wstETH in ETH, then dollars");
  assert.equal(accountFigures(a, null).borrowedUsd, null, "no dollars without the leg");
});

test("an account holding nothing is not held; a zero-priced asset is unpriced", () => {
  const empty = accountFigures({ ...READ.account, supply: "0", borrow: "0", principal: "0", collateral: [] }, null);
  assert.equal(empty.held, false, "nothing held");
  const z = accountFigures(
    { ...READ.account, collateral: [{ ...READ.account.collateral[0], symbol: "wUSDM", price: "0" }] },
    null,
  );
  assert.deepEqual(z.unpriced, ["wUSDM"], "named");
  assert.equal(z.collateral[0].usd, null, "no dollars");
});
