// Credit remaining, Moonwell's docs' measure of an account's room
// (https://docs.moonwell.fi/moonwell/moonwell-overview/borrow/credit-and-liquidations,
// "Understanding Credit Remaining"): the credit limit less the amount
// borrowed, over the credit limit, "[$600 − $100] ÷ $600 = 83.3%". The card's
// headline and the explanation's lead (rails-ops ui-jobs 632).
//
// Pure.

import { CAPACITY_SHARE_CEILING } from "@/lib/shared/capacity-share";

/** (limit − debt) ÷ limit; null where the credit limit is zero. */
export function creditRemainingShare(limitUsd: number, debtUsd: number): number | null {
  return limitUsd > 0 ? (limitUsd - debtUsd) / limitUsd : null;
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
