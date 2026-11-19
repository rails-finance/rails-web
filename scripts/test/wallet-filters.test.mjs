// lib/wallet/wallet-filters.ts: the wallet page's Kind pill and its links
// (rails-ops ui-jobs 738). A lending account is a loan where it owes or ever
// owed, read from the summary row and then its stored listing row; the link
// keeps a kind only where the protocol holds more than one. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { kindOfRow, walletHref, parseKinds } = await import("../../lib/wallet/wallet-filters.ts");

const row = (family, extra = {}) => ({
  family,
  debt: null,
  peakDebt: null,
  debtUsd: null,
  card: {},
  ...extra,
});

test("one-kind protocols take their kind", () => {
  assert.equal(kindOfRow(row("liquity-v2")), "troves");
  assert.equal(kindOfRow(row("makerdao")), "vaults");
  assert.equal(kindOfRow(row("fluid")), "vaults");
});

test("a lending account owing now is a loan", () => {
  assert.equal(kindOfRow(row("aave-v3", { debtUsd: 321184 })), "loans");
});

test("a closed lending account that borrowed at its peak is a loan", () => {
  const aave = { peakReserves: [{ peakDebtRaw: "182010586162", peakSupplyRaw: "0" }] };
  assert.equal(kindOfRow(row("aave-v3", { card: aave })), "loans");
  const morpho = { peak_borr_raw: "327946180402", total_borrow_assets: "1", bad_debt_raw: null };
  assert.equal(kindOfRow(row("morpho", { card: morpho })), "loans");
});

test("a lending account that never borrowed is a deposit", () => {
  assert.equal(kindOfRow(row("aave-v3", { card: { peakReserves: [] } })), "deposits");
  // A market's own borrow totals are not the account's.
  const morpho = { peak_borr_raw: "0", total_borrow_assets: "67131777130033", total_borrow_shares: "5" };
  assert.equal(kindOfRow(row("morpho", { card: morpho })), "deposits");
});

test("the link keeps a kind only where the protocol holds more than one", () => {
  const a = "0xabc";
  assert.equal(walletHref(a, "liquity-v2", ["loans"]), "/wallet/0xabc?protocol=liquity-v2");
  assert.equal(walletHref(a, "aave-v3", ["loans", "troves"]), "/wallet/0xabc?protocol=aave-v3&kind=loans");
  assert.equal(walletHref(a, undefined, ["loans", "vaults"]), "/wallet/0xabc?kind=loans,vaults");
  assert.equal(walletHref(a, "nope"), "/wallet/0xabc");
  assert.deepEqual(parseKinds("loans,bogus,loans"), ["loans"]);
});
