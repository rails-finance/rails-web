// Position-level receipt identities for a trove's lifetime-maximum figures —
// shared by the closed summary card's face stats and the explanation pane's
// bullets, so both register the same receipt.
//
// Derivation: rails-server mig 002 (trove_peak_values_mv) — the maximum over
// every logged after-state (a batched trove's debt being its share of the
// batch's), and over the state just before each operation that reduced the
// debt (after-state minus the operation's change), which is where the interest
// built up before a repayment or a close shows.

import type { Provenance } from "@/components/shared/provenance";

export const trovePeakDebtProv: Provenance = {
  kind: "derived",
  summary:
    "Highest debt the trove has had — the largest of two sets of figures: the debt the contract logged after each of the trove's changes, and the debt the trove had just before each repayment, which includes the interest built up to then.",
  via: "max(debt) over the trove's TroveUpdated, BatchedTroveUpdated and TroveOperation logs",
};

export const trovePeakCollProv: Provenance = {
  kind: "derived",
  summary:
    "Highest collateral the trove has held — the largest of the balances the contract logged after each of the trove's changes and the balances just before each operation that reduced its debt.",
  via: "max(coll) over the trove's TroveUpdated, BatchedTroveUpdated and TroveOperation logs",
};
