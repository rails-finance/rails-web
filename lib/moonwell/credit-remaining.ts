// Credit remaining, Moonwell's docs' measure of an account's room
// (https://docs.moonwell.fi/moonwell/moonwell-overview/borrow/credit-and-liquidations,
// "Understanding Credit Remaining"): the credit limit less the amount
// borrowed, over the credit limit, "[$600 − $100] ÷ $600 = 83.3%". The card's
// headline and the explanation's lead (rails-ops ui-jobs 632).
//
// Pure; the import is relative so scripts/test runs it.

import { CAPACITY_SHARE_CEILING } from "../shared/capacity-share";

/** (limit − debt) ÷ limit; −Infinity for debt against a zero limit (the
 *  text states the floor), null for neither. */
export function creditRemainingShare(limitUsd: number, debtUsd: number): number | null {
  if (limitUsd > 0) return (limitUsd - debtUsd) / limitUsd;
  return debtUsd > 0 ? -Infinity : null;
}

/** The share as a percentage to one place; past the capacity-share ceiling
 *  (debt over 1,000× the limit, lib/shared/capacity-share.ts) a stated floor
 *  instead of a fourteen-digit figure. */
export function creditRemainingText(share: number): string {
  if (1 - share > CAPACITY_SHARE_CEILING)
    return `below −${((CAPACITY_SHARE_CEILING - 1) * 100).toLocaleString("en-US")}%`;
  const t = (share * 100).toFixed(1);
  return `${t === "-0.0" ? "0.0" : t.replace("-", "−")}%`;
}

/** The share card's figure: the text where the account owes something
 *  against its credit limit (entered supply × collateral factor), else null. */
export function creditRemainingStat(limitUsd: number, debtUsd: number): string | null {
  if (!(debtUsd > 0)) return null;
  const share = creditRemainingShare(limitUsd, debtUsd);
  return share == null ? null : creditRemainingText(share);
}
