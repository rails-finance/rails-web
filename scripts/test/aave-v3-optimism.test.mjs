// lib/aave-v3-optimism/position.ts against wallet 0xb32c…3321's account on Aave V3 Optimism (read through
// rails-server's /api/at-block/aave-v3-optimism/position on 11 Nov 2026, rails-ops ui-jobs 578): the
// amounts from scaled balances and indexes rounded as the tokens round, dollars at the AaveOracle, the
// totals agreeing with the Pool's getUserAccountData, 30-day interest where the scaled balance held, and
// the withheld cases.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { opPosition, interestOf, supplyRaw, debtRaw } = await import("../../lib/aave-v3-optimism/position.ts");

const READ = {
  chainId: 10,
  head: {
    block: 159398857,
    time: 1794396491,
  },
  then: {
    block: 158082212,
    time: 1791763201,
  },
  provider: "optimism.gateway.tenderly.co",
  wallet: "0xb32cb14f2a5b17d1f1343749e302316be5133321",
  pool: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  oracle: "0xd81eb3728a631871a7ebbad631b5f424909f0c77",
  uiPoolDataProvider: "0x68100bd5345ea474d93577127c11f39ff8463e93",
  addressesProvider: "0xa97684ead0e402dc232d5a977953df7ecbab3cdb",
  account: {
    totalCollateralBase: "209760110169659",
    totalDebtBase: "80661260014283",
    availableBorrowsBase: "77749575185843",
    currentLiquidationThreshold: "7941",
    ltv: "7552",
    healthFactor: "2065318645528579441",
  },
  emode: null,
  emodeThen: 0,
  reserves: [
    {
      asset: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      id: 4,
      aToken: "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
      variableDebtToken: "0x0c84331e39d6658cd6e6b9ba04736cc4c4734351",
      configuration: "7237005577332262213973187317040823326737042680862827524912462693536075882304",
      liquidityRate: "11491774911008572539466594",
      variableBorrowRate: "18179257628101253881043118",
      scaledSupply: "101153302657292818385",
      scaledDebt: "155487213848006013",
      isCollateral: true,
      indexes: {
        income: "1058247745729097140191268612",
        debt: "1119033064499447314507595212",
      },
      price: "205688063737",
      priceSource: "0x13e3ee699d1909e989722e753853ae30b17e08c5",
      past: {
        scaledSupply: "9458805605484521205",
        scaledDebt: "155487213848006013",
        indexes: {
          income: "1057302241789703963576845044",
          debt: "1117394875923461141412366427",
        },
      },
    },
    {
      asset: "0x1f32b1c2345538c0c6f582fcb022739c4a194ebb",
      symbol: "wstETH",
      decimals: 18,
      id: 9,
      aToken: "0xc45a479877e1e9dfe9fcd4056c699575a1045daa",
      variableDebtToken: "0x34e2ed44ef7466d5f9e0b782b5c08b57475e7907",
      configuration: "7237005577332262213973187317040823326404735681907459059043192028764374310220",
      liquidityRate: "9888800053050702885856",
      variableBorrowRate: "2863513660032303516646993",
      scaledSupply: "730220876256523758291",
      scaledDebt: "0",
      isCollateral: true,
      indexes: {
        income: "1000855037788867761898694138",
        debt: "1015237764011261203790010728",
      },
      price: "256883630170",
      priceSource: "0x724e47194d97263ccb71fdad84b4fed18a8be387",
      past: {
        scaledSupply: "730220876256523758291",
        scaledDebt: "0",
        indexes: {
          income: "1000854178941015523026465496",
          debt: "1014993998080544917836730989",
        },
      },
    },
    {
      asset: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      symbol: "USDC",
      decimals: 6,
      id: 13,
      aToken: "0x38d693ce1df5aadf7bc62595a37d667ad57922e5",
      variableDebtToken: "0x5d557b07776d12967914379c71a1310e917c7555",
      configuration: "7237005577332262213973186942896406494513353280046704560039872738807055384576",
      liquidityRate: "56619461426567158346617192",
      variableBorrowRate: "67809963513457084842833941",
      scaledSupply: "0",
      scaledDebt: "660024209185",
      isCollateral: false,
      indexes: {
        income: "1161909637780005742155038972",
        debt: "1221899907194823701082093128",
      },
      price: "99971629",
      priceSource: "0x6379a975ef93ec2be87f56a02ccf8535dfade201",
      past: {
        scaledSupply: "0",
        scaledDebt: "317839412078",
        indexes: {
          income: "1156807846159111167366561960",
          debt: "1215485826603512228341847366",
        },
      },
    },
  ],
};

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test("balances round as the tokens do: an aToken down, a debt token up", () => {
  const ray = "1000000000000000000000000001";
  assert.equal(supplyRaw("999999999999999999999999999", ray), BigInt("999999999999999999999999999"), "down");
  assert.equal(debtRaw("1000000000000000000000000000", ray), BigInt("1000000000000000000000000001"), "up");
  assert.equal(debtRaw("0", ray), BigInt(0), "zero stays zero");
});

test("the account: amounts, dollars at the oracle, the Pool's totals and health factor", () => {
  const p = opPosition(READ);
  const by = Object.fromEntries(p.reserves.map((x) => [x.symbol, x]));
  near(by.wstETH.supplied, 730.84519, 1e-6, "wstETH supplied");
  near(by.WETH.debt, 0.1739957, 1e-5, "WETH owed");
  near(p.collateralUsd, Number(READ.account.totalCollateralBase) / 1e8, 1e-6, "collateral matches getUserAccountData");
  near(p.debtUsd, Number(READ.account.totalDebtBase) / 1e8, 1e-6, "debt matches getUserAccountData");
  near(p.healthFactor, 2.0653186, 1e-6, "health factor");
  near(p.roomToBorrowUsd, 777495.75185843, 1e-9, "room to borrow");
  assert.equal(p.emode, null, "no eMode category");
  near(by.wstETH.liquidationThreshold, 0.79, 1e-9, "the reserve's own threshold");
  assert.deepEqual(p.unpriced, [], "every balance priced");
});

test("30-day interest where the scaled balance held, withheld where it moved", () => {
  const p = opPosition(READ);
  const by = Object.fromEntries(p.reserves.map((x) => [x.symbol, x]));
  assert.equal(by.wstETH.supplyInterest.state, "ok", "wstETH held");
  near(by.wstETH.supplyInterest.amount, 0.000627, 0.01, "wstETH earned");
  assert.equal(by.WETH.debtInterest.state, "ok", "the WETH debt held");
  near(by.WETH.debtInterest.amount, 0.0002547, 0.01, "WETH charged");
  assert.equal(by.WETH.supplyInterest.state, "changed", "WETH supply moved");
  assert.equal(by.USDC.debtInterest.state, "changed", "USDC debt moved");
  const r = READ.reserves.find((x) => x.symbol === "USDC");
  assert.equal(
    interestOf("debt", { ...r, past: { ...r.past, scaledDebt: "0" } }, 1).state,
    "opened",
    "a debt opened inside the window",
  );
  assert.equal(interestOf("debt", { ...r, past: null }, 1).state, "unread", "no past read");
});
