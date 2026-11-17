// lib/cow/settlement.ts (ui-jobs 711): the card's pair in its settlement, set
// against the clearing price settle()'s calldata gave. The settlements are the
// fixtures in scripts/fixtures/cow-settlement/, read on chain on 17 Nov 2026
// and decoded by rails-server's services/cow-settle.ts:
//   0x1fc4… block 26,434,894  four USDT→USDC trades through a solver contract
//   0x9da9… block 16,807,176  two market makers' USDC→USDT orders on their own entries
//   0xdb12… block 13,796,830  two WETH→USDC trades at one price
//   0xb722… block 22,221,116  nine trades on eight pairs
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const { COW_OWN_PRICE_FEES_FROM, feeExplains, feeToken, gapBp, gapText, isCowSettlement, pairView } = await import(
  "../../lib/cow/settlement.ts"
);

const DIR = new URL("../fixtures/cow-settlement/", import.meta.url);
const FIX = Object.fromEntries(
  readdirSync(DIR).map((f) => [f.slice(0, 6), JSON.parse(readFileSync(new URL(f, DIR), "utf8"))]),
);
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const byOwner = (s, prefix) => s.trades.find((t) => t.owner.startsWith(prefix.toLowerCase()));

test("every fixture is a settlement the panel reads", () => {
  assert.equal(Object.keys(FIX).length, 5, "five fixtures");
  for (const s of Object.values(FIX)) assert.ok(isCowSettlement(s), `${s.txHash} has trades and settle`);
});

test("a wrapped 2026 settlement: one clearing price, four prices, the fee read where the gap is a fee", () => {
  const s = FIX["0x1fc4"];
  const v = pairView(s, byOwner(s, "0x854dea"));
  assert.ok(v, "the card's trade is in the settlement");
  assert.equal(v.pair.length, 4);
  assert.equal(v.otherPairs, 0);
  assert.equal(v.decoded, true);
  assert.equal(v.onePrice, false, "the log prices differ");
  const gaps = v.pair.map((t) => gapText(gapBp(t)));
  assert.deepEqual(gaps, ["+89.7 bp", "<0.1 bp", "<0.1 bp", "<0.1 bp"]);
  assert.equal(feeExplains(v.pair[0], s.blockNumber), true, "89.7 bp on own entries, in the fee era");
  assert.equal(feeExplains(v.pair[1], s.blockNumber), false, "under what the panel prints");
  assert.equal(feeToken(v.pair[0]), USDC, "a sell order's fees are in the token received");
});

test("2023: market makers on their own entries carry a gap but no fee sentence", () => {
  const s = FIX["0x9da9"];
  assert.ok(s.blockNumber < COW_OWN_PRICE_FEES_FROM, "before the fee era");
  const v = pairView(s, byOwner(s, "0xdec40d"));
  assert.equal(v.pair.length, 2);
  assert.ok(
    v.pair.every((t) => t.settled.ownEntries),
    "both on their own entries",
  );
  assert.ok(
    v.pair.every((t) => gapBp(t) > 1),
    "both priced worse than the clearing price",
  );
  assert.ok(
    v.pair.every((t) => !feeExplains(t, s.blockNumber)),
    "a limit price is no fee",
  );
  assert.equal(v.otherPairs, 2);
});

test("2022: two trades at one price", () => {
  const s = FIX["0xdb12"];
  const v = pairView(s, byOwner(s, "0x5a15d7"));
  assert.equal(v.pair.length, 2);
  assert.equal(v.onePrice, true);
  assert.ok(
    v.pair.every((t) => Math.abs(gapBp(t)) < 0.1),
    "both at the clearing price",
  );
});

test("a trade alone on its pair counts the batch's other pairs", () => {
  const s = FIX["0xb722"];
  const v = pairView(s, byOwner(s, "0xf9d7ad"));
  assert.equal(v.pair.length, 1);
  assert.equal(v.otherPairs, 7, "nine trades on eight pairs");
  assert.equal(v.onePrice, false, "one trade is no shared price");
});

test("a buy order's fees are in the token paid; a better price is never a fee", () => {
  const s = FIX["0x1fc4"];
  const t = s.trades[0];
  const buy = { ...t, settled: { ...t.settled, order: { ...t.settled.order, kind: "buy" } } };
  assert.equal(feeToken(buy), t.sellToken);
  const better = { ...t, buyAmount: (BigInt(t.buyAmount) * 2n).toString() };
  assert.ok(gapBp(better) < 0, "more bought for the same sold");
  assert.equal(feeExplains(better, s.blockNumber), false);
  assert.equal(
    pairView(s, { orderUid: "0x" + "00".repeat(56), sellAmount: "1", buyAmount: "1" }),
    null,
    "a trade not in the settlement",
  );
});

test("gap text: 0.1 bp steps, a sign, <0.1 bp below", () => {
  assert.equal(gapText(0.06), "<0.1 bp");
  assert.equal(gapText(-0.06), "<0.1 bp");
  assert.equal(gapText(0.1), "+0.1 bp");
  assert.equal(gapText(-0.44), "−0.4 bp");
  assert.equal(gapText(10509.18), "+10,509.2 bp");
});
