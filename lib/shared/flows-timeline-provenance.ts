// Receipts for the date scrubber's figures (components/shared/
// lifetime-flows-scrubber.tsx). Each states what the figure sums and to which
// date; a segment's tip lists its assets.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { FlowLeg, FlowSegment, FlowSide, MarketMove } from "@/lib/shared/flows-timeline";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { listWords, noPriceWords } from "@/lib/shared/flows-sum";
import { formatUsdValue } from "@/lib/utils/format";

// ── The rows behind a line (ui-jobs 743) ─────────────────────────────────────
// A line whose legs carry their parts states every leg: its amount, its price
// as shown at its block with the price's source, their product to the cent,
// largest first, and the sum the line draws. Legs under a cent, and those past
// the first LEG_CAP, sit behind the dust control. A line holding an unpriced
// leg states no sum. The rows are built when the receipt opens (`key`).

/** Legs shown before the dust control. */
const LEG_CAP = 12;

/** How a whole-dollar face relates to its receipt. */
const FACE = "To the cent, shown to the dollar.";

const blockWords = (b: number | null | undefined) => (b != null ? `block ${b.toLocaleString("en-US")}` : null);

/** "WETH at block 23,456,789", told apart where two legs share one. */
function legLabels(legs: readonly FlowLeg[]): string[] {
  const seen = new Map<string, number>();
  return legs.map((l) => {
    const at = blockWords(l.block);
    const base = `${l.symbol ?? "Token"} ${at ? `at ${at}` : "at a block the read does not name"}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

const signedCents = (v: number): string => `${v < 0 ? "−" : ""}${formatUsdValue(Math.abs(v))}`;

/** A receipt whose rows are built on first read, when it opens; `key`
 *  stands for them in the registry's signature. */
function lazyProv(base: Omit<Provenance, "inputs" | "key">, key: string, build: () => ProvInput[]): Provenance {
  let rows: ProvInput[] | null = null;
  const p = { ...base, key } as Provenance;
  Object.defineProperty(p, "inputs", { enumerable: true, get: () => (rows ??= build()) });
  return p;
}

/** A line's receipt from its legs: each amount × price at its block, the
 *  products summed; or, with an unpriced leg, the assets with no price and
 *  no sum. */
export function legsProv(
  label: string,
  when: string,
  legs: readonly FlowLeg[],
  unpriced?: readonly string[],
): Provenance {
  if (unpriced?.length) {
    const names = [...unpriced];
    return {
      kind: "derived",
      summary: `${label} ${when}. No figure: ${noPriceWords(names)}, so the line is not summed.`,
      via: "the position's events · each leg × its price at its block",
      inputs: [
        {
          label: names.length > 1 ? "assets with no price" : "asset with no price",
          value: listWords(names),
          kind: "derived",
          note: `${legs.filter((l) => l.price == null).length} of the line's ${legs.length} legs`,
        },
      ],
    };
  }
  const sum = legs.reduce((a, l) => a + (l.usd ?? 0), 0);
  const key = `${legs.length}:${Math.round(sum * 100)}:${legs.at(-1)?.block ?? ""}`;
  const what = `${label} ${when}`;
  return lazyProv(
    {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${what}: ${legs.length > 1 ? "each token's amount times its price, summed" : "the amount times the price"}, each price at the block its row names. ${FACE}`,
      via: "the position's events · each leg × its price at its block · summed",
      formula: legs.length > 1 ? "Σ amount × price" : "amount × price",
    },
    key,
    () => {
      const labels = legLabels(legs);
      const { prov } = holderUsdReceipt({
        what,
        legs: legs.map((l, i) => ({
          token: l.symbol ?? "Token",
          label: labels[i],
          amount: l.amount ?? 0,
          amountNote: "the amount its event moved",
          price: l.price ?? 0,
          priceNote: l.priceNote ?? "the price at its block",
          ...(l.face ? { face: true } : {}),
        })),
        via: "",
        byValue: true,
        blocksPerRow: true,
      });
      // Past the first LEG_CAP legs (largest first), the rest sit behind the
      // dust control with those under a cent.
      const order: string[] = [];
      return (prov.inputs ?? []).map((r) => {
        const leg = labels.find((l) => r.label.startsWith(`${l} `));
        if (leg && !order.includes(leg)) order.push(leg);
        return leg && order.indexOf(leg) >= LEG_CAP ? { ...r, dust: true as const } : r;
      });
    },
  );
}

/** Market move in cents: what is held or owed to the cent less the lines
 *  above it, each a sum of shown products; or no figure, and why. */
export function marketMoveProv(label: string, side: FlowSide, when: string, m: MarketMove): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  if ("none" in m) return { kind: "derived", summary: `${label} ${when}. ${m.none}` };
  return {
    kind: "chain-derived",
    summary: `${label} ${when}. What the position has ${held}, its amount times its price as shown, less the lines above it, each the sum of its legs' shown products: the change in the prices since the flows. No funds moved. ${FACE}`,
    formula: `${held} − Σ lines`,
    inputs: [
      {
        label: held,
        value: formatUsdValue(m.held),
        kind: "chain-derived",
        pclass: "oracle",
        note: "amount × price as shown, to the cent",
      },
      { label: "lines", value: signedCents(m.lines), kind: "derived", note: "the lines above, each to the cent" },
      { label: "difference", value: signedCents(m.cents), kind: "derived", step: true },
    ],
  };
}

/** What a side holds or owes as one asset's amount times its price, as
 *  shown, the price at its block. */
export function heldUsdProv(
  label: string,
  when: string,
  h: { symbol: string; amount: number; price: number; block: number | null; priceNote?: string },
): Provenance {
  return holderUsdReceipt({
    what: `${label} ${when}`,
    legs: [
      {
        token: h.symbol,
        amount: h.amount,
        amountNote: "the balance once the event's transaction had run",
        price: h.price,
        priceNote:
          h.priceNote ?? (blockWords(h.block) ? `the price at ${blockWords(h.block)}` : "the latest block's price"),
      },
    ],
    block: h.block,
    via: "the position's balance × the price at the block",
    caveat: FACE,
  }).prov;
}

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
  if (s.legs && (s.fill === "in" || s.fill === "out"))
    return legsProv(s.label, isLive ? "now" : `up to ${when}`, s.legs, s.unpriced);
  if (s.market) return marketMoveProv(s.label, side, isLive ? "now" : `at ${when}`, s.market);
  if (s.fill === "held")
    return isLive
      ? {
          kind: "chain-derived",
          summary: `${s.label}. Each asset the position has ${held} now, at the oracle price now, added up. The segment's tip lists them.`,
          formula: "Σ balance × price",
        }
      : s.basis
        ? { kind: "chain-derived", summary: `${s.label} at ${when}. ${s.basis}` }
        : daily
          ? {
              kind: "chain-derived",
              summary: `${s.label} at ${when}. Each asset's balance after its last event by then, at the last oracle price recorded by the end of that day, added up.`,
              formula: "Σ balance × price at the day's end",
            }
          : {
              kind: "chain-derived",
              summary: `${s.label} at ${when}. Each asset's balance after its last event by then, at the oracle price that event carried, added up.`,
              formula: "Σ balance × price at its last event",
            };
  if (s.fill === "estimate")
    return {
      kind: "chain-derived",
      summary: s.key.endsWith("-interest")
        ? `${s.label}. Over the position's whole life, as the Explanation states it.`
        : s.note
          ? `${s.label} at ${when}. The bar's length less the sources beside it: ${s.note}. No funds moved.`
          : `${s.label} at ${when}. The bar's length less the sources beside it; what prices and interest added to what came in. No funds moved.`,
      formula: s.key.endsWith("-interest") ? undefined : "in − Σ sources",
    };
  return {
    kind: "chain-derived",
    summary: `${s.label} up to ${when}. Every such flow the position's events record by then, each at the oracle price at its block, added up.${s.served ? ` ${s.served}` : ""}`,
    formula: "Σ amount × price at block",
  };
}

/** The balancing item in a side's sum: what is held or owed at the date less
 *  every flow above it, printed from the printed figures so the lines add. */
export function flowRemainderProv(
  label: string,
  side: FlowSide,
  when: string,
  note?: string,
  market?: MarketMove,
): Provenance {
  if (market) return marketMoveProv(label, side, when === "now" ? "now" : `at ${when}`, market);
  const held = side === "collateral" ? "held" : "owed";
  const holds = note ? `It is ${note}` : "It holds price changes and interest together";
  return {
    kind: "chain-derived",
    summary: `${label} ${when === "now" ? "now" : `at ${when}`}. The remainder; what the position has ${held} ${when === "now" ? "now" : "at that date"} less every flow above it, each flow valued at the oracle price at its block. ${holds}; no funds moved.`,
    formula: `${held} − Σ flows`,
  };
}

/** What was held or owed when the bars' window opens: the first line of a
 *  windowed side's sum. */
export function flowOpeningProv(label: string, side: FlowSide): Provenance {
  const held = side === "collateral" ? "held" : "owed";
  return {
    kind: "chain-derived",
    summary: `${label}. What the position had ${held} at the close of the day before the bars' window opens; each asset's balance after its last event by then, at the last oracle price recorded that day, added up.`,
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
        ? `${symbol} ${held} now. The position's ${symbol} balance at the oracle price now.`
        : `${symbol} ${held} at ${when}. The ${symbol} balance after its last event by then, at ${daily ? "the last oracle price recorded by the end of that day" : "the oracle price that event carried"}.`,
      formula: daily && !isLive ? "balance × price at the day's end" : "balance × price",
    };
  }
  return {
    kind: "chain-derived",
    summary: `${s.label} in ${symbol} up to ${when}. Every ${symbol} flow of this kind the position's events record by then, each at the oracle price at its block, added up.`,
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
      summary: `${label} in ${symbol} at ${when}. The ${symbol} balance at the block less every ${symbol} flow before it; what the reserve's index added.`,
      formula: "balance − Σ flows",
    };
  if (figure === "move")
    return {
      kind: "chain-derived",
      summary: `${label}'s move at ${when}. The ${symbol} the event's transaction added or took, its legs added up; the interest built since the last event is not the transaction's.`,
      formula: "Σ legs of the transaction",
    };
  if (figure === "held")
    return {
      kind: "chain-derived",
      summary: `${label} at ${when}. The ${symbol} balance once the event's transaction had run, as the position's events record it.`,
      formula: "recorded balance",
    };
  return {
    kind: "chain-derived",
    summary: `${label} in ${symbol} up to ${when}. Every ${symbol} amount of this kind the position's events record by then, added up. The lines are rounded together to the printed decimals, so they add to the total.`,
    formula: "Σ amount",
  };
}

/** The interest line of a side's sum by asset in dollars (lib/shared/flow-focus.ts
 *  `eventSideSumByAsset`). */
export function flowInterestUsdProv(label: string, when: string): Provenance {
  return {
    kind: "chain-derived",
    summary: `${label} at ${when}. Each asset's interest in its token (its balance at the block less every flow in it) at the oracle price at the block, an asset no longer held at the price of its latest flow, added up.`,
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
      summary: `${label} just before ${when}. The ${unit} balance before the event's transaction ran; the balance after it less the transaction's legs.`,
      formula: "balance after − Σ legs of the transaction",
    };
  if (part === "event")
    return {
      kind: "chain-derived",
      summary: `${label} at ${when}. The ${usd ? "USD of the" : unit} legs of this kind the event moved, added up${usd ? ", each at the oracle price at its block" : ""}.`,
      formula: usd ? "Σ amount × price at block" : "Σ legs",
    };
  return {
    kind: "chain-derived",
    summary: `${label} up to ${when}. Every amount of this kind the position's events record before this one, added up${usd ? ", each at the oracle price at its block" : ` in ${unit}`}. The rows are rounded together, so they add to the total.`,
    formula: usd ? "Σ amount × price at block" : "Σ amount",
  };
}

/** A stablecoin debt's dollars at its $1 face, as the event card's Debt
 *  cell and its ledger count it: the debt before or after the event's
 *  transaction, one dollar a token. */
export function faceUsdProv(symbol: string, amount: string, which: "before" | "after"): Provenance {
  return {
    kind: "derived",
    summary: `Debt ${which} this event in USD. The ${symbol} owed ${which} the transaction at its $1 face, as the Lifetime flows count it.`,
    formula: "debt × $1",
    inputs: [
      { label: "debt", value: `${amount} ${symbol}`, kind: "chain", note: which },
      { label: "face", value: "$1", kind: "derived", definition: true, note: `${symbol} redeems at $1` },
    ],
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
        summary: `${label} in ${symbol} at ${when}, in USD. The ${symbol} interest (its balance at the block less every flow in it) at the oracle price at the block, or at its latest flow's price where it is no longer held.`,
        formula: "(balance − Σ flows) × price",
      }
    : {
        kind: "chain-derived",
        summary: `${label} on ${symbol} at ${when}. The remainder; the ${symbol} balance at the oracle price at the block less every ${symbol} row above it. It is the change in ${symbol}'s price since its flows; no funds moved.`,
        formula: "balance × price − Σ rows",
      };
}
