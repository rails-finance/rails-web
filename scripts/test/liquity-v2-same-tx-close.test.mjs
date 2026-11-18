// A Liquity V2 Trove opened and closed in one transaction (ui-jobs 747): a
// closed row whose transactionCount is 1, nothing else. Example: wstETH Trove
// 917416…6356, tx 0x148152c6…bd48.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { closedInOneTransaction, sameTxCloseProv } from "../../lib/liquity-v2/same-tx-close.ts";

const row = (status, transactionCount) => ({ status, activity: { transactionCount } });

test("closed with one transaction is tagged", () => {
  assert.equal(closedInOneTransaction(row("closed", 1)), true);
  // as the route serves it
  assert.equal(closedInOneTransaction(row("closed", "1")), true);
});

test("more transactions, another status, or no count is not", () => {
  assert.equal(closedInOneTransaction(row("closed", 2)), false);
  assert.equal(closedInOneTransaction(row("open", 1)), false);
  assert.equal(closedInOneTransaction(row("liquidated", 1)), false);
  assert.equal(closedInOneTransaction(row("closed", 0)), false);
});

test("the receipt names the row's two fields", () => {
  const p = sameTxCloseProv("wstETH", "917416");
  assert.deepEqual(
    p.inputs.map((i) => [i.label, i.value]),
    [
      ["status", "closed"],
      ["activity.transactionCount", "1"],
    ],
  );
  assert.match(p.summary, /^Opened and closed in one transaction — /);
});
