// Receipts for the date scrubber's figures (components/shared/
// lifetime-flows-scrubber.tsx). Each states what the figure sums and to which
// date; a segment's tip lists its assets.

import type { Provenance } from "@/components/shared/provenance";
import type { FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";

/** `when` is "now" at the live stop, else "the end of 9 Nov 2025". `daily`:
 *  held assets are valued at a daily price series. */
export function flowSegmentProv(
  s: FlowSegment,
  side: FlowSide,
  when: string,
  isLive: boolean,
  daily = false,
): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  if (s.fill === "held")
    return isLive
      ? {
          kind: "chain-derived",
          summary: `${s.label} — each asset the position has ${held} now, at the oracle price now, added up. The segment's tip lists them.`,
          formula: "Σ balance × price",
        }
      : daily
        ? {
            kind: "chain-derived",
            summary: `${s.label} at ${when} — each asset's balance after its last event by then, at the last oracle price recorded by the end of that day, added up.`,
            formula: "Σ balance × price at the day's end",
          }
        : {
            kind: "chain-derived",
            summary: `${s.label} at ${when} — each asset's balance after its last event by then, at the oracle price that event carried, added up.`,
            formula: "Σ balance × price at its last event",
          };
  if (s.fill === "estimate")
    return {
      kind: "chain-derived",
      summary: s.key.endsWith("-interest")
        ? `${s.label} — over the position's whole life, as the Explanation states it.`
        : `${s.label} at ${when} — the bar's length less the sources beside it: what prices and interest added to what came in. No funds moved.`,
      formula: s.key.endsWith("-interest") ? undefined : "in − Σ sources",
    };
  return {
    kind: "chain-derived",
    summary: `${s.label} up to ${when} — every such flow the position's events record by then, each at the oracle price at its block, added up.`,
    formula: "Σ amount × price at block",
  };
}

/** The balancing item in a side's sum: what is held or owed at the date less
 *  every flow above it, printed from the printed figures so the lines add. */
export function flowRemainderProv(label: string, side: FlowSide, when: string): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  return {
    kind: "chain-derived",
    summary: `${label} ${when === "now" ? "now" : `at ${when}`} — the remainder: what the position has ${held} ${when === "now" ? "now" : "at that date"} less every flow above it, each flow valued at the oracle price at its block. It holds price changes and interest together; no funds moved.`,
    formula: `${held} − Σ flows`,
  };
}

/** What was held or owed when the bars' window opens: the first line of a
 *  windowed side's sum. */
export function flowOpeningProv(label: string, side: FlowSide): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  return {
    kind: "chain-derived",
    summary: `${label} — what the position had ${held} at the close of the day before the bars' window opens: each asset's balance after its last event by then, at the last oracle price recorded that day, added up.`,
    formula: "Σ balance × price at the day's end",
  };
}

/** One asset's part of a segment in the panel: a flow's running total in that
 *  asset, or what is held or owed of it at the date. */
export function flowAssetProv(
  symbol: string,
  s: FlowSegment,
  side: FlowSide,
  when: string,
  isLive: boolean,
  daily = false,
): Provenance {
  if (s.fill === "held") {
    const held = side === "collateral" ? "held" : "owed";
    return {
      kind: "chain-derived",
      summary: isLive
        ? `${symbol} ${held} now — the position's ${symbol} balance at the oracle price now.`
        : `${symbol} ${held} at ${when} — the ${symbol} balance after its last event by then, at ${daily ? "the last oracle price recorded by the end of that day" : "the oracle price that event carried"}.`,
      formula: daily && !isLive ? "balance × price at the day's end" : "balance × price",
    };
  }
  return {
    kind: "chain-derived",
    summary: `${s.label} in ${symbol} up to ${when} — every ${symbol} flow of this kind the position's events record by then, each at the oracle price at its block, added up.`,
    formula: "Σ amount × price at block",
  };
}
