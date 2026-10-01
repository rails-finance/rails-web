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

import type { FlowSegment, FlowSideState, FlowUnit } from "@/lib/shared/flows-timeline";

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
export function wholeUsd(v: number, unit?: FlowUnit): string {
  if (unit) {
    const x = Math.abs(Math.round(v)) / 10 ** unit.scale;
    const d = unit.scale;
    return `${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} ${unit.symbol}`;
  }
  return `$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}

/** Whole dollars, with a positive figure under half a dollar as "<$1": the
 *  whole-dollar rule (flows-ledger's interest lines), where "$0" would read as
 *  none. */
export function wholeUsdOrUnder(v: number, unit?: FlowUnit): string {
  if (v > 0 && v < 0.5) return unit ? `<${wholeUsd(1, unit)}` : "<$1";
  return wholeUsd(v, unit);
}

/** The side's sum at a stop, as the panel prints it. */
export function sideSumRows(st: FlowSideState, unit?: FlowUnit): SideSumRows {
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
  const rest = st.sources.find((s) => s.fill === "estimate");
  // A balancing item under half a dollar holds nothing but the other lines'
  // rounding: the lines are rounded together instead (largest remainder), so
  // no line states a dollar the position never had.
  if (rest && Math.abs(rest.value) < 0.5 && raw.length > 0) {
    const signed = raw.map((l) => (l.kind === "out" ? -l.seg.value : l.seg.value));
    const parts = apportionSigned(signed, totalDollars);
    raw.forEach((l, i) => (l.dollars = parts[i]));
  }
  const shown = raw.filter((l) => l.dollars !== 0);
  if (rest) {
    const dollars = totalDollars - shown.reduce((a, l) => a + l.dollars, 0);
    if (dollars !== 0) shown.push({ key: rest.key, label: rest.label, kind: "rest", seg: rest, dollars });
  }
  const lines = shown.map((l, i) => ({
    ...l,
    sign: (i === 0 && l.dollars > 0 ? "" : l.dollars < 0 ? "−" : "+") as SumSign,
    amount: wholeUsd(l.dollars, unit),
  }));
  return { lines, total: { dollars: totalDollars, amount: wholeUsd(totalDollars, unit), seg: held } };
}

/** The line under a side's sum that says how it is valued and what its
 *  balancing item holds: a family's own words where the balancing item
 *  carries them (Liquity), else the lending families' ("so it holds price
 *  changes and interest together"). `held` is "held" or "owed"; `at` the
 *  date in words ("at 5 Jul '25"). */
export function sumBasis(st: FlowSideState, rest: string, held: string, at: string): string {
  const seg = st.sources.find((x) => x.fill === "estimate");
  const tail = seg?.note
    ? `, so it is ${seg.note}.`
    : rest.toLowerCase() === "interest earned"
      ? "."
      : ", so it holds price changes and interest together.";
  return `${seg?.basis ?? "Each flow is valued at the price on its own day."} ${rest} is the remainder, ${held} ${at} less the lines above it${tail}`;
}

/** Signed whole parts that add to `total`: each part rounded, then the
 *  difference moved a unit at a time onto the parts whose rounding moved
 *  them furthest the other way. Parts that do not add to within a unit of
 *  the total are left rounded on their own. */
export function apportionSigned(parts: number[], total: number): number[] {
  const out = parts.map((v) => Math.round(v));
  const sum = parts.reduce((a, v) => a + v, 0);
  if (Math.abs(sum - total) >= 1) return out;
  let diff = total - out.reduce((a, v) => a + v, 0);
  const order = parts.map((v, i) => [v - out[i], i] as const);
  while (diff !== 0) {
    const up = diff > 0;
    order.sort((a, b) => (up ? b[0] - a[0] : a[0] - b[0]));
    const [, i] = order[0];
    out[i] += up ? 1 : -1;
    order[0] = [parts[i] - out[i], i];
    diff += up ? -1 : 1;
  }
  return out;
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
