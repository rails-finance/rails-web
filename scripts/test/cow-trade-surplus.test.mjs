// lib/cow/settlement.ts `tradeSurplus` (ui-jobs 712, the CoW trade card's
// lines) against rails-server's api/src/services/cow-surplus.ts, the copy it
// was ported from. The expected figures were computed by the server's decoder
// and `tradeSurplus` (rails-server origin/main e0dc6489) on its fixtures, read
// on chain on 17 Nov 2026:
//   scripts/fixtures/cow-surplus-trades.json     the server's ten Aave swaps
//     (cow-surplus.fixtures.json), each as the settlement route serves its trade
//   scripts/fixtures/cow-settlement-surplus.json every trade of the five
//     settlements in scripts/fixtures/cow-settlement/
// The server's tests hold the ten to CoW's order API (the surplus to the wei on
// fill-or-kill orders, the fee gap to executedFee).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const ST = await import("../../lib/cow/settlement.ts");
const SU = await import("../../lib/cow/surplus.ts");
const SP = await import("../../lib/cow/surplus-provenance.ts");
const PP = await import("../../lib/cow/settlement-provenance.ts");

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const SWAPS = json("../fixtures/cow-surplus-trades.json");
const EXPECTED = json("../fixtures/cow-settlement-surplus.json");
const DIR = new URL("../fixtures/cow-settlement/", import.meta.url);
const SETTLEMENTS = readdirSync(DIR).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));

const figures = (s) =>
  s && {
    kind: s.kind,
    surplus: s.surplus.toString(),
    surplusToken: s.surplusToken,
    limitAmount: s.limitAmount.toString(),
    feeGap: s.feeGap.toString(),
    signedFee: s.signedFee.toString(),
    feeBp: s.feeBp,
  };

/** A settlement around one fixture swap, as the route answers it. */
const settlementOf = (hash, f, over = {}) => ({
  blockNumber: f.block,
  txHash: hash,
  trades: [f.trade],
  settle: { status: "decoded", call: f.call, offset: f.offset },
  tokens: {},
  ...over,
});
const label = (address, symbol, decimals) => ({ address, symbol, decimals });

test("the ten Aave swaps: the server's surplus and fees, to the wei", () => {
  assert.equal(Object.keys(SWAPS).length, 10);
  for (const [h, f] of Object.entries(SWAPS)) {
    assert.deepEqual(figures(ST.tradeSurplus(f.trade)), f.expected, h.slice(0, 10));
  }
});

test("the five settlements: the server's figures on every trade", () => {
  let n = 0;
  for (const s of SETTLEMENTS) {
    for (const t of s.trades) {
      assert.deepEqual(
        figures(ST.tradeSurplus(t)),
        EXPECTED[s.txHash][t.logIndex],
        `${s.txHash.slice(0, 10)}:${t.logIndex}`,
      );
      n++;
    }
  }
  assert.equal(n, 27);
});

test("buy orders measure in the sold token, sell orders in the bought token", () => {
  for (const [h, f] of Object.entries(SWAPS)) {
    const s = ST.tradeSurplus(f.trade);
    const want = s.kind === "sell" ? f.trade.buyToken : f.trade.sellToken;
    assert.equal(s.surplusToken, want.toLowerCase(), h.slice(0, 10));
  }
});

test("no figures without a decoded order or with a zero price", () => {
  const f = Object.values(SWAPS)[0];
  assert.equal(ST.tradeSurplus({ ...f.trade, settled: null }), null);
  const zero = { ...f.trade.settled, uniform: { ...f.trade.settled.uniform, sellPrice: "0" } };
  assert.equal(ST.tradeSurplus({ ...f.trade, settled: zero }), null);
});

test("before block 19,815,319 the card's fee is the signed fee alone, on the same base", () => {
  for (const s of SETTLEMENTS) {
    for (const t of s.trades) {
      const f = ST.tradeSurplus(t);
      const c = ST.cardFee(f, s.blockNumber);
      if (s.blockNumber >= ST.COW_OWN_PRICE_FEES_FROM) {
        assert.deepEqual(c, { feeGap: f.feeGap, feeBp: f.feeBp, signedOnly: false });
      } else {
        assert.equal(c.signedOnly, true);
        assert.equal(c.feeGap, f.signedFee);
        assert.equal(c.feeBp, Number((f.signedFee * 10_000_000n) / f.atUniform) / 1000);
      }
    }
  }
  // 2023, a market maker's order on its own entries: the gap to the clearing price is its limit price, no fee.
  const mm = SETTLEMENTS.find((s) => s.blockNumber === 16807176);
  const t = mm.trades.find((x) => x.logIndex === 31);
  assert.ok(ST.tradeSurplus(t).feeBp > 40, "41.5 bp from the clearing price");
  assert.equal(ST.cardFee(ST.tradeSurplus(t), mm.blockNumber).feeBp, 0, "and no signed fee");
});

test("the card's view: plain buy-order words on an adapter's order, the figures from tradeSurplus", () => {
  const h = Object.keys(SWAPS).find((x) => x.startsWith("0xa3eff66c"));
  const f = SWAPS[h];
  const sell = label(f.trade.sellToken, "USDC", 6);
  const buy = label(f.trade.buyToken, "WETH", 18);
  const v = ST.cowTradeView(settlementOf(h, f), f.trade, sell, buy);
  assert.equal(v.kind, "buy");
  assert.equal(v.route, "cow");
  assert.equal(SU.cowSurplusLabel(v.kind, v.route), "Paid less than the limit signed");
  assert.equal(v.surplus, f.expected.surplus);
  assert.equal(v.feeBp, f.expected.feeBp);
  assert.deepEqual(v.token, sell, "a buy order's surplus is in the sold token");
  assert.equal(v.signedFeeOnly, undefined, "2025: the fee era");
  const p = SP.cowSurplusProv(
    v,
    { sell: f.trade.sellAmount, buy: f.trade.buyAmount, fee: f.trade.feeAmount },
    {
      block: f.block,
      txHash: h,
    },
  );
  assert.doesNotMatch(p.summary, /refund|adapter sends/, "no refund words on the CoW card");
  assert.match(p.summary, /^Paid less than the limit signed — /);
});

test("no view where settle() is unread, refused or does not match", () => {
  const [h, f] = Object.entries(SWAPS)[0];
  const sell = label(f.trade.sellToken, null, null);
  const buy = label(f.trade.buyToken, null, null);
  for (const status of ["unread", "no-selector", "no-match"]) {
    assert.equal(ST.cowTradeView(settlementOf(h, f, { settle: { status } }), f.trade, sell, buy), null, status);
  }
});

test("partial fills: the receipt says the limit is pro rata on the part filled", () => {
  const h = Object.keys(SWAPS).find((x) => x.startsWith("0x3317c69d"));
  const f = SWAPS[h];
  const v = ST.cowTradeView(
    settlementOf(h, f),
    f.trade,
    label(f.trade.sellToken, "A", 18),
    label(f.trade.buyToken, "B", 18),
  );
  assert.equal(v.partiallyFillable, true);
  const p = SP.cowSurplusProv(
    v,
    { sell: f.trade.sellAmount, buy: f.trade.buyAmount, fee: f.trade.feeAmount },
    {
      block: f.block,
      txHash: h,
    },
  );
  assert.match(p.summary, /pro rata to the part filled in this transaction/);
  assert.ok(p.inputs.some((i) => /^executedAmount/.test(i.label) && i.value === f.trade.settled.order.executedAmount));
});

test("before block 19,815,319: the fee receipt names the signed fee and why no other fee is read", () => {
  const s = SETTLEMENTS.find((x) => x.blockNumber === 13796830);
  const t = s.trades[0];
  const sell = label(t.sellToken, "A", 18);
  const buy = label(t.buyToken, "B", 18);
  const v = ST.cowTradeView(s, t, sell, buy);
  assert.equal(v.signedFeeOnly, "no-entries");
  assert.equal(v.feeGap, v.signedFee);
  const raw = { sell: t.sellAmount, buy: t.buyAmount, fee: t.feeAmount };
  const p = SP.cowFeeProv(v, raw, { block: s.blockNumber, txHash: s.txHash });
  assert.match(p.summary, /the fee this order signed/);
  assert.match(p.summary, /carried no per-trade entries/);
  const mm = SETTLEMENTS.find((x) => x.blockNumber === 16807176);
  const own = ST.cowTradeView(
    mm,
    mm.trades.find((x) => x.logIndex === 31),
    sell,
    buy,
  );
  assert.equal(own.signedFeeOnly, "own-entries");
  assert.match(SP.cowFeeProv(own, raw, { block: mm.blockNumber, txHash: mm.txHash }).summary, /market makers' orders/);
});

test("an inline settle(): its own words in every receipt that names the call", () => {
  // The 0x5ef68f68 adapter call (0xb6ed…), as rails-server origin/main answers it; the deployed route does not yet.
  const h = Object.keys(SWAPS).find((x) => x.startsWith("0xb6edc7a8"));
  const f = SWAPS[h];
  assert.equal(f.call, "inline");
  const s = settlementOf(h, f, {
    trades: [f.trade, { ...f.trade, logIndex: f.trade.logIndex + 1, owner: "0x" + "11".repeat(20) }],
  });
  const sell = label(f.trade.sellToken, "A", 18);
  const buy = label(f.trade.buyToken, "B", 6);
  const v = ST.cowTradeView(s, f.trade, sell, buy);
  const raw = { sell: f.trade.sellAmount, buy: f.trade.buyAmount, fee: f.trade.feeAmount };
  const coords = { block: f.block, txHash: h };
  const inline = /read inline from the adapter's call/;
  for (const p of [SP.cowSurplusProv(v, raw, coords), SP.cowFeeProv(v, raw, coords)]) {
    assert.equal(p.via.split(" · ")[0], "settle() arguments, inline in the adapter's call");
    assert.ok(
      p.inputs.filter((i) => i.pclass === "input").every((i) => inline.test(i.note)),
      p.summary.slice(0, 40),
    );
  }
  const pricing = PP.pairPricing(f.trade, sell, buy);
  const cp = PP.clearingPriceProv(s, f.trade, pricing, sell);
  assert.equal(cp.via, "settle() arguments, inline in the adapter's call · tokens and clearingPrices");
  assert.ok(cp.inputs.every((i) => inline.test(i.note)));
  assert.doesNotMatch(cp.inputs[0].note, /solver contract's input/);
  // A wrapped call keeps its byte offset; a direct one names neither.
  const wrapped = PP.clearingPriceProv(
    { ...s, settle: { status: "decoded", call: "wrapped", offset: 260 } },
    f.trade,
    pricing,
    sell,
  );
  assert.equal(wrapped.via, "settle() input, from byte 260 · tokens and clearingPrices");
  const direct = PP.clearingPriceProv(
    { ...s, settle: { status: "decoded", call: "direct", offset: 0 } },
    f.trade,
    pricing,
    sell,
  );
  assert.equal(direct.via, "settle() input · tokens and clearingPrices");
});
