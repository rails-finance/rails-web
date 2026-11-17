// CoW's receipts and the "input" class (rails-ops decision 0010, the
// 2026-11-17 addendum): a value read from settle()'s calldata (clearingPrices,
// the order's signed limits, executedAmount) is `input`; a Trade log field is
// `emitted`; an intermediate step the receipt works out carries no class, so
// the head lists only the classes read.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const C = await import("../../lib/shared/prov-class.ts");
const SP = await import("../../lib/cow/settlement-provenance.ts");
const SU = await import("../../lib/cow/surplus-provenance.ts");

const USDT = { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", decimals: 6 };
const USDC = { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6 };

/** The head's class set, as the inspector draws it for a computed value. */
const head = (p) => C.involvedClasses((p.inputs ?? []).filter((i) => !["block", "tx"].includes(i.label.toLowerCase())));
const classOf = (p, re) => {
  const leaf = p.inputs.find((i) => re.test(i.label));
  assert.ok(leaf, `no leaf ${re}`);
  return leaf.step || leaf.definition ? null : C.weakestClass([leaf]);
};

const trade = {
  logIndex: 7,
  owner: "0xda0c000000000000000000000000000000004482",
  sellToken: USDT.address,
  buyToken: USDC.address,
  sellAmount: "13151514009",
  buyAmount: "13140898895",
  feeAmount: "0",
  orderUid: "0x01",
  settled: {
    order: { kind: "sell", partiallyFillable: false, sellAmount: "1", buyAmount: "1", feeAmount: "0", receiver: "0x0" },
    own: { sellIndex: 2, buyIndex: 3, sellPrice: "31992268613", buyPrice: "31966724548" },
    uniform: { sellIndex: 1, buyIndex: 0, sellPrice: "31966724548", buyPrice: "31992268613" },
    ownEntries: true,
  },
};
const settlement = {
  blockNumber: 26434894,
  txHash: "0x1fc4000000000000000000000000000000000000000000000000000000c793",
  trades: [trade],
  settle: { status: "decoded", call: "wrapped", offset: 132 },
  tokens: {},
};

test("the settlement panel: clearingPrices are input, Trade log amounts emitted", () => {
  const pricing = SP.pairPricing(trade, USDT, USDC);
  assert.ok(pricing);
  const cp = SP.clearingPriceProv(settlement, trade, pricing, USDT);
  assert.equal(cp.pclass, "input");
  assert.equal(classOf(cp, /^clearingPrices\[1\]/), "input");
  assert.equal(classOf(cp, /^clearingPrices\[0\]/), "input");
  assert.deepEqual(head(cp), ["input"]);

  const gap = SP.gapProv(settlement, trade);
  assert.equal(classOf(gap, /^sold − fee$/), "emitted");
  assert.equal(classOf(gap, /^bought$/), "emitted");
  assert.equal(classOf(gap, /^clearing price, sold token$/), "input");
  assert.equal(classOf(gap, /^gap \(bp\)$/), null);
  assert.deepEqual(head(gap), ["emitted", "input"]);

  const fee = SP.feeChargeProv(settlement, trade, USDC);
  assert.equal(classOf(fee, /^order kind/), "input");
  assert.equal(classOf(fee, /clearingPrices entries$/), "input");

  assert.equal(SP.pairTradePriceProv(settlement, trade, pricing, USDT).pclass, "emitted");
});

const view = (over = {}) => ({
  kind: "sell",
  surplus: "1200",
  surplusToken: USDC.address,
  feeBp: 1.5,
  settleOffset: 0,
  call: "direct",
  feeGap: "300",
  signedFee: "100",
  flashLoan: null,
  flashRead: false,
  limit: { sell: "1000000", buy: "990000", fee: "100", amount: "990000" },
  partiallyFillable: true,
  executedAmount: "1000000",
  prices: {
    own: { sellIndex: 2, buyIndex: 3, sell: "101", buy: "100" },
    uniform: { sellIndex: 0, buyIndex: 1, sell: "100", buy: "100" },
  },
  token: USDC,
  route: "cow_adapter",
  ...over,
});
const raw = { sell: "999900", buy: "991200", fee: "100" };
const coords = { block: 26074582, txHash: "0xe2d4" };

test("the swap card's surplus line: signed limits and executedAmount are input, the Trade log emitted", () => {
  for (const kind of ["sell", "buy"]) {
    const p = SU.cowSurplusProv(view({ kind }), raw, coords);
    assert.equal(p.pclass, "input", kind);
    assert.equal(classOf(p, /^limit sell/), "input");
    assert.equal(classOf(p, /^limit buy/), "input");
    assert.equal(classOf(p, /^limit fee/), "input");
    assert.equal(classOf(p, /^executedAmount/), "input");
    assert.equal(classOf(p, /^sold \(Trade log/), "emitted");
    assert.equal(classOf(p, /^fee \(Trade log/), "emitted");
    assert.equal(classOf(p, /^bought \(Trade log/), "emitted");
    assert.equal(classOf(p, /^the limit, in/), null);
    assert.equal(classOf(p, /^surplus, in/), null);
    assert.deepEqual(head(p), ["emitted", "input"], kind);
  }
});

test("the swap card's fee line: clearingPrices are input, the Trade log emitted", () => {
  const p = SU.cowFeeProv(view(), raw, coords);
  assert.equal(p.pclass, "input");
  for (const re of [/first entry\)$/, /this trade's entry\)$/]) {
    for (const i of p.inputs.filter((x) => re.test(x.label))) assert.equal(C.weakestClass([i]), "input", i.label);
  }
  assert.equal(classOf(p, /^sold \(Trade log/), "emitted");
  assert.equal(classOf(p, /^the signed fee, in/), null);
  assert.equal(classOf(p, /^the gap, in/), null);
  assert.deepEqual(head(p), ["emitted", "input"]);
});
