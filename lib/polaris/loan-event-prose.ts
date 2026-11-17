// The words of a Polaris reserve loan's timeline row: the label of one
// LoanOpened, LoanAdjusted or LoanClosed (or a loan-NFT transfer) and the
// sentences its Explanation states, from the row's figures and the
// FeesAccrued index in force at it.

import { big, exactUnits, feeAtTouch } from "./sp-loan-math";
import type { PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";

const ZERO = BigInt(0);
const amt = (v: bigint, symbol: string) => `${exactUnits(v)} ${symbol}`;

export function loanEventLabel(r: PolarisLoanEventRow): string {
  if (r.event_type === "opened") return "Opened";
  if (r.event_type === "closed") return "Closed";
  if (r.event_type === "transfer") return "Transferred";
  const c = big(r.coll_change);
  const d = big(r.debt_change);
  if (d > ZERO && c === ZERO) return "Borrowed";
  if (d < ZERO && c === ZERO) return "Repaid";
  if (c > ZERO && d === ZERO) return "Added collateral";
  if (c < ZERO && d === ZERO) return "Withdrew collateral";
  return "Adjusted";
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The row's sentences, each one fact; a sender other than the loan's holder
 *  (no loan NFT has changed hands) is named. */
export function loanEventSentences(
  r: PolarisLoanEventRow,
  previous: PolarisLoanEventRow | null,
  holder: string | null,
): string[] {
  if (r.event_type === "transfer")
    return [`The loan NFT moved from ${r.from_addr ?? "an unknown holder"} to ${r.to_addr ?? "an unknown holder"}.`];
  const out: string[] = [];
  const c = big(r.coll_change);
  const d = big(r.debt_change);
  if (r.event_type === "closed") {
    out.push(`The holder repaid ${amt(-d, "WETH")} and took back ${amt(-c, "fpETH")}.`);
  } else {
    if (c > ZERO) out.push(`The holder deposited ${amt(c, "fpETH")}.`);
    if (c < ZERO) out.push(`The holder took back ${amt(-c, "fpETH")}.`);
    if (d > ZERO) out.push(`The holder borrowed ${amt(d, "WETH")}.`);
    if (d < ZERO) out.push(`The holder repaid ${amt(-d, "WETH")}.`);
  }
  if (r.tx_from && holder && r.tx_from.toLowerCase() !== holder.toLowerCase())
    out.push(`${short(r.tx_from)} sent the transaction.`);
  const fee = feeAtTouch(r, previous);
  if (fee != null && fee > ZERO) out.push(`Fees since the previous touch added ${amt(fee, "WETH")} to the debt.`);
  return out;
}
