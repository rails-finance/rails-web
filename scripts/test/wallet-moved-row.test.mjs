// A position the wallet held and passed on (ui-jobs 705): a "moved" row that
// never counts open, and a History row of the moved day and the receiver only.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { formerHoldOf, movedHistory, walletRowStatus } from "../../lib/wallet/moved-row.ts";

const B = "0x69bea37300103797c34b2f10aa6dc51eb21120b3";
const formerHold = { holder: "0x5ed4f245fbacd9dccb233241cd97fcca54bfd88b", movedTo: B, movedAt: 1790098967 };

test("a row whose card carries formerHold counts as moved, whatever its status", () => {
  assert.equal(walletRowStatus({ status: "open", card: { formerHold } }), "moved");
  assert.equal(walletRowStatus({ status: "closed", card: { formerHold } }), "moved");
});

test("a held row keeps its status", () => {
  assert.equal(walletRowStatus({ status: "open", card: { id: "1" } }), "open");
  assert.equal(walletRowStatus({ status: "liquidated", card: null }), "liquidated");
});

test("a malformed formerHold is no formerHold", () => {
  assert.equal(formerHoldOf({ formerHold: { movedTo: B } }), null);
  assert.equal(formerHoldOf(undefined), null);
});

test("the History row states the moved day and the receiver, nothing of the Trove's later life", () => {
  assert.deepEqual(movedHistory(formerHold), { closedAt: 1790098967, movedTo: B });
});
