/**
 * Dolomite (Ethereum L1) — addresses, scales and the account-grain vocabulary.
 *
 * ⚠️ There is deliberately NO market roster in this file. Dolomite's admin can
 * list new markets (LogAddMarket), so the roster is read from the core's own
 * `getNumMarkets()` / `getMarketTokenAddress(id)` at head — never hardcoded.
 * Markets key on their NUMERIC id, Dolomite's own key, which also sidesteps the
 * symbol minefield this roster carries (rUSD / srUSD / wsrUSD / cUSD / stcUSD).
 *
 * The position grain is `Account.Info = (owner, uint256 accountNumber)` — the
 * contract's own key, which every view takes. Cross-margin WITHIN an account
 * number, isolated ACROSS them: two accounts of one owner are independently
 * liquidated, which is why no page aggregates an owner. Account 0 is the
 * "Dolomite Balance" (the app's default account); every other number is an
 * isolated "Borrow Position". accountNumber is a uint256 — many are
 * hash-derived — so it travels as a STRING end to end; `Number()` would
 * silently destroy it past 2^53.
 */

/** DolomiteMargin — the core. Etherscan label "Dolomite: Margin 1", verified
 *  Solidity 0.5.16, a hard fork of dYdX Solo Margin (deployed 2025-06-21). */
export const DOLOMITE_ADDRESSES = {
  MARGIN: "0x003ca23fd5f0ca87d01f6ec6cd14a8ae60c2b97d",
  /** The DefaultAccountRiskOverrideSetter the core names via
   *  getDefaultAccountRiskOverrideSetter() — the carve-out's source. Read from
   *  the core at head in the chain lane; kept here only for receipts/links. */
  DEFAULT_RISK_OVERRIDE_SETTER: "0x7bcaf5253c417c84bbd1b7dfe4ca4f0a4c4ca435",
} as const;

/** Interest.BASE — pars, indexes and Decimal.D256 risk params all scale 1e18. */
export const DOLOMITE_BASE = 1e18;

/** getAccountValues / getAdjustedAccountValues return USD at 1e36. */
export const DOLOMITE_VALUE_SCALE = 1e36;

/** getMarketInterestRate is PER SECOND (interest accrues per-timestamp, not
 *  per-block — Index.lastUpdate is a unix timestamp). Simple multiplication. */
export const SECONDS_PER_YEAR = 31_536_000;

export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** The WLFI frontend opens positions under this shared account-number constant
 *  (0x47 repeated) — many owners share it, so it names the frontend, not the
 *  position. Stored/compared in canonical decimal form. */
export const WLFI_FRONTEND_ACCOUNT_NUMBER = BigInt(
  "0x4747474747474747474747474747474747474747474747474747474747474747",
).toString();

/** Canonical decimal form of an account number (accepts decimal or 0x-hex).
 *  Returns null when the string is not a uint256. */
export function normalizeAccountNumber(raw: string): string | null {
  try {
    const v = BigInt(raw);
    if (v < BigInt(0) || v >= BigInt(2) ** BigInt(256)) return null;
    return v.toString();
  } catch {
    return null;
  }
}

export function isDolomiteBalanceNumber(accountNumber: string): boolean {
  return normalizeAccountNumber(accountNumber) === "0";
}

/** Short display form: small numbers verbatim, hash-derived ones as 0xabcd…ef12. */
export function shortAccountNumber(accountNumber: string): string {
  const norm = normalizeAccountNumber(accountNumber);
  if (norm == null) return accountNumber;
  const v = BigInt(norm);
  if (v < BigInt(1_000_000)) return norm;
  const hex = `0x${v.toString(16).padStart(64, "0")}`;
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

/**
 * Dolomite's own vocabulary for the account grain: account 0 is the owner's
 * "Dolomite Balance"; every nonzero number is an isolated "Borrow Position".
 * Small sequential numbers read as "#N"; hash-derived numbers shorten, and the
 * WLFI frontend's shared constant is named for what it is.
 */
export function accountLabel(accountNumber: string): string {
  const norm = normalizeAccountNumber(accountNumber) ?? accountNumber;
  if (norm === "0") return "Dolomite Balance";
  if (norm === WLFI_FRONTEND_ACCOUNT_NUMBER) return "Borrow Position (WLFI frontend account)";
  return `Borrow Position #${shortAccountNumber(norm)}`;
}
