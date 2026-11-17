// A Liquity fork Trove's former holders (ui-jobs 715): the in-memory listing
// search finds a wallet that held the Trove and moved it on, and its card
// reads "moved to" the wallet that took it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { formerHoldFor, matchesFormerHolder } from "../../lib/liquity-fork/former-holders.ts";

const A = "0x8d78a47274818e1c81e47cfece5bef5fecc4b5ec";
const B = "0x25b85831da750c912ab7f0cf53b9d82f7894ed07";
const row = {
  owner: null,
  lastOwner: B,
  formerHolders: [{ holder: A, movedTo: B, movedAt: 1773173231, movedBlock: 24000000, movedTx: "0xabc" }],
};

test("the search matches a former holder, in part as the owner search does", () => {
  assert.equal(matchesFormerHolder(row, A), true);
  assert.equal(matchesFormerHolder(row, A.slice(0, 10)), true);
  assert.equal(matchesFormerHolder({ owner: B, lastOwner: B }, A), false);
});

test("a search by the former holder reads moved to the wallet that took it", () => {
  assert.deepEqual(formerHoldFor(row, A), { movedTo: B, movedAt: 1773173231 });
  assert.deepEqual(formerHoldFor(row, ` ${A.toUpperCase().replace("0X", "0x")} `), { movedTo: B, movedAt: 1773173231 });
});

test("no moved to for a partial address, another wallet, or the holder", () => {
  assert.equal(formerHoldFor(row, A.slice(0, 10)), null);
  assert.equal(formerHoldFor(row, B), null);
  assert.equal(formerHoldFor({ ...row, owner: A }, A), null);
  assert.equal(formerHoldFor(row, ""), null);
});
