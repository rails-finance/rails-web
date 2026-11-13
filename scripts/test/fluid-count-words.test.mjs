// lib/fluid/count-words.ts (rails-ops ui-jobs 633): the vaults head leads with
// the open count from Rails's index, with the resolver's count of positions
// minted under it; a vault's figure is that minted count, labelled "Opened".
// Vault 1 at block 26,402,592: 129 minted, 14 holding collateral or debt;
// the roster: 19,790 minted, 8,556 open.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { COUNT_WORDS, openedInAll, utcStamp } = await import("../../lib/fluid/count-words.ts");

const words = (s) => s.trim().split(/\s+/).length;

test("the vaults head: an open count over the count opened", () => {
  assert.equal(COUNT_WORDS.openLabel, "Open positions");
  assert.equal(openedInAll(19790), "19,790 opened in all");
  // A label is one to three words; the line under the figure is lower case.
  assert.ok(words(COUNT_WORDS.openLabel) <= 3);
  assert.equal(openedInAll(19790), openedInAll(19790).toLowerCase());
});

test("a vault's figure is the count opened, open or closed", () => {
  assert.equal(COUNT_WORDS.openedLabel, "Opened");
  assert.ok(words(COUNT_WORDS.openedLabel) <= 3);
  assert.equal(COUNT_WORDS.openedTip, "Every position the vault has minted, open or closed");
});

test("no figure from the resolver is called open", () => {
  for (const s of [COUNT_WORDS.openedLabel, COUNT_WORDS.openedTip, openedInAll(129)])
    assert.doesNotMatch(s, /\bopen positions?\b|\bpositions open\b/i);
});

test("the index's read time prints the same everywhere", () => {
  assert.equal(utcStamp("2026-11-13T01:24:59.000Z"), "13 Nov 2026 01:24 UTC");
  assert.equal(utcStamp("not a time"), "not a time");
});
