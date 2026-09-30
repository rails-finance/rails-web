// A side's sum in the Lifetime flows panel (components/shared/
// lifetime-flows-tip.tsx; rails-ops reference/lifetime-flows-scrubber.md):
// one signed line per component, in whole dollars, landing on what the side
// holds or owes at the cursor's date. The grammar is the retired towers' key
// (components/shared/flows-ledger.tsx): the first line unsigned, each later
// line signed, the total under a rule.
//
// Order: what was held when the bars' window opens (where it opens after the
// first event), each inflow, each outflow in the bar's order, then the
// balancing item. The balancing item is the remainder: it is worked out from
// the printed figures (the total less every other printed line), so the
// printed lines add to the printed total, to the dollar. Its raw figure
// differs from the printed one by at most the rounding of the other lines.
//
// Pure, tested offline (scripts/verify/verify-lifetime-flows-state.ts).

import type { FlowSegment, FlowSideState } from "@/lib/shared/flows-timeline";

export type SumSign = "" | "+" | "−";

export interface SumLine {
  key: string;
  label: string;
  kind: "opening" | "in" | "out" | "rest";
  /** The segment the line states (a source, an outflow, the balancing item). */
  seg: FlowSegment;
  /** Signed whole dollars, as printed. */
  dollars: number;
  sign: SumSign;
  /** The printed figure, unsigned: "$79,412". */
  amount: string;
}

export interface SideSumRows {
  lines: SumLine[];
  /** What is held or owed, in whole dollars, and printed. */
  total: { dollars: number; amount: string; seg: FlowSegment };
}

/** "$79,412": whole dollars with thousands separators, unsigned. */
export function wholeUsd(v: number): string {
  return `$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}

/** The side's sum at a stop, as the panel prints it. */
export function sideSumRows(st: FlowSideState): SideSumRows {
  const held = st.bar.find((s) => s.fill === "held") as FlowSegment;
  const totalDollars = Math.round(st.now);
  const raw: Omit<SumLine, "sign" | "amount">[] = [];
  for (const seg of st.sources) {
    if (seg.fill !== "in") continue;
    raw.push({
      key: seg.key,
      label: seg.label,
      kind: seg.key.endsWith("-opening") ? "opening" : "in",
      seg,
      dollars: Math.round(seg.value),
    });
  }
  for (const seg of st.bar) {
    if (seg.fill !== "out") continue;
    raw.push({ key: seg.key, label: seg.label, kind: "out", seg, dollars: -Math.round(seg.value) });
  }
  const shown = raw.filter((l) => l.dollars !== 0);
  const rest = st.sources.find((s) => s.fill === "estimate");
  if (rest) {
    const dollars = totalDollars - shown.reduce((a, l) => a + l.dollars, 0);
    if (dollars !== 0) shown.push({ key: rest.key, label: rest.label, kind: "rest", seg: rest, dollars });
  }
  const lines = shown.map((l, i) => ({
    ...l,
    sign: (i === 0 && l.dollars > 0 ? "" : l.dollars < 0 ? "−" : "+") as SumSign,
    amount: wholeUsd(l.dollars),
  }));
  return { lines, total: { dollars: totalDollars, amount: wholeUsd(totalDollars), seg: held } };
}

/** Whole-dollar parts that add to `total` (largest remainder), where the raw
 *  parts add to within a dollar of it; else each part rounded on its own. */
export function apportionDollars(parts: number[], total: number): number[] {
  const sum = parts.reduce((a, v) => a + v, 0);
  const floors = parts.map((v) => Math.floor(v));
  if (Math.abs(sum - total) >= 1 || parts.some((v) => v < 0)) return parts.map((v) => Math.round(v));
  let left = total - floors.reduce((a, v) => a + v, 0);
  const order = parts.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  const out = [...floors];
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}
