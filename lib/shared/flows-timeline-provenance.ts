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
