// lib/compound-arbitrum/comet-cards.ts against a stored /positions row.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  cometFooterLead,
  cometOpen,
  expandCards,
  footerFigures,
  readCometMarkets,
} from "../../lib/compound-arbitrum/comet-cards.ts";

// The four Comets as lib/compound-arbitrum/asset-catalog.ts lists them.
const ROSTER = [
  { key: "usdc", label: "cUSDCv3", comet: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf", baseSymbol: "USDC" },
  { key: "usdce", label: "cUSDCev3", comet: "0xa5edbdd9646f8dff606d7448e414884c7d905dca", baseSymbol: "USDC.e" },
  { key: "usdt", label: "cUSDTv3", comet: "0xd98be00b5d27fc98112bde293e487f8d4ca57d07", baseSymbol: "USDT" },
  { key: "weth", label: "cWETHv3", comet: "0x6f7d514bbd4aff3bcd1140b7344b32f063dee486", baseSymbol: "WETH" },
];

const WALLET = "0x06ef90d2416582eb1ceb7634f5347baeb3397c72";
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const ARB = "0x912ce59144191c1204e64559fe8253a0e49e6548";
const WBTC = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f";
const GMX = "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a";

const market = (comet, over = {}) => ({
  comet,
  baseSupplied: "0",
  baseBorrowed: "0",
  collateral: [],
  isLiquidatable: false,
  supplyUsd: 0,
  borrowUsd: 0,
  collateralUsd: 0,
  ...over,
});

/** The wire `markets` of the fixture wallet: USDC borrow with one collateral,
 *  USDT borrow with three, USDC.e collateral only, and a closed WETH Comet. */
const WIRE_MARKETS = [
  market(ROSTER[0].comet, {
    baseBorrowed: "1500000000",
    collateral: [{ asset: WETH, amount: "1000000000000000000", usd: 2600 }],
    borrowUsd: 1500,
    collateralUsd: 2600,
  }),
  market(ROSTER[2].comet, {
    baseBorrowed: "800000000",
    collateral: [
      { asset: WETH, amount: "500000000000000000", usd: 1300 },
      { asset: ARB, amount: "2000000000000000000000", usd: 900 },
      { asset: WBTC, amount: "1000000", usd: 650 },
    ],
    isLiquidatable: true,
    borrowUsd: 800,
    collateralUsd: 2850,
  }),
  market(ROSTER[1].comet, {
    collateral: [{ asset: GMX, amount: "10000000000000000000", usd: 250 }],
    collateralUsd: 250,
  }),
  market(ROSTER[3].comet, {
    collateral: [{ asset: "0x5979d7b546e38e414f7e9822514be443a4800529", amount: "0", usd: 0 }],
  }),
];

const row = (wallet, markets) => ({ wallet, lastActivityBlock: 516600000, ...(markets ? { markets } : {}) });

test("the fixture wallet draws three Comet cards, in stored order", () => {
  const cards = expandCards([row(WALLET, readCometMarkets(WIRE_MARKETS))], ROSTER);
  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => [c.comet.key, c.comet.label, c.comet.market.isLiquidatable]),
    [
      ["usdc", "cUSDCv3", false],
      ["usdt", "cUSDTv3", true],
      ["usdce", "cUSDCev3", false],
    ],
  );
  assert.equal(cards[1].comet.market.collateral.length, 3);
  assert.deepEqual(footerFigures(cards), { cards: 3, wallets: 1 });
});

test("the open rule: base supplied, base borrowed, or any collateral", () => {
  assert.equal(cometOpen(market(ROSTER[0].comet)), false);
  assert.equal(cometOpen(market(ROSTER[0].comet, { baseSupplied: "1" })), true);
  assert.equal(cometOpen(market(ROSTER[0].comet, { baseBorrowed: "1" })), true);
  assert.equal(cometOpen(market(ROSTER[0].comet, { collateral: [{ asset: ARB, amount: "1", usd: null }] })), true);
  assert.equal(cometOpen(market(ROSTER[0].comet, { collateral: [{ asset: ARB, amount: "0", usd: 0 }] })), false);
});

test("a row without markets keeps one card; a row with no open Comet draws none", () => {
  const other = "0x1111111111111111111111111111111111111111";
  const closed = "0x2222222222222222222222222222222222222222";
  const cards = expandCards(
    [row(WALLET, readCometMarkets(WIRE_MARKETS)), row(other), row(closed, [market(ROSTER[3].comet)])],
    ROSTER,
  );
  assert.equal(cards.length, 4);
  assert.equal(cards[3].row.wallet, other);
  assert.equal(cards[3].comet, undefined);
  assert.deepEqual(footerFigures(cards), { cards: 4, wallets: 2 });
});

test("a Comet outside the roster is named short and has no key", () => {
  const stray = "0xabcdef0000000000000000000000000000001234";
  const [card] = expandCards([row(WALLET, [market(stray, { baseSupplied: "5" })])], ROSTER);
  assert.equal(card.comet.key, null);
  assert.equal(card.comet.label, "0xabcd…1234");
});

test("the reader drops a malformed element and refuses a non-array", () => {
  assert.equal(readCometMarkets(undefined), undefined);
  assert.equal(readCometMarkets({ comet: ROSTER[0].comet }), undefined);
  const read = readCometMarkets([
    ...WIRE_MARKETS,
    { comet: "not-an-address" },
    market(ROSTER[0].comet, { baseSupplied: "1.5" }),
    market(ROSTER[0].comet, { collateral: [{ asset: ARB, amount: "-1", usd: 1 }] }),
    null,
  ]);
  assert.equal(read.length, 4);
  // Upper-case addresses and decimal-string dollars read as the contract's.
  const [m] = readCometMarkets([market(ROSTER[0].comet.toUpperCase().replace("0X", "0x"), { supplyUsd: "12.5" })]);
  assert.equal(m.comet, ROSTER[0].comet);
  assert.equal(m.supplyUsd, 12.5);
});

test("the footer's words", () => {
  assert.equal(
    cometFooterLead({ cards: 3, wallets: 1 }, 412),
    "Indexed 3 Comet positions across 1 wallet, of 412 wallets with an open position, counted on the chain",
  );
  assert.equal(cometFooterLead({ cards: 1, wallets: 1 }, null), "Indexed 1 Comet position across 1 wallet");
  assert.equal(
    cometFooterLead({ cards: 1200, wallets: 1050 }, 2400),
    "Indexed 1,200 Comet positions across 1,050 wallets, of 2,400 wallets with an open position, counted on the chain",
  );
});
