// lib/cow/aave-totals-provenance.ts (ui-jobs 712): the receipts of the CoW
// figures block and its listings. The figures here are the 20 Nov 2026 Aave V3
// totals and one priced swap from rails-server's /api/cow/ethereum/aave routes.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const P = await import("../../lib/cow/aave-totals-provenance.ts");

const totals = {
  family: "aave-v3",
  chainId: 1,
  asOf: { block: 26453647, timestamp: 1795145687, cursor: 26453691 },
  counts: {
    swaps: 91834,
    trades: 91834,
    notDecoded: 0,
    priced: 91243,
    unpriced: 591,
    pricedAtBlock: 85601,
    pricedEarlier: 5642,
    noFee: 25,
    flashPremiumRead: 0,
  },
  surplus: {
    usd: 26871521.36,
    byShape: {
      received: { usd: 14614772.05, trades: 54393 },
      returned: { usd: 12227885.13, trades: 36520 },
      paidLess: { usd: 28864.17, trades: 330 },
    },
  },
  fees: { usd: 8009766.48, trades: 91218, medianBp: 30.505 },
  priceAge: { maxBlocks: 9291, medianBlocks: 8, p90Blocks: 180, over7200: 7 },
  unpricedTokens: [
    { address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", symbol: "stETH", trades: 207, reason: "no-price" },
  ],
  freshnessBlocks: 14400,
};

// 0xaa2985eeb3…: a cbBTC buy order through the repay-with-collateral adapter.
const swap = {
  swapKey: "transfer_out:0x5c64:0xaa29:23",
  txHash: "0xaa2985eeb3447aea75bae5498b5e13375ba435bb210aef55770ba9580a053155",
  logIndex: 6,
  block: 24571190,
  timestamp: 1772471759,
  wallet: "0x2446beb3905cffbd2c5eb18f1f9c2996b05257c4",
  market: "core",
  kind: "repay_with_collateral",
  route: "cow_adapter",
  given: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  received: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  trade: {
    orderKind: "buy",
    shape: "returned",
    token: { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC", decimals: 8 },
    surplus: "241762538",
    feeGap: "52278592",
    feeBp: 28.935,
    price: {
      usd: "69342.93448177",
      block: 24571190,
      source: "iaave-oracle",
      asset: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    },
    unpriced: null,
    surplusUsd: 167645.2383268043,
    feeUsd: 36251.50979855186,
    flashPremium: null,
  },
};

test("the family figures' price leaf names no single market's oracle", () => {
  for (const r of [P.cowSurplusTotalProv(totals), P.cowFeesTotalProv(totals), P.cowPricedProv(totals)]) {
    const leaf = r.inputs.find((i) => i.pclass === "oracle");
    assert.ok(leaf, "a price leaf");
    assert.equal(leaf.contract, undefined, "trades price on their own market's oracle: Core, Prime or EtherFi");
    assert.match(leaf.value, /85,601 trades take the price the swap's Aave V3 market's oracle gave/);
    assert.match(leaf.value, /a median of 8 blocks earlier, 9,291 at most/, "the price age, once");
  }
});

test("the surplus receipt cites the docs by its leaves, and checks against the listing", () => {
  const r = P.cowSurplusTotalProv(totals, undefined, "this listing");
  assert.doesNotMatch(r.summary, /price improvement/i);
  assert.ok(
    r.inputs.some((i) => i.label === "surplus" && i.definition),
    "the Definitions leaf",
  );
  assert.equal(r.verify.text, "To check: add up the surplus of each swap in this listing; each carries a receipt.");
  assert.match(r.summary, /on Ethereum\. Each is in US dollars/);
});

test("a row's fee gap is stated in the token, or in base units where the decimals are unknown", () => {
  const bp = P.cowSwapBpProv(swap);
  assert.deepEqual(bp.inputs.map((i) => [i.label, i.value]).slice(0, 1), [["the gap, in cbBTC", "0.52278592"]]);
  const raw = P.cowSwapBpProv({ ...swap, trade: { ...swap.trade, token: { ...swap.trade.token, decimals: null } } });
  assert.deepEqual(raw.inputs[0].label, "the gap, in cbBTC base units");
  assert.equal(raw.inputs[0].value, "52278592");
});

test("a row's USD receipt: the amount in the token, the price at the block, the market's oracle", () => {
  const r = P.cowSwapUsdProv("aave-v3", swap, "surplus");
  assert.equal(r.inputs[0].value, "2.41762538");
  assert.equal(r.inputs[1].value, "69342.93448177");
  assert.equal(r.inputs[1].contract?.name, "Aave V3 core oracle");
  assert.doesNotMatch(r.summary, /price improvement/i);
  assert.equal(P.cowSwapUsdProv("aave-v3", { ...swap, trade: { ...swap.trade, price: null } }, "surplus"), null);
});
