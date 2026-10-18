// The Liquity V2 forks' gas compensation escrow (rails-ops TO-DO-ui-jobs 363,
// 366): what a deployment hands the card, and the words its spine row and
// sheet panel read. The panel is built by the family's
// components/protocol/liquity-family/gas-escrow.ts.

import type { Provenance } from "@/components/shared/provenance";
import type { GasEscrowMove, LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
import type { GasEscrowWords } from "@/components/protocol/liquity-family/gas-escrow";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";

/** A fork's escrow: its constant and its receipt (lib/<fork>/event-provenance.ts). */
export interface LiquityForkEscrow {
  constant: LiquityGasEscrow;
  prov: (move: GasEscrowMove, coords?: LiquityForkCoords) => Provenance;
}

export const FORK_ESCROW_WORDS = {
  spineSent: "gas compensation escrow sent",
  spineReturned: "gas compensation escrow returned",
};

/** The panel's words, the amount and token named from the fork's constant. */
export function forkEscrowWords(e: LiquityGasEscrow): GasEscrowWords {
  return {
    name: "Gas compensation escrow",
    tip: `The ${e.label} every Trove sends to its branch's GasPool at its open, on every branch, held apart from its collateral. It returns on close and goes to the liquidator on a liquidation.`,
    sent: "Sent with the collateral",
    returned: "Returned to the owner",
    paid: "Paid to the liquidator",
    tipSent: `The escrow the owner sent to the GasPool in the open's transaction, beside the collateral. It counts toward neither the collateral nor the collateral ratio.`,
    tipReturned: `The escrow the GasPool sent back to the owner in the close's transaction.`,
    tipPaid: `The escrow the GasPool paid to the liquidator, beside the liquidator's share of the collateral. It sits apart from the collateral, so it is not part of the seizure.`,
    tipLast: `The escrow the Trove held after its previous event, the fixed amount since the open.`,
    tipMarket: `The change the ${e.symbol} price made to the dollar value of the escrow between the Trove's previous event and this one.`,
    tipBefore: `The escrow just before this event, at this block's ${e.symbol} price.`,
    tipTotal: `The escrow the Trove holds after this event in ${e.symbol}, and in dollars at the branch's ${e.symbol} price at this block.`,
    tipTotalUnpriced: `The escrow the Trove holds after this event, in ${e.symbol}. This branch's events carry the price of their collateral and not ${e.symbol}'s, so there is no dollar figure.`,
  };
}
