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

import { centsOf, roundAway, shownUsd } from "@/lib/shared/shown-usd";
import {
  differentBases,
  type FlowSegment,
  type FlowSideState,
  type FlowUnit,
  type MarketMove,
} from "@/lib/shared/flows-timeline";

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
  /** The printed figure, unsigned: "$79,412"; "—" where it has none. */
  amount: string;
  /** A line of legs with their parts: signed, the sum of their cents. */
  cents?: number;
  /** The assets of an unpriced leg: the line draws no figure. */
  unpriced?: string[];
  /** The balancing item has no figure, and why. */
  none?: string;
}

export interface SideSumRows {
  lines: SumLine[];
  /** What is held or owed, in whole dollars, and printed; `cents` where the
   *  lines are in cents. */
  total: { dollars: number; amount: string; seg: FlowSegment; cents?: number; none?: string };
}

/** The figure a line draws where it has none. */
export const NO_FIGURE = "—";

const toCents = centsOf;

/** "$79,412": whole dollars with thousands separators, unsigned. */
export function wholeUsd(v: number, unit?: FlowUnit): string {
  // A figure with no price (not a number) prints no figure (ui-jobs 743).
  if (!Number.isFinite(v)) return NO_FIGURE;
  if (unit) {
    const x = Math.round(Math.abs(v)) / 10 ** unit.scale;
    const d = unit.scale;
    return `${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} ${unit.symbol}`;
  }
  return `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
}

/** The side's sum at a stop, as the panel prints it. */
export function sideSumRows(st: FlowSideState, unit?: FlowUnit): SideSumRows {
  const held = st.bar.find((s) => s.fill === "held") as FlowSegment;
  // A held asset with no price that day: no held figure, and no remainder
  // worked out from one (ui-jobs 743).
  if (!unit && held.unpriced?.length) return heldUnpricedRows(st, held);
  // A side whose lines carry their legs (ui-jobs 743) sums in cents.
  if (!unit && [...st.sources, ...st.bar].some((x) => x.legs)) return centsSumRows(st, held);
  const totalDollars = roundAway(heldCents(held, unit) ?? st.now);
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

/** The side's sum in cents (ui-jobs 743): each line the sum of its legs'
 *  cents, printed to the dollar; a line holding an unpriced leg draws no
 *  figure; the balancing item is what is held or owed, to the cent, less
 *  the lines, and has no figure where a line has none or the lines and the
 *  held figure stand on different bases. Nothing is apportioned: the cents
 *  add, and each face is its cents to the dollar. */
function centsSumRows(st: FlowSideState, held: FlowSegment): SideSumRows {
  const total = heldCents(held) ?? toCents(Math.max(0, st.now));
  const raw: SumLine[] = [];
  const push = (seg: FlowSegment, kind: SumLine["kind"], sign: 1 | -1) => {
    if (seg.unpriced?.length) {
      raw.push({
        key: seg.key,
        label: seg.label,
        kind,
        seg,
        dollars: 0,
        sign: "",
        amount: NO_FIGURE,
        unpriced: seg.unpriced,
      });
      return;
    }
    const cents = sign * toCents(seg.value);
    if (Math.abs(cents) < 0.005) return;
    raw.push({ key: seg.key, label: seg.label, kind, seg, dollars: roundAway(cents), sign: "", amount: "", cents });
  };
  for (const seg of st.sources) if (seg.fill === "in") push(seg, seg.key.endsWith("-opening") ? "opening" : "in", 1);
  for (const seg of st.bar) if (seg.fill === "out") push(seg, "out", -1);
  const rest = st.sources.find((x) => x.fill === "estimate");
  if (rest) {
    const unpriced = [...new Set(raw.flatMap((l) => l.unpriced ?? []))];
    // A leg with no basis of its own stands on the family's.
    const heldBasis = held.priceBasis ?? "";
    const bases = [...new Set(raw.flatMap((l) => (l.seg.legs ?? []).map((g) => g.basis ?? heldBasis)))];
    const market: MarketMove = unpriced.length
      ? { none: `No figure: ${noPriceWords(unpriced)}.` }
      : bases.some((b) => b !== heldBasis)
        ? {
            none: differentBases(
              bases.filter((b) => b !== heldBasis).join(" and ") || "another basis",
              heldBasis || "another basis",
            ),
          }
        : (() => {
            const lines = toCents(raw.reduce((a, l) => a + (l.cents ?? 0), 0));
            return { cents: toCents(total - lines), held: total, lines };
          })();
    const seg = { ...rest, market };
    if ("none" in market)
      raw.push({
        key: rest.key,
        label: rest.label,
        kind: "rest",
        seg,
        dollars: 0,
        sign: "",
        amount: NO_FIGURE,
        none: market.none,
      });
    else if (Math.abs(market.cents) >= 0.005)
      raw.push({
        key: rest.key,
        label: rest.label,
        kind: "rest",
        seg,
        dollars: roundAway(market.cents),
        sign: "",
        amount: "",
        cents: market.cents,
      });
  }
  const lines = raw.map((l, i) => ({
    ...l,
    sign: (l.cents == null ? "" : i === 0 && l.cents > 0 ? "" : l.cents < 0 ? "−" : "+") as SumSign,
    amount: l.cents == null ? NO_FIGURE : wholeUsd(l.cents),
  }));
  return { lines, total: { dollars: roundAway(total), amount: wholeUsd(total), seg: held, cents: total } };
}

/** "WETH has no price at its block"; "WETH and USDC have no price at their
 *  blocks". */
export const noPriceWords = (xs: string[]): string =>
  xs.length > 1 ? `${listWords(xs)} have no price at their blocks` : `${listWords(xs)} has no price at its block`;

/** A side whose held figure has no price that day: the flows as they stand,
 *  the total "—" naming the asset, and no balancing item. */
function heldUnpricedRows(st: FlowSideState, held: FlowSegment): SideSumRows {
  const none = `No figure: ${noPriceWords(held.unpriced ?? [])} on this day.`;
  const raw: SumLine[] = [];
  for (const seg of st.sources)
    if (seg.fill === "in" && seg.value)
      raw.push({
        key: seg.key,
        label: seg.label,
        kind: seg.key.endsWith("-opening") ? "opening" : "in",
        seg,
        dollars: roundAway(seg.value),
        sign: "",
        amount: "",
      });
  for (const seg of st.bar)
    if (seg.fill === "out" && seg.value)
      raw.push({
        key: seg.key,
        label: seg.label,
        kind: "out",
        seg,
        dollars: -roundAway(seg.value),
        sign: "",
        amount: "",
      });
  const lines = raw.map((l, i) => ({
    ...l,
    sign: (i === 0 && l.dollars > 0 ? "" : l.dollars < 0 ? "−" : "+") as SumSign,
    amount: seg_amount(l),
  }));
  return { lines, total: { dollars: 0, amount: NO_FIGURE, seg: held, none } };
}
const seg_amount = (l: SumLine) => (l.seg.unpriced?.length ? NO_FIGURE : wholeUsd(l.dollars));

/** A past day's held figure from its rows: each asset's balance times that
 *  day's price, as shown, summed to the cent (ui-jobs 743); null where the
 *  segment carries no priced rows or the figures are a token's. */
export function heldCents(held: FlowSegment, unit?: FlowUnit): number | null {
  const rows = held.heldRows;
  if (unit || !rows?.length || rows.some((r) => (r.amount ?? 0) > 0 && r.priced?.price == null)) return null;
  return toCents(
    rows.reduce((a, r) => a + ((r.amount ?? 0) > 0 ? shownUsd(r.amount as number, r.priced!.price!) : 0), 0),
  );
}

/** "WETH", "WETH and USDC", "WETH, USDC and DAI". */
export const listWords = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

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
