// lib/cow/surplus.ts (ui-jobs 712): the surplus and fee figures the Aave swap
// cards print. Figures from lib/cow/dev-surplus-fixture.json, which the
// server's decoder and services/cow-surplus.ts computed from ten swaps read on
// chain on 17 Nov 2026; the server's tests check them against CoW's order API.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { shiftRaw, decimalsOf, feeBpText, cowSurplusLabel, COW_FEE_LABEL } = await import("../../lib/cow/surplus.ts");
const FIX = JSON.parse(readFileSync(new URL("../../lib/cow/dev-surplus-fixture.json", import.meta.url), "utf8"));

test("shiftRaw places the decimal point exactly", () => {
  assert.equal(shiftRaw("67490510", 6), "67.49051");
  assert.equal(shiftRaw("91375479376780733", 18), "0.091375479376780733");
  assert.equal(shiftRaw("1000000", 6), "1");
  assert.equal(shiftRaw("5", 0), "5");
  assert.equal(shiftRaw("-2500", 3), "-2.5");
});

test("decimalsOf reads a V4 Trade side's decimals from its raw and decimal amounts", () => {
  assert.equal(decimalsOf("8224945", "8.224945"), 6);
  assert.equal(decimalsOf("1000000", "1"), 6);
  assert.equal(decimalsOf("4356050669675801", "0.004356050669675801"), 18);
  assert.equal(decimalsOf("0", "0"), null);
  assert.equal(decimalsOf("123", null), null);
});

test("the figures have their ruled words, by order kind and route", () => {
  assert.equal(cowSurplusLabel("sell", "cow_permit"), "Received beyond the limit signed");
  assert.equal(cowSurplusLabel("sell", "cow_adapter"), "Received beyond the limit signed");
  assert.equal(cowSurplusLabel("buy", "cow_adapter"), "Returned to the wallet from the unused limit");
  assert.equal(cowSurplusLabel("buy", "cow_permit"), "Paid less than the limit signed");
  assert.equal(COW_FEE_LABEL, "Fees in the trade's price");
  assert.equal(feeBpText(27.509), "27.51 bp");
  assert.equal(feeBpText(103.194), "103.19 bp");
});

test("the fixture: buy orders on the adapters' debt, repay and leverage swaps, sell orders elsewhere", () => {
  const byKind = {};
  for (const v of Object.values(FIX)) (byKind[`${v.protocol} ${v.kind}`] ??= []).push(v.cow.kind);
  assert.deepEqual(byKind["aave-v3 repay_with_collateral"], ["buy"]);
  assert.deepEqual(byKind["aave-v3 debt_swap"], ["buy"]);
  assert.deepEqual(byKind["aave-v4 leverage"], ["buy"]);
  assert.deepEqual(byKind["aave-v4 collateral_swap"], ["sell"]);
  assert.equal(
    byKind["aave-v3 collateral_swap"].every((k) => k === "sell"),
    true,
  );
  // V4 swaps carry the flash loan read from the receipt; V3 swaps do not read it.
  const v4 = Object.values(FIX).filter((v) => v.protocol === "aave-v4");
  assert.ok(v4.every((v) => v.cow.flashRead && v.cow.flashLoan));
  assert.deepEqual(
    v4.filter((v) => v.cow.flashLoan.premium !== "0").map((v) => v.tx.slice(0, 10)),
    ["0x908dc11c"],
  );
  assert.ok(
    Object.values(FIX)
      .filter((v) => v.protocol === "aave-v3")
      .every((v) => !v.cow.flashRead && v.cow.flashLoan === null),
  );
  for (const v of Object.values(FIX)) {
    assert.ok(BigInt(v.cow.surplus) > 0n, `${v.tx} surplus`);
    assert.ok(v.cow.feeBp > 0, `${v.tx} fee`);
  }
});
