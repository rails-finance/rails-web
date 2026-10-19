// The Liquity V2 forks' gas compensation escrow (rails-ops TO-DO-ui-jobs 363,
// 366, 388): what a deployment hands the card, and the words its spine row and
// sheet footnote read. The footnote is built by the family's
// components/protocol/liquity-family/gas-escrow.ts.

import type { Provenance } from "@/components/shared/provenance";
import type { GasEscrowMove, LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
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

/** The footnote's read-more, the amount and token named from the fork's
 *  constant. */
export function forkEscrowTip(e: LiquityGasEscrow): string {
  return `The gas compensation escrow: the ${e.label} every Trove sends to its branch's GasPool at its open, on every branch, held apart from its collateral and outside the collateral ratio. It returns on close and goes to the liquidator on a liquidation.`;
}
