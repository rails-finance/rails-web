// lib/fluid-base/position.ts against NFT 10600's read on Base (cbBTC/GHO, read
// through rails-server's /api/at-block/fluid-base/position on 10 Nov 2026,
// rails-ops ui-jobs 574): the amounts, the ratio in the vault oracle's space,
// 30-day interest from the exchange prices, dollars at Aave V3 Base's oracle,
// the two cases where no interest is stated, and the dollar switch off.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// position.ts imports its switch by extensionless relative specifier; this resolver adds the `.ts`.
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

const { fluidBasePosition, interestWindow, rawOf, exact } = await import("../../lib/fluid-base/position.ts");
const { FLUID_BASE_DOLLARS } = await import("../../lib/fluid-base/dollars.ts");

const READ = {
  chainId: 8453,
  id: "10600",
  head: {
    block: 55814083,
    time: 1794353192,
  },
  then: {
    block: 52443727,
    time: 1791676801,
  },
  provider: "base.gateway.tenderly.co",
  resolver: "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC",
  factory: "0x324c5Dc1fC42c7a4D43d92df1eBA58a54d13Bf2d",
  vault: "0x991416539E9DA46db233bCcbaEA38C4f852776D4",
  vaultId: 24,
  vaultType: 10000,
  supplyLeg: {
    kind: "token",
    token: {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      symbol: "cbBTC",
      decimals: 8,
    },
    token1: null,
    priceAsset: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  },
  borrowLeg: {
    kind: "token",
    token: {
      address: "0x6Bb7a212910682DCFdbd5BCBb3e28FB4E8da10Ee",
      symbol: "GHO",
      decimals: 18,
    },
    token1: null,
    priceAsset: "0x6Bb7a212910682DCFdbd5BCBb3e28FB4E8da10Ee",
  },
  now: {
    owner: "0x33b40352AE34d56041d048Dc60B1670821A89308",
    supply: "113389539",
    borrow: "44124300580530070537015",
    dustBorrow: "6798606920709467396",
    tick: "22359",
    isLiquidated: false,
    isSupplyPosition: false,
    collateralFactor: 8000,
    liquidationThreshold: 8500,
    liquidationMaxLimit: 9000,
    liquidationPenalty: 500,
    oracle: "0xF833D0E7E4A46f86917830b1d1a54C5a459fC0f3",
    oraclePriceOperate: "736574656950000000000000000000000000000000",
    oraclePriceLiquidate: "736574656950000000000000000000000000000000",
    vaultSupplyExchangePrice: "1000007485020",
    vaultBorrowExchangePrice: "1085182543310",
    supplyRateVault: "0",
    borrowRateVault: "547",
    totalPositions: "143",
    totalSupplyVault: "497278886",
    totalBorrowVault: "200104596610730409297872",
  },
  past: {
    owner: "0x33b40352AE34d56041d048Dc60B1670821A89308",
    supply: "113389508",
    borrow: "43909896662926286883795",
    dustBorrow: "6765571882445506883",
    tick: "22359",
    isLiquidated: false,
    isSupplyPosition: false,
    collateralFactor: 8000,
    liquidationThreshold: 8500,
    liquidationMaxLimit: 9000,
    liquidationPenalty: 500,
    oracle: "0xF833D0E7E4A46f86917830b1d1a54C5a459fC0f3",
    oraclePriceOperate: "829555889319000000000000000000000000000000",
    oraclePriceLiquidate: "829555889319000000000000000000000000000000",
    vaultSupplyExchangePrice: "1000007210364",
    vaultBorrowExchangePrice: "1079909544406",
    supplyRateVault: "0",
    borrowRateVault: "578",
    totalPositions: "140",
    totalSupplyVault: "532937901",
    totalBorrowVault: "215287500742168463033758",
  },
  usd: {
    oracle: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
    baseUnit: "100000000",
    supply: "7367139999995",
    borrow: "100000000",
  },
};

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("NFT 10600: amounts, ratio and limits", () => {
  const p = fluidBasePosition(READ);
  assert.equal(p.colUnit, "cbBTC");
  assert.equal(p.debtUnit, "GHO");
  assert.equal(p.supplyExact, "1.13389539");
  assert.equal(p.borrowExact, "44124.300580530070537015");
  close(p.priceLiquidate, 73657.465695, 1e-6);
  close(p.ratio, 44124.30058 / (1.13389539 * 73657.465695), 1e-9);
  assert.equal(p.liquidationThreshold, READ.now.liquidationThreshold / 1e4);
  close(p.borrowRoom, 1.13389539 * 73657.465695 * p.collateralFactor - 44124.30058, 1e-6);
});

test("NFT 10600: raw amounts match 30 days back, so the interest is stated", () => {
  assert.equal(rawOf(READ.now, "supply"), rawOf(READ.past, "supply"));
  assert.equal(rawOf(READ.now, "borrow"), rawOf(READ.past, "borrow"));
  const p = fluidBasePosition(READ);
  assert.equal(p.interest.state, "ok");
  // raw × (price now − price then) ÷ 1e12, to the unit
  const raw = rawOf(READ.now, "borrow");
  const want = BigInt(READ.now.borrow) - (raw * BigInt(READ.past.vaultBorrowExchangePrice)) / BigInt(1e12);
  assert.equal(p.interest.borrowExact, exact(want, 18));
  close(p.interest.borrow, 214.4, 0.5);
  assert.ok(p.interest.supply > 0 && p.interest.supply < 1e-6);
});

test("NFT 10600: dollars at Aave V3 Base's oracle", () => {
  const p = fluidBasePosition(READ);
  close(p.usd.supplyPrice, 73671.4, 0.01);
  close(p.usd.supply, 1.13389539 * 73671.39999995, 1e-6);
  close(p.usd.borrow, 44124.30058, 1e-4);
  close(p.usd.borrowInterest, p.interest.borrow, 1e-9);
});

test("no interest where the NFT is newer than the window or its raw amount moved", () => {
  assert.equal(interestWindow({ ...READ, past: null }).state, "opened");
  const moved = { ...READ, past: { ...READ.past, borrow: String(BigInt(READ.past.borrow) / BigInt(2)) } };
  assert.equal(interestWindow(moved).state, "changed");
  assert.equal(fluidBasePosition(moved).usd.borrowInterest, null);
});

test("a DEX-share side has no rate and no dollar price", () => {
  const shares = {
    ...READ,
    supplyLeg: { kind: "shares", token: READ.supplyLeg.token, token1: READ.borrowLeg.token, priceAsset: null },
    usd: { ...READ.usd, supply: null },
  };
  const p = fluidBasePosition(shares);
  assert.equal(p.colUnit, "cbBTC·GHO shares");
  assert.equal(p.supplyRate, null);
  assert.equal(p.usd.supply, null);
});

test("the dollar switch off: every dollar figure is null, the token figures unchanged", () => {
  const on = fluidBasePosition(READ, true);
  const off = fluidBasePosition(READ, false);
  assert.deepEqual(off.usd, {
    supplyPrice: null,
    borrowPrice: null,
    supply: null,
    borrow: null,
    supplyInterest: null,
    borrowInterest: null,
  });
  assert.equal(off.supplyExact, on.supplyExact);
  assert.equal(off.borrowExact, on.borrowExact);
  assert.equal(off.ratio, on.ratio);
  assert.deepEqual(off.interest, on.interest);
  // The default follows the switch.
  assert.equal(fluidBasePosition(READ).usd.supply === null, !FLUID_BASE_DOLLARS);
});
