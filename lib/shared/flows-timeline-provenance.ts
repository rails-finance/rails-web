// Receipts for the date scrubber's figures (components/shared/
// lifetime-flows-scrubber.tsx). Each states what the figure sums and to which
// date; the Full breakdown under the scrubber carries the per-asset receipts.

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
          summary: `${s.label} — each asset the position has ${held} now, at the oracle price now, added up. The Full breakdown lists them.`,
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
      summary:
        s.key.endsWith("-interest") || s.key.endsWith("-price")
          ? `${s.label} — as the Full breakdown states it for the position's whole life.`
          : `${s.label} at ${when} — the bar's length less the sources beside it: what prices and interest added to what came in. No funds moved.`,
      formula: s.key.endsWith("-interest") || s.key.endsWith("-price") ? undefined : "in − Σ sources",
    };
  return {
    kind: "chain-derived",
    summary: `${s.label} up to ${when} — every such flow the position's events record by then, each at the oracle price at its block, added up.`,
    formula: "Σ amount × price at block",
  };
}

/** The summary line's totals: everything in, everything out. */
export function flowTotalProv(side: FlowSide, part: "in" | "out" | "liquidated", when: string): Provenance {
  if (part === "in")
    return {
      kind: "chain-derived",
      summary: `${side === "collateral" ? "In" : "Owed in all"} up to ${when} — the bar's whole length: what is still ${side === "collateral" ? "held" : "owed"} plus everything that left.`,
      formula: "held + Σ out",
    };
  if (part === "liquidated" || side === "debt")
    return {
      kind: "chain-derived",
      summary: `${part === "liquidated" ? "Liquidated" : "Repaid"} up to ${when} — the ${part === "liquidated" ? "liquidation" : "repayment"} segments added up, each flow at the oracle price at its block.`,
      formula: "Σ out",
    };
  return {
    kind: "chain-derived",
    summary: `Out up to ${when} — the hatched segments added up, each flow at the oracle price at its block.`,
    formula: "Σ out",
  };
}

/** One asset's figures in a bar's zoom view: held or owed at the stop, and
 *  what came in and left by then. */
export function flowAssetProv(
  symbol: string,
  side: FlowSide,
  part: "held" | "in" | "out",
  when: string,
  isLive: boolean,
  daily: boolean,
): Provenance {
  const heldWord = side === "collateral" ? "held" : "owed";
  if (part === "held")
    return isLive
      ? {
          kind: "chain-derived",
          summary: `${symbol} ${heldWord} now — its balance at the oracle price now, as the Full breakdown states it.`,
          formula: "balance × price",
        }
      : {
          kind: "chain-derived",
          summary: `${symbol} ${heldWord} at ${when} — its balance after its last event by then, at ${daily ? "the last oracle price recorded by that day's end" : "the oracle price that event carried"}.`,
          formula: daily ? "balance × price at the day's end" : "balance × price at its last event",
        };
  return {
    kind: "chain-derived",
    summary: `${symbol} ${part === "in" ? "in" : "out"} up to ${when} — every such flow of it, each at the oracle price at its block, added up.`,
    formula: "Σ amount × price at block",
  };
}
