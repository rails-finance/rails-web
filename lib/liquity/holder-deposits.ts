// The holder strip's sentence for the wallet's other position kinds, shared by
// the Liquity V1 and V2 adapters (lib/liquity-v1/holder-strip.ts,
// lib/liquity-v2/holder-strip.ts): it follows the Troves' sentence and counts
// each kind by status (Stability Pool deposits on both, LQTY stakes on V1).

const n = (v: number) => v.toLocaleString("en-US");

/** A kind the wallet holds: its noun, singular and plural, and its counts. */
export interface KindCount {
  one: string;
  many: string;
  open: number;
  closed: number;
}

const noun = (v: number, k: KindCount) => `${n(v)} ${v === 1 ? k.one : k.many}`;
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One kind: " It has 1 Stability Pool deposit and has closed 2." Several:
 *  " It has 1 Stability Pool deposit and 1 LQTY stake. It has closed 2 LQTY
 *  stakes." Empty for none. */
export function kindsLine(kinds: KindCount[]): string {
  const held = kinds.filter((k) => k.open > 0 || k.closed > 0);
  if (held.length === 0) return "";
  if (held.length === 1) {
    const k = held[0];
    if (k.open > 0) return ` It has ${noun(k.open, k)}${k.closed > 0 ? ` and has closed ${n(k.closed)}` : ""}.`;
    return ` It has closed ${noun(k.closed, k)}.`;
  }
  const open = held.filter((k) => k.open > 0).map((k) => noun(k.open, k));
  const closed = held.filter((k) => k.closed > 0).map((k) => noun(k.closed, k));
  return `${open.length ? ` It has ${and(open)}.` : ""}${closed.length ? ` It has closed ${and(closed)}.` : ""}`;
}

/** " It has 1 Stability Pool deposit and has closed 2." — empty for none. */
export const depositsLine = (open: number, closed: number): string =>
  kindsLine([{ one: "Stability Pool deposit", many: "Stability Pool deposits", open, closed }]);
