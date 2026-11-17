// The words of a Polaris reserve loan's timeline row: the label of one
// LoanOpened, LoanAdjusted or LoanClosed (or a loan-NFT transfer) and the
// sentences its Explanation states, from the row's own legs and the
// FeesAccrued index in force at it.

import { big, exactUnits, feeAtLeg } from "./sp-loan-math";
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

export function loanEventSentences(r: PolarisLoanEventRow, previous: PolarisLoanEventRow | null): string[] {
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
  const fee = feeAtLeg(r, previous);
  if (fee != null && fee > ZERO) out.push(`Fees since the previous leg added ${amt(fee, "WETH")} to the debt.`);
  if (r.event_type !== "closed")
    out.push(
      `After it the loan held ${amt(big(r.coll_after), "fpETH")} against ${amt(big(r.debt_after), "WETH")} of debt.`,
    );
  return out;
}
