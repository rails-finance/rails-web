// lib/wallet/wallet-filters.ts: the wallet page's Kind pill and its links
// (rails-ops ui-jobs 738). A lending account is a loan where it owes or ever
// owed, read from the summary row and then its stored listing row; the link
// keeps a kind only where the protocol holds more than one. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { kindOfRow, walletHref, parseKinds, walletSearchHref } = await import("../../lib/wallet/wallet-filters.ts");

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

test("a Dolomite account borrowing in several markets is a loan", () => {
  // mig 522 writes no debt unit where several markets hold the borrow side.
  const open = { borrowMarketCount: 2, balances: [{ parRaw: "-5" }, { parRaw: "-7" }], peakMarkets: [] };
  assert.equal(kindOfRow(row("dolomite", { card: open })), "loans");
  const closed = { borrowMarketCount: 0, peakMarkets: [{ peakSupplyParRaw: "9", peakBorrowParRaw: "4" }] };
  assert.equal(kindOfRow(row("dolomite", { card: closed })), "loans");
  const lender = { borrowMarketCount: 0, peakMarkets: [{ peakSupplyParRaw: "9", peakBorrowParRaw: "0" }] };
  assert.equal(kindOfRow(row("dolomite", { card: lender })), "deposits");
});

test("an Alchemix position owing is a loan, one with no debt a deposit, a V2 credit no debt", () => {
  const v3 = (raw) => ({ figures: { debt: { raw, formatted: Number(raw), asOfBlock: 1 }, derivedLowerBound: null } });
  assert.equal(kindOfRow(row("alchemix", { card: v3("813152429816868344200") })), "loans");
  assert.equal(kindOfRow(row("alchemix", { card: v3("0") })), "deposits");
  const credit = { version: "v2", frozenDebt: { raw: "-12", formatted: -12, sign: "credit", asOfBlock: 1 } };
  assert.equal(kindOfRow(row("alchemix", { card: credit })), "deposits");
});

test("Maple is a deposit and f(x) a loan", () => {
  assert.equal(kindOfRow(row("maple")), "deposits");
  assert.equal(kindOfRow(row("fx")), "loans");
});

test("the link keeps a kind only where the protocol holds more than one", () => {
  const a = "0xabc";
  assert.equal(walletHref(a, "liquity-v2", ["loans"]), "/wallet/0xabc?protocol=liquity-v2");
  assert.equal(walletHref(a, "aave-v3", ["loans", "troves"]), "/wallet/0xabc?protocol=aave-v3&kind=loans");
  assert.equal(walletHref(a, undefined, ["loans", "vaults"]), "/wallet/0xabc?kind=loans,vaults");
  assert.equal(walletHref(a, "nope"), "/wallet/0xabc");
  assert.deepEqual(parseKinds("loans,bogus,loans"), ["loans"]);
});

test("a listing search by a wallet opens the wallet page on the Liquity V2 family alone", () => {
  const A = "0x0C8C5F4E163B5637F26B56D31AC672F7751E4A56";
  assert.equal(walletSearchHref("liquity-v2", A), `/wallet/${A.toLowerCase()}?protocol=liquity-v2`);
  assert.equal(walletSearchHref("ebisu", " vitalik.eth "), "/wallet/vitalik.eth?protocol=ebisu");
  // A Trove id, partial text, another family or no family stays on the listing.
  assert.equal(walletSearchHref("liquity-v2", "1234567"), null);
  assert.equal(walletSearchHref("liquity-v2", "0x0c8c5f"), null);
  assert.equal(walletSearchHref("aave-v3", A), null);
  assert.equal(walletSearchHref(undefined, A), null);
});

test("a PWN row's role and a Polaris row's kind name its kind", () => {
  assert.equal(kindOfRow(row("pwn", { card: { role: "borrower", borrower: "0xab" } })), "loans");
  // The lender's card names the borrower's address: no debt for all that.
  assert.equal(kindOfRow(row("pwn", { card: { role: "lender", borrower: "0xab" } })), "deposits");
  assert.equal(kindOfRow(row("polaris", { card: { kind: "sp", stable_gain_raw: "5" } })), "deposits");
  assert.equal(kindOfRow(row("polaris", { card: { kind: "cdp", debt_raw: "0" } })), "loans");
  assert.equal(kindOfRow(row("polaris", { card: { kind: "loan" } })), "loans");
  assert.equal(kindOfRow(row("frankencoin")), "loans");
});

test("the counts take every chain's rows but a testnet's", async () => {
  const { countedRow } = await import("../../lib/wallet/summary-row.ts");
  assert.equal(countedRow({ chain: "sepolia" }), false);
  for (const chain of ["ethereum", "base", "arbitrum", "arc"]) assert.equal(countedRow({ chain }), true, chain);
});

test("an Aave vault holding's stored page opens under Aave V3's Vaults section (ui-jobs 789)", async () => {
  const { servedSummaryRow } = await import("../../lib/wallet/summary-row.ts");
  const V = "0xe1753f2e00940cc31213dd92013cf019dfe4ca1d";
  const H = "0x1676d23711186076fa74aa53511dda750a1f0d9a";
  assert.equal(
    servedSummaryRow({ href: `/ethereum/aave/vaults/${V}/${H}` }).href,
    `/ethereum/aave-v3/vaults/${V}/${H}`,
  );
  const morpho = { href: `/ethereum/morpho/vaults/${V}/${H}` };
  assert.equal(servedSummaryRow(morpho), morpho);
  const none = { href: null };
  assert.equal(servedSummaryRow(none), none);
});
