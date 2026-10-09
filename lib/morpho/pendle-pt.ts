// A Pendle principal token as a Morpho market's collateral, read from its
// symbol: `PT-<underlying>-<DMMMYYYY>` (PT-apxUSD-5NOV2026, PT-sUSDE-27MAR2025).
// What such a token is lives in content/morpho/event-prose.yaml (the modals'
// "Pendle principal token" concept, drawn for these markets alone).

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Whether the symbol names a Pendle principal token with a maturity date. */
export function isPendlePt(symbol: string | null | undefined): boolean {
  const m = symbol?.match(/^PT-(.+)-(\d{1,2})([A-Z]{3})(\d{4})$/);
  return m != null && MONTHS.includes(m[3]);
}
