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
      : s.basis
        ? { kind: "chain-derived", summary: `${s.label} at ${when} — ${s.basis}` }
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
        : s.note
          ? `${s.label} at ${when} — the bar's length less the sources beside it: ${s.note}. No funds moved.`
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
export function flowRemainderProv(label: string, side: FlowSide, when: string, note?: string): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  const holds = note ? `It is ${note}` : "It holds price changes and interest together";
  return {
    kind: "chain-derived",
    summary: `${label} ${when === "now" ? "now" : `at ${when}`} — the remainder: what the position has ${held} ${when === "now" ? "now" : "at that date"} less every flow above it, each flow valued at the oracle price at its block. ${holds}; no funds moved.`,
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

/** A figure of an event card's sum in the side's token (lib/shared/flow-focus.ts
 *  `eventTokenSum`): a line's running total, what is held or owed, or the
 *  transaction's move. `when`
 *  is "this event (5 Jul '25)". */
export function flowTokenProv(
  label: string,
  symbol: string,
  when: string,
  figure: "line" | "held" | "move" | "interest",
): Provenance {
  if (figure === "interest")
    return {
      kind: "chain-derived",
      summary: `${label} in ${symbol} at ${when} — the ${symbol} balance at the block less every ${symbol} flow before it: what the reserve's index added.`,
      formula: "balance − Σ flows",
    };
  if (figure === "move")
    return {
      kind: "chain-derived",
      summary: `${label}'s move at ${when} — the ${symbol} the event's transaction added or took, its legs added up; the interest built since the last event is not the transaction's.`,
      formula: "Σ legs of the transaction",
    };
  if (figure === "held")
    return {
      kind: "chain-derived",
      summary: `${label} at ${when} — the ${symbol} balance once the event's transaction had run, as the position's events record it.`,
      formula: "recorded balance",
    };
  return {
    kind: "chain-derived",
    summary: `${label} in ${symbol} up to ${when} — every ${symbol} amount of this kind the position's events record by then, added up. The lines are rounded together to the printed decimals, so they add to the total.`,
    formula: "Σ amount",
  };
}

/** The interest line of a side's sum by asset in dollars (lib/shared/flow-focus.ts
 *  `eventSideSumByAsset`). */
export function flowInterestUsdProv(label: string, when: string): Provenance {
  return {
    kind: "chain-derived",
    summary: `${label} at ${when} — each asset's interest in its token (its balance at the block less every flow in it) at the oracle price at the block, an asset no longer held at the price of its latest flow, added up.`,
    formula: "Σ (balance − Σ flows) × price",
  };
}

/** A figure of an event card's ledger (lib/shared/event-ledger.ts) that
 *  splits a line around the event: the line's earlier movements, the event's
 *  movement, or what was held or owed just before the transaction. `unit` is the
 *  token, or "USD". `when` is "this event (5 Jul '25)". */
export function ledgerPartProv(
  label: string,
  unit: string,
  when: string,
  part: "before" | "event" | "held-before",
): Provenance {
  const usd = unit === "USD";
  if (part === "held-before")
    return {
      kind: "chain-derived",
      summary: `${label} just before ${when} — the ${unit} balance before the event's transaction ran: the balance after it less the transaction's legs.`,
      formula: "balance after − Σ legs of the transaction",
    };
  if (part === "event")
    return {
      kind: "chain-derived",
      summary: `${label} at ${when} — the ${usd ? "USD of the" : unit} legs of this kind the event moved, added up${usd ? ", each at the oracle price at its block" : ""}.`,
      formula: usd ? "Σ amount × price at block" : "Σ legs",
    };
  return {
    kind: "chain-derived",
    summary: `${label} up to ${when} — every amount of this kind the position's events record before this one, added up${usd ? ", each at the oracle price at its block" : ` in ${unit}`}. The rows are rounded together, so they add to the total.`,
    formula: usd ? "Σ amount × price at block" : "Σ amount",
  };
}

/** A stablecoin debt's dollars at its $1 face, as the event card's Debt
 *  cell and its ledger count it: the debt before or after the event's
 *  transaction, one dollar a token. */
export function faceUsdProv(symbol: string, amount: string, which: "before" | "after"): Provenance {
  return {
    kind: "chain-derived",
    summary: `Debt ${which} this event in USD — the ${symbol} owed ${which} the transaction at its $1 face, as the Lifetime flows count it.`,
    formula: `${symbol} × $1`,
    inputs: [{ label: "debt", value: `${amount} ${symbol}`, kind: "chain", note: which }],
  };
}

/** An asset's dollar rows in a side's ledger by asset: its interest at
 *  the block's price, or the price's effect on it. */
export function ledgerAssetUsdProv(
  label: string,
  symbol: string,
  when: string,
  part: "interest" | "market",
): Provenance {
  return part === "interest"
    ? {
        kind: "chain-derived",
        summary: `${label} in ${symbol} at ${when}, in USD — the ${symbol} interest (its balance at the block less every flow in it) at the oracle price at the block, or at its latest flow's price where it is no longer held.`,
        formula: "(balance − Σ flows) × price",
      }
    : {
        kind: "chain-derived",
        summary: `${label} on ${symbol} at ${when} — the remainder: the ${symbol} balance at the oracle price at the block less every ${symbol} row above it. It is the change in ${symbol}'s price since its flows; no funds moved.`,
        formula: "balance × price − Σ rows",
      };
}
