// The Liquity V2 Trove timeline's two run kinds as plain data: which operation
// collapses. The run specs (lib/liquity/timeline-runs.tsx) draw them; the home
// page's live example (lib/home/live-example-data.ts) reads them on the server
// to ship whole rows. Each groups at `GROUP_MIN_TRANSACTIONS` (rails-ops
// decision 0039).

import { GROUP_MIN_TRANSACTIONS } from "@/lib/shared/timeline-chunks";

/** The one floor, under the names the run specs import. */
export const MIN_REDEMPTION_RUN = GROUP_MIN_TRANSACTIONS;
export const MIN_DELEGATE_ADJUST_RUN = GROUP_MIN_TRANSACTIONS;

/** The run kinds, in match order. */
export const LIQUITY_RUN_KINDS: readonly { operation: string }[] = [
  { operation: "redeemCollateral" },
  { operation: "setBatchManagerAnnualInterestRate" },
];
