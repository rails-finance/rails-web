// Receipts for the Liquity V2 redemption-queue figures — debt in front,
// troves ahead, the branch's entire debt, and the queue-share fraction. One
// vocabulary for every surface that states a queue figure: the detail band's
// shorthand line, the compact RedemptionRunway riding the heading-button row,
// and the Explanation pane's queue bullets — so the same figure traces
// identically wherever it renders.
//
// Derivation (rails-server liquity-debt-in-front-fetcher): the branch's troves
// are read in ascending rate order from MultiTroveGetter
// .getDebtPerInterestRateAscending; every entry at a rate ≤ this trove's is
// summed and counted, then this trove's entire debt and its one place are
// taken back out. The branch total is TroveManager.getEntireBranchDebt. All
// reads are at the latest block.

import type { Provenance } from "@/components/shared/provenance";

const DIF_VIA = "MultiTroveGetter.getDebtPerInterestRateAscending() at the latest block";

/** Receipt for the debt-in-front figure — the branch debt redeemed before
 *  this trove is touched. */
export function troveDebtInFrontProv(collateralType: string): Provenance {
  return {
    kind: "chain-derived",
    summary: `Debt in front — the combined BOLD debt, interest included, of the other ${collateralType} troves that pay this trove's interest rate or less. A redemption takes from the lowest-rate troves first, so it works through this debt on its way to this trove.`,
    formula: "Σ entireDebt of same-branch troves at rate ≤ this trove's",
    contract: { name: "MultiTroveGetter" },
    via: DIF_VIA,
  };
}

/** Receipt for the troves-ahead count — the queue behind the debt-in-front
 *  figure. */
export function troveTrovesAheadProv(collateralType: string): Provenance {
  return {
    kind: "chain-derived",
    summary: `Troves ahead — the number of other ${collateralType} troves that pay this trove's interest rate or less. A redemption reaches them first.`,
    formula: "count of same-branch troves at rate ≤ this trove's",
    contract: { name: "MultiTroveGetter" },
    via: DIF_VIA,
  };
}

/** Receipt for the branch's entire BOLD debt — the whole redemption queue. */
export function troveBranchDebtProv(collateralType: string): Provenance {
  return {
    kind: "chain",
    summary: `The ${collateralType} branch's entire BOLD debt — everything the branch's troves owe now, interest included, as the ${collateralType} TroveManager contract reports it. Every trove in the branch is in the redemption queue, so this is the queue's full size.`,
    contract: { name: `${collateralType} TroveManager` },
    via: "TroveManager.getEntireBranchDebt() at the latest block",
  };
}

/** Receipt for the queue-share fraction (debt in front ÷ entire branch debt) —
 *  the compact RedemptionRunway and the Explanation pane's queue bullet trace
 *  the same figure identically. */
export function troveQueueShareProv(collateralType: string): Provenance {
  return {
    kind: "chain-derived",
    summary:
      "Share of the branch's debt redeemed before this trove — the debt in front divided by the branch's entire debt. The larger the share, the more BOLD must be redeemed before a redemption reaches this trove.",
    formula: "debt in front ÷ branch debt",
    contract: { name: "MultiTroveGetter" },
    via: `${DIF_VIA} and TroveManager.getEntireBranchDebt()`,
    inputs: [
      { label: "debt in front", kind: "chain-derived", note: "Σ same-branch debt at rate ≤ this trove's" },
      { label: "branch debt", kind: "chain", note: `getEntireBranchDebt · ${collateralType} branch` },
    ],
  };
}
