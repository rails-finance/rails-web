// lib/vaults/bad-debt-share.ts: a vault's part of a liquidation's bad debt
// (rails-ops ui-jobs 554, piece C). The shares are Ethereum's at block
// 23,531,277 for market 0x97ef…fae1 and vault 0xcb82…55d7.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ONE_BP_PPM, ofVaultPpm, supplySharePercent, vaultBadDebtPart } from "../../lib/vaults/bad-debt-share.ts";

const B = (v) => BigInt(v);

test("the part is floored in BigInt", () => {
  // 1,915,456 × 77,480,700,712,318 ÷ 1,012,538,085,242,888 = 146,573.6…
  assert.equal(vaultBadDebtPart(B(1915456), B("77480700712318"), B("1012538085242888")), B(146573));
  // 10 × 1 ÷ 3 = 3.33…, floored
  assert.equal(vaultBadDebtPart(B(10), B(1), B(3)), B(3));
  // a part under one raw unit floors to zero and is still a part
  assert.equal(vaultBadDebtPart(B(9380), B(199803), B("1005329475093")), B(0));
});

test("no shares, no part", () => {
  assert.equal(vaultBadDebtPart(B(1000), B(0), B(5000)), null);
  assert.equal(vaultBadDebtPart(B(1000), B(10), B(0)), null);
  assert.equal(supplySharePercent(B(0), B(5000)), null);
});

test("a vault holding the whole market takes the whole bad debt", () => {
  assert.equal(vaultBadDebtPart(B("101886476"), B("2082383423664"), B("2082383423664")), B("101886476"));
  assert.equal(supplySharePercent(B(7), B(7)), 100);
  // a read above the total is clamped to it
  assert.equal(vaultBadDebtPart(B(500), B(8), B(7)), B(500));
});

test("the supply share in percent, floored to two places", () => {
  assert.equal(supplySharePercent(B("77480700712318"), B("1012538085242888")), 7.65);
  assert.equal(supplySharePercent(B(1), B(3)), 33.33);
  assert.equal(supplySharePercent(B(199803), B("1005329475093")), 0);
  assert.equal(supplySharePercent(B(199803), B("1005329475093"), 6), 0.000019);
});

test("of the vault: the part over its total assets, in ppm, floored", () => {
  // 146,573 over 23,300,000,000 (23.3K USDC) = 6.29 ppm
  assert.equal(ofVaultPpm(B(146573), B("23300000000")), 6);
  assert.equal(ofVaultPpm(B(1), B(10000)), 100); // one basis point
  assert.equal(ofVaultPpm(B(0), B(10000)), 0);
  assert.equal(ofVaultPpm(B(5), B(5)), 1_000_000);
  assert.ok(ofVaultPpm(B(1), B(10001)) < ONE_BP_PPM);
});

test("of the vault: zero or unread assets give no figure", () => {
  assert.equal(ofVaultPpm(B(10), B(0)), null);
  assert.equal(ofVaultPpm(B(10), null), null);
});
