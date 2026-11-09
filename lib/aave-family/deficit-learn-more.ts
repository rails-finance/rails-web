// The Deficit section's "?" (anatomy M3.9, Layer 2): how an Aave V3 deficit
// arises, who can cover it, who pays and why it earns no interest, each
// detail with the Aave source it rests on (lib/aave-family/deficit-sources.ts).
// True of any reserve; a figure about this one belongs in the section.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { deficitLinks } from "@/lib/aave-family/deficit-sources";

export function deficitLearnMore(): LearnMoreContent {
  return {
    title: "How an Aave deficit works",
    intro:
      "A deficit is debt the Pool has written off. Suppliers are still owed it, and no borrower owes it any more, until Aave's Umbrella covers it.",
    detailsHeading: "Key points",
    details: [
      {
        bold: "Where it comes from",
        text: "A liquidation that leaves the borrower no collateral burns the borrower's whole debt on each reserve. The part the liquidator did not repay is added to the reserve's deficit, and the Pool emits DeficitCreated, one per debt reserve.",
        sources: deficitLinks("O2", "O3", "O1"),
      },
      {
        bold: "Who can cover it",
        text: "Only Umbrella can cover a deficit, through the Pool's eliminateReserveDeficit, which carries onlyUmbrella. Aave's Pool docs: \"Only callable by address with `onlyUmbrella` modifier.\" Each cover burns the caller's aTokens (the underlying, for GHO), lowers the deficit by that amount and emits DeficitCovered.",
        sources: deficitLinks("O6", "O6m", "O5", "O4", "D1"),
      },
      {
        bold: "Who pays",
        text: 'Umbrella takes the funds from its caller, an address holding the coverage manager role, then calls the Pool. Up to the offset the DAO sets, the DAO pays; Aave\'s docs give the example that "the Aave DAO covers the first 100,000 USDT of bad debt before any staker assets are affected". Beyond it, the reserve\'s Umbrella stake token is slashed, and "slashed assets are sent to the Aave Collector for deficit coverage".',
        sources: deficitLinks("U1", "U2", "U2e", "U3", "D3"),
      },
      {
        bold: "No interest on it",
        text: "The deficit is a count of underlying tokens. The Pool writes it in two places only: a write-off raises it and a cover lowers it. So the deficit now equals everything written off less everything covered.",
        sources: deficitLinks("O7", "O3", "O5"),
      },
      {
        bold: "The getter",
        text: 'Pool.getReserveDeficit(asset) returns the reserve\'s deficit. Aave\'s Pool docs: "Returns the current deficit of a reserve", the "Current reserve deficit from undercollateralized borrow positions".',
        sources: deficitLinks("O6g", "D1"),
      },
    ],
    links: deficitLinks("D1", "D3"),
  };
}
