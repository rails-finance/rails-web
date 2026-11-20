// lib/cow/aave-totals.ts (ui-jobs 712): the CoW figures block's words, links and
// formats, and the shapes' labels against the swap cards' (lib/cow/surplus.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const T = await import("../../lib/cow/aave-totals.ts");
const { cowSurplusLabel } = await import("../../lib/cow/surplus.ts");

test("the shapes say what the swap cards say", () => {
  assert.equal(T.COW_SHAPE_LABEL.received, cowSurplusLabel("sell", "cow_permit"));
  assert.equal(T.COW_SHAPE_LABEL.returned, cowSurplusLabel("buy", "cow_adapter"));
  assert.equal(T.COW_SHAPE_LABEL.paidLess, cowSurplusLabel("buy", "cow_permit"));
});

test("each figure's listing link, and the query read back", () => {
  assert.equal(T.cowSwapsHref("aave-v3", "surplus", "usd"), "/ethereum/aave-v3/cow-swaps?figure=surplus&sort=usd");
  assert.equal(T.cowSwapsHref("aave-v4", "not-decoded"), "/ethereum/aave-v4/cow-swaps?figure=not-decoded");
  const q = (s) => T.parseCowSwapsQuery(new URLSearchParams(s));
  assert.deepEqual(q("figure=no-fee&sort=usd"), { figure: "no-fee", sort: "usd" });
  assert.deepEqual(q("figure=all&sort=size"), { figure: "surplus", sort: "recent" }, "unknown values fall back");
});

test("position and event links per family", () => {
  const s = { wallet: "0xab", market: "main", swapKey: "transfer_out:0x1:0x2:3" };
  assert.equal(T.cowSwapPositionHref("aave-v3", s), "/ethereum/aave-v3/0xab");
  assert.equal(T.cowSwapPositionHref("aave-v4", s), "/ethereum/aave-v4/spoke/main/0xab");
  assert.equal(
    T.cowSwapEventHref("aave-v4", s),
    "/ethereum/aave-v4/spoke/main/0xab/event/transfer_out%3A0x1%3A0x2%3A3",
  );
});

test("formats: dollars, bp, token amounts", () => {
  assert.equal(T.usdText(26871521.357), "$26,871,521");
  assert.equal(T.usdText(58.123), "$58.12");
  assert.equal(T.bpText(30.505), "30.51 bp");
  assert.equal(T.tokenAmountText("241762538", 8), "2.42");
  assert.equal(T.tokenAmountText("3652647014197408", 18), "0.003653");
  assert.equal(T.tokenAmountText("5", null), "5 (raw)");
  assert.equal(T.tokenAmountText("-100000000000000000", 18), "−0.1", "a negative gap takes U+2212");
  assert.equal(T.swapKindText("repay_with_collateral"), "Repay with collateral");
});
