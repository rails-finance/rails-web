// Provenance objects for the trove tower's lifetime-flow lines — split out of
// lib/liquity/economics.ts because check-explainer-register.mjs scans that
// file's string literals for the plain-words register, and a sum receipt's
// formula legitimately carries "Σ" (sum-of-timeline-events notation), which
// the register bans everywhere else. Every other protocol keeps this same
// receipt prose in its own event-provenance.ts, outside the scanned roster —
// this file is the Liquity V2 tower's equivalent.

import type { Provenance } from "@/components/shared/provenance";
import type { TroveState } from "@/lib/shared/types/event-shape";
import { originSeg, scalingOf, streamVia } from "@/lib/liquity/event-provenance";

// A lifetime-flow figure is added up in the browser from the trove's whole
// event history (lib/liquity/economics.ts: each operation's collateral and
// debt change, by sign and by operation). Each summary is written out as a
// `summary:` literal so check:receipts reads it.
const flow = (p: { summary: string; formula: string }): Provenance => ({
  kind: "derived",
  via: "added up across the trove's events",
  ...p,
});

/** `state` is the after-state of the trove's most recent event — the row the
 *  figure is read from — so the via line and the scaling sentence carry that
 *  row's raw when the backend delivered one. */
export const collCurrentProv = (collSym: string, state?: TroveState): Provenance => ({
  kind: "chain",
  summary: `Collateral held by the trove — the ${collSym} balance the contract logged at the trove's most recent change.`,
  via: `${streamVia()} · ${originSeg(state?.origin?.coll, { event: "TroveUpdated", param: "_coll", scale: 18, raw: state?.raw?.coll })}`,
  scaling: scalingOf(state?.origin?.coll, { scale: 18, raw: state?.raw?.coll }, { token: collSym }),
});

export const collWithdrawnProv: Provenance = flow({
  summary: "Total withdrawn — all the collateral the owner has taken out of the trove, closing it included.",
  formula: "Σ |negative collateral changes|",
});

export const collRedeemedProv: Provenance = flow({
  summary: "Redeemed collateral — all the collateral that redemptions have taken from this trove.",
  formula: "Σ redemption collateral changes",
});

export const collLiquidatedProv: Provenance = flow({
  summary:
    "Liquidated collateral — the collateral the trove lost to liquidation. It is what is left of everything that came in (deposits and redemption fees) once the collateral withdrawn, redeemed, still held and claimable by the owner is taken away.",
  formula: "deposited + fees received − held − withdrawn − redeemed − claimable surplus",
});

export const collFeesReceivedProv: Provenance = flow({
  summary:
    "Fees received — a redeemer pays a fee in collateral, and the fee stays in the trove that was redeemed. This is the total of the fees paid to this trove.",
  formula: "Σ redemption fees paid to the trove",
});

export const collClaimableProv: Provenance = flow({
  summary:
    "Claimable surplus — the collateral left over once a liquidation had covered the trove's debt. The owner can claim it.",
  formula: "Σ liquidation collateral surplus",
});

export const debtCurrentProv: Provenance = {
  kind: "derived",
  summary:
    "Debt owed today, before interest — the trove's debt now, with the lifetime interest on the row below taken out. The debt now is the debt the contract last logged plus the interest built up since, worked out from the trove's rate and the time elapsed.",
  via: "the trove's most recent logged debt + interest since, from its rate",
  formula: "debt now − lifetime interest",
};

export const debtInterestProv: Provenance = {
  kind: "derived",
  summary:
    "Lifetime interest — everything repaid, redeemed, liquidated or still owed, minus the amount borrowed and the upfront and delegate fees. What is left is the interest the trove has been charged.",
  via: "added up across the trove's events",
  formula: "(repaid + redeemed + liquidated + current debt) − borrowed − upfront fees − delegate fees",
};

export const debtRepaidProv: Provenance = flow({
  summary: "Total repaid — all the BOLD the owner has repaid, closing the trove included.",
  formula: "Σ |negative debt changes|",
});

export const debtRedeemedProv: Provenance = flow({
  summary: "Redeemed debt — all the BOLD debt that redemptions have cleared from this trove.",
  formula: "Σ redemption debt changes",
});

export const debtLiquidatedProv: Provenance = flow({
  summary: "Liquidated debt — the BOLD debt cleared when the trove was liquidated.",
  formula: "Σ liquidation debt changes",
});

export const debtUpfrontFeesProv: Provenance = flow({
  summary: "Upfront fees — the one-off borrowing fees the contract has added to the trove's debt.",
  formula: "Σ debtIncreaseFromUpfrontFee",
});

export const debtDelegateFeesProv: Provenance = {
  kind: "derived",
  summary:
    "Lifetime delegate fees — an estimate of the delegate's part of the trove's lifetime interest. It applies today's split between the delegate's fee rate and the trove's total rate to the trove's whole life.",
  via: "added up across the trove's events",
  formula: "interest+mgmt × (mgmt rate ÷ total rate)",
};
