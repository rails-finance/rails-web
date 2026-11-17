// lib/shared/party-in-sentence.ts: whether the event page's h1 names the head's party, so the chip beside it
// draws its mark alone (anatomy P4).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { sentenceNamesParty } = await import("../../lib/shared/party-in-sentence.ts");

test("a whole word, any case", () => {
  assert.equal(
    sentenceNamesParty("Repaid 10 USDC of debt with 0.01 WETH of supplied collateral, through CoW.", "CoW"),
    true,
  );
  assert.equal(sentenceNamesParty("Swapped through cow.", "CoW"), true);
  assert.equal(sentenceNamesParty("CoW settled it.", "CoW"), true);
  assert.equal(sentenceNamesParty("Sent 5 aUSDC to Relay's router.", "Relay"), true);
});

test("never inside another word, and nothing from nothing", () => {
  assert.equal(sentenceNamesParty("Swapped through CoWswap.", "CoW"), false);
  assert.equal(sentenceNamesParty("A cowbell rang.", "CoW"), false);
  assert.equal(sentenceNamesParty("Moved the debt from 0.2 WETH to 362.599 USDC.", "CoW"), false);
  assert.equal(sentenceNamesParty(undefined, "CoW"), false);
  assert.equal(sentenceNamesParty("through CoW", undefined), false);
  // A name with a regex character is matched as written.
  assert.equal(sentenceNamesParty("via 1inch (v6).", "1inch (v6)"), true);
});
