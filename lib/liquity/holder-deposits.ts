// The holder strip's Stability Pool deposits sentence, shared by the Liquity
// V1 and V2 adapters (lib/liquity-v1/holder-strip.ts,
// lib/liquity-v2/holder-strip.ts): it follows the Troves' sentence and counts
// the wallet's deposits by status (rails-ops TO-DO-stability-pool-deposits §1b).

const n = (v: number) => v.toLocaleString("en-US");
const noun = (v: number) => `${n(v)} ${v === 1 ? "Stability Pool deposit" : "Stability Pool deposits"}`;

/** " It has 1 Stability Pool deposit and has closed 2." — empty for none. */
export function depositsLine(open: number, closed: number): string {
  if (open > 0) return ` It has ${noun(open)}${closed > 0 ? ` and has closed ${n(closed)}` : ""}.`;
  return closed > 0 ? ` It has closed ${noun(closed)}.` : "";
}
