// A Trove's "last holder" (ui-jobs 702): only a closed Trove whose history
// holds a wallet-to-wallet TroveNFT transfer.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { liquityForkHolder, troveChangedHands, troveHolder } from "../../lib/liquity/trove-holder.ts";

const A = "0x5ed4f245fbacd9dccb233241cd97fcca54bfd88b";
const B = "0x69be0000000000000000000000000000000020b3";
const ZERO = "0x0000000000000000000000000000000000000000";

const row = (transfer) => ({ context: { protocol: "liquity-v2-troves", data: { transfer } } });
const mint = row({ transferType: "mint", fromAddress: ZERO, toAddress: A });
const burn = row({ transferType: "burn", fromAddress: A, toAddress: ZERO });
const move = row({ transferType: "transfer", fromAddress: A, toAddress: B });

test("mint and burn alone are not a change of hands", () => {
  assert.equal(troveChangedHands([mint, row(undefined), burn]), false);
});

test("one wallet-to-wallet transfer is a change of hands", () => {
  assert.equal(troveChangedHands([mint, move, burn]), true);
});

test("a transfer to the same wallet is not", () => {
  assert.equal(troveChangedHands([row({ transferType: "transfer", fromAddress: A, toAddress: A })]), false);
});

test("addresses compare without case", () => {
  const upper = row({ transferType: "transfer", fromAddress: A.toUpperCase().replace("0X", "0x"), toAddress: A });
  assert.equal(troveChangedHands([upper]), false);
  const mixed = row({ transferType: "transfer", fromAddress: A.toUpperCase().replace("0X", "0x"), toAddress: B });
  assert.equal(troveChangedHands([mixed]), true);
});

test("another protocol's transfer rows are not read", () => {
  const other = {
    context: { protocol: "polaris", data: { transfer: { transferType: "transfer", fromAddress: A, toAddress: B } } },
  };
  assert.equal(troveChangedHands([other]), false);
});

test("an open Trove's holder is never last", () => {
  assert.deepEqual(troveHolder({ owner: B, lastOwner: B }, true), { address: B, last: false });
});

test("a closed Trove is last only when it changed hands", () => {
  assert.deepEqual(troveHolder({ owner: null, lastOwner: B }, true), { address: B, last: true });
  assert.deepEqual(troveHolder({ owner: null, lastOwner: B }, false), { address: B, last: false });
  assert.deepEqual(troveHolder({ owner: ZERO, lastOwner: B }), { address: B, last: false });
});

test("the fork holder is last only on a closed Trove whose read says it changed hands", () => {
  assert.deepEqual(liquityForkHolder({ owner: null, lastOwner: B }), { address: B, last: false });
  assert.deepEqual(liquityForkHolder({ owner: ZERO, lastOwner: B, changedHands: false }), { address: B, last: false });
  assert.deepEqual(liquityForkHolder({ owner: null, lastOwner: B, changedHands: true }), { address: B, last: true });
  assert.deepEqual(liquityForkHolder({ owner: A, lastOwner: A, changedHands: true }), { address: A, last: false });
});
