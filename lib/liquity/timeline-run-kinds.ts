// The Liquity V2 Trove timeline's two run kinds as plain data: which operation
// collapses and from how long a streak. The run specs
// (lib/liquity/timeline-runs.tsx) draw them; the home page's live example
// (lib/home/live-example-data.ts) reads them on the server to ship whole rows.

/** Runs shorter than this stay as individual cards: collapsing two or three
 *  rows would hide meaningful events behind a click for no density win. */
export const MIN_REDEMPTION_RUN = 4;
/** Delegate rate adjusts are pure automation, so a shorter streak already
 *  reads as noise; a lone pair still stands as rows. */
export const MIN_DELEGATE_ADJUST_RUN = 3;

/** The run kinds, in match order. */
export const LIQUITY_RUN_KINDS: readonly { operation: string; min: number }[] = [
  { operation: "redeemCollateral", min: MIN_REDEMPTION_RUN },
  { operation: "setBatchManagerAnnualInterestRate", min: MIN_DELEGATE_ADJUST_RUN },
];
