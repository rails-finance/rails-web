// The Liquity V2 forks' gas compensation escrow (rails-ops TO-DO-ui-jobs 363,
// 366, 388): what a deployment hands the card, and the words its spine row and
// sheet footnote read. The footnote is built by the family's
// components/protocol/liquity-family/gas-escrow.ts.

import type { Provenance } from "@/components/shared/provenance";
import type { GasEscrowMove, LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";
import type { LiquityFamilyTerms } from "@/lib/liquity/ltv";

/** A fork's escrow: its constant and its receipt (lib/<fork>/event-provenance.ts). */
export interface LiquityForkEscrow {
  constant: LiquityGasEscrow;
  prov: (move: GasEscrowMove, coords?: LiquityForkCoords) => Provenance;
}

/** The spine row's words on the open and the close, in the deployment's
 *  name for the escrow (`LiquityGasEscrow.terms`, decision 0065). */
export function forkEscrowWords(e: LiquityGasEscrow): { spineSent: string; spineReturned: string } {
  const name = (e.terms?.name ?? "Gas compensation escrow").toLowerCase();
  return { spineSent: `${name} sent`, spineReturned: `${name} returned` };
}

/** The footnote's read-more, the amount and token named from the fork's
 *  constant. A deployment whose docs call it the liquidation reserve has it
 *  explained once as the refundable gas deposit they describe. */
export function forkEscrowTip(e: LiquityGasEscrow, t: LiquityFamilyTerms): string {
  const ratio = t.ltv ? "LTV" : t.ratioText;
  return e.terms
    ? `The ${e.terms.name.toLowerCase()}: a refundable gas deposit of ${e.label} every Trove sends to its branch's GasPool at its open, on every branch, held apart from its collateral and outside the ${ratio}. It returns on close and goes to the liquidator on a liquidation.`
    : `The gas compensation escrow: the ${e.label} every Trove sends to its branch's GasPool at its open, on every branch, held apart from its collateral and outside the ${ratio}. It returns on close and goes to the liquidator on a liquidation.`;
}
