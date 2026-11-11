// lib/euler/position.ts against reads in the shape of rails-server's Euler at-block
// routes, with the figures of a Base loan read on 10 Nov 2026 (account 2 of
// 0x96c1…07ac borrowing USDC from eUSDC-102 against eAERO-7).
// Run: npm test
//
// position.ts imports its types module by extensionless relative specifier, so this file
// registers a resolver that adds the `.ts` before loading it.
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

const { eulerPosition, eulerWindow, scaled, unitShow, walletRows } = await import("../../lib/euler/position.ts");

const USDC = { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 };
const AERO = { address: "0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee", symbol: "AERO", decimals: 18 };
const USD = { address: "0x0000000000000000000000000000000000000348", usd: true, symbol: "USD", decimals: 18 };
const HEAD = { block: 55_812_449, time: 1_794_352_865 };
const THEN = { block: 52_443_727, time: 1_791_676_801 };

const vault = (over = {}) => ({
  address: "0xEef57677c2FC1a930eed234E3545e750C88f6743",
  name: "EVK Vault eUSDC-102",
  symbol: "eUSDC-102",
  decimals: 6,
  asset: USDC,
  unit: USD,
  oracle: "0x78C68E226437EC334BCfeF969c75D3224d6176d4",
  interestRate: "11512255653400157300",
  interestAccumulator: "1030853138883472077081401640",
  totalAssets: "78963887439",
  totalBorrows: "77561607179",
  shares: "0",
  assets: "0",
  sharePrice: "1022350",
  debt: "1681877428",
  assetPrice: "999746330000000000",
  ...over,
});

const loan = {
  chainId: 8453,
  evc: "0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989",
  factory: "0x7F321498A801A191a93C840750ed637149dDf8D0",
  head: HEAD,
  then: THEN,
  provider: "test",
  account: "0x96c16626fd02Bf43C3b0D4D2Ae2B31cB900d07aE",
  owner: "0x96C16626Fd02Bf43c3b0d4d2aE2B31CB900d07ac",
  index: 2,
  vault: vault(),
  past: {
    sharePrice: "1015828",
    interestAccumulator: "1022156470651751066595445631",
    shares: "0",
    debt: "0",
    assets: "0",
  },
  controllers: ["0xEef57677c2FC1a930eed234E3545e750C88f6743"],
  collaterals: ["0x3895eD2c5fA7F469365db24187064A614f2e07E6"],
  borrow: {
    liquidation: { collateralValue: "2227036151975807199847", liabilityValue: "1681450786152839240000" },
    borrowing: { collateralValue: "2096034025388995011621", liabilityValue: "1681450786152839240000" },
    collaterals: [
      {
        vault: "0x3895eD2c5fA7F469365db24187064A614f2e07E6",
        vaultSymbol: "eAERO-7",
        asset: AERO,
        shares: "4838415486266535125544",
        assets: "4838415486268640504746",
        value: "2620042531736243764527",
        ltvBorrow: 8000,
        ltvLiquidation: 8500,
      },
    ],
    truncated: false,
  },
  collateralFor: [],
};

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("scaled: a raw integer over 10^places, signed", () => {
  assert.equal(scaled("1681877428", 6), 1681.877428);
  assert.equal(scaled("-2500", 3), -2.5);
  close(scaled("4838415486268640504746", 18), 4838.415486268641);
});

test("unitShow: dollars for 0x…0348, the unit's token otherwise, none for a unit that is not a token", () => {
  assert.deepEqual(unitShow(USD), { kind: "usd" });
  assert.deepEqual(
    unitShow({ address: "0x4200000000000000000000000000000000000006", usd: false, symbol: "WETH", decimals: 18 }),
    {
      kind: "token",
      symbol: "WETH",
    },
  );
  assert.deepEqual(
    unitShow({ address: "0x00000000000000000000000000000000000003d2", usd: false, symbol: null, decimals: 18 }),
    {
      kind: "none",
    },
  );
});

test("a loan: debt, its value, collateral, health and the window's interest", () => {
  const p = eulerPosition(loan);
  assert.equal(p.kind, "loan");
  assert.equal(p.borrowed, 1681.877428);
  close(p.price, 0.99974633);
  close(p.borrowedValue, 1681.877428 * 0.99974633);
  close(p.collateralValue, 2620.042531736244);
  close(p.health, 1.324471, 1e-6);
  assert.equal(p.collaterals[0].ltvLiquidation, 0.85);
  const days = (HEAD.time - THEN.time) / 86_400;
  close(p.window.days, days);
  const g = 1030853138883472077081401640 / 1022156470651751066595445631 - 1;
  close(p.window.indexGrowth, g, 1e-9);
  close(p.window.borrowRateYear, (g * 365) / days, 1e-9);
  // Opened: no debt at the past block, so no 30-day figure.
  assert.equal(p.windowState, "opened");
  assert.equal(p.interest, null);
  assert.equal(p.windowValue, null);
  // interestRate is per second, scaled by 10^27.
  close(p.borrowRateNow, (11512255653400157300 * 31_536_000) / 1e27, 1e-6);
  close(p.utilisation, 77561607179 / 78963887439, 1e-9);
});

test("a deposit: what the shares redeem for, and the share price's change on the shares held now", () => {
  const r = {
    ...loan,
    borrow: null,
    vault: vault({ shares: "1979102", assets: "2023315", debt: "0" }),
    past: {
      sharePrice: "1015828",
      interestAccumulator: "1022156470651751066595445631",
      shares: "1979102",
      debt: "0",
      assets: "2010408",
    },
    collateralFor: [{ vault: "0xB8B29614fc7C93a75798453EE838CA3e20B60c6F", vaultSymbol: "eAERO-6" }],
  };
  const p = eulerPosition(r);
  assert.equal(p.kind, "deposit");
  assert.equal(p.supplied, 2.023315);
  close(p.suppliedValue, 2.023315 * 0.99974633);
  // Matched: the same shares at both reads; earned is what they redeem for now less then.
  assert.equal(p.windowState, "ok");
  assert.equal(p.earned, 0.012907);
  close(p.windowValue, 0.012907 * 0.99974633);
  const g = 1022350 / 1015828 - 1;
  close(p.window.shareGrowth, g);
  close(p.window.supplyRateYear, (g * 365) / p.window.days);
  assert.equal(p.health, null);
  assert.equal(p.collateralValue, null);
});

test("a vault younger than the window: no earned or interest figure", () => {
  const p = eulerPosition({ ...loan, past: null });
  assert.equal(p.interest, null);
  assert.equal(p.earned, null);
  assert.equal(p.window.borrowRateYear, null);
  assert.equal(p.windowState, "opened");
  assert.equal(eulerWindow({ ...loan, past: null }).supplyRateYear, null);
});

test("a loan matched at both reads: the debt now less the debt then", () => {
  const a0 = BigInt("1022156470651751066595445631");
  const a1 = BigInt("1030853138883472077081401640");
  const then = (BigInt(1681877428) * a0) / a1;
  const p = eulerPosition({ ...loan, past: { ...loan.past, debt: then.toString() } });
  assert.equal(p.windowState, "ok");
  assert.equal(p.interest, scaled(BigInt(1681877428) - then, 6));
  close(p.windowValue, p.interest * 0.99974633);
});

test("changed inside the window: a loan borrowed more, a deposit's shares moved; no figure", () => {
  const borrowedMore = eulerPosition({ ...loan, past: { ...loan.past, debt: "1000000000" } });
  assert.equal(borrowedMore.windowState, "changed");
  assert.equal(borrowedMore.interest, null);
  const moved = eulerPosition({
    ...loan,
    borrow: null,
    vault: vault({ shares: "1979102", assets: "2023315", debt: "0" }),
    past: { ...loan.past, shares: "1000000", assets: "1015828" },
  });
  assert.equal(moved.windowState, "changed");
  assert.equal(moved.earned, null);
  assert.equal(moved.windowValue, null);
});

test("a vault whose oracle gave no price: no value, figures in the asset", () => {
  const p = eulerPosition({ ...loan, vault: vault({ assetPrice: null, oracle: null }) });
  assert.equal(p.price, null);
  assert.equal(p.borrowedValue, null);
});

test("walletRows: loans first within an account, the raw amount kept for the receipt", () => {
  const rows = walletRows({
    chainId: 8453,
    evc: loan.evc,
    factory: loan.factory,
    head: HEAD,
    provider: "test",
    owner: loan.owner,
    vaultCount: 457,
    findCalls: 969,
    truncated: false,
    accounts: [
      {
        index: 2,
        account: loan.account,
        controllers: loan.controllers,
        collaterals: loan.collaterals,
        holdings: [
          {
            vault: loan.collaterals[0],
            vaultSymbol: "eAERO-7",
            asset: AERO,
            shares: "1",
            assets: "4838415486268640504746",
            debt: "0",
            collateral: true,
            controller: false,
          },
          {
            vault: loan.controllers[0],
            vaultSymbol: "eUSDC-102",
            asset: USDC,
            shares: "0",
            assets: "0",
            debt: "1681877428",
            collateral: false,
            controller: true,
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.vaultSymbol, r.raw]),
    [
      ["loan", "eUSDC-102", "1681877428"],
      ["deposit", "eAERO-7", "4838415486268640504746"],
    ],
  );
  assert.equal(rows[0].amount, 1681.877428);
});

test("walletRows: a loan vault the account also holds shares in draws its loan, then its deposit", () => {
  const rows = walletRows({
    chainId: 42161,
    evc: loan.evc,
    factory: loan.factory,
    head: HEAD,
    provider: "test",
    owner: loan.owner,
    vaultCount: 193,
    findCalls: 705,
    deposits: { source: "index", through: 523_259_630 },
    truncated: false,
    accounts: [
      {
        index: 2,
        account: loan.account,
        controllers: loan.controllers,
        collaterals: [],
        holdings: [
          {
            vault: loan.controllers[0],
            vaultSymbol: "eWETH-1",
            asset: AERO,
            shares: "3463908846206924",
            assets: "3463909001596505",
            debt: "1579697396192297",
            collateral: false,
            controller: true,
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.raw]),
    [
      ["loan", "1579697396192297"],
      ["deposit", "3463909001596505"],
    ],
  );
});
