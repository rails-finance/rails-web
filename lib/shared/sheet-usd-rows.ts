// The dollar cells of a lending family's event sheet (ui-jobs 743): each
// figure is its rows' cents, shown to the dollar. An amount at a market's
// price is one shown product (lib/shared/holder-usd-receipt.ts); a side's
// total, or its interest since the last event, the sum of its markets'
// products, each price named with its block; Market move the difference of
// those sums. A market with no price draws "—" and names the asset, with no
// partial sum. Used by the cToken family's sheets (Compound V2, Moonwell,
// Dolomite), the Comet sheet and the Aave family's.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { centsOf } from "@/lib/shared/shown-usd";
import { NO_FIGURE, noPriceWords } from "@/lib/shared/flows-sum";
import { formatUsdValue } from "@/lib/utils/format";

/** Dollars as the sheet prints them: cents under $10, whole dollars above;
 *  `signed` puts "+" on a gain (a loss always reads "−"). */
export function sheetUsd(v: number, signed = false): string {
  const a = Math.abs(v);
  const body =
    a < 10
      ? a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : a.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const zero = !/[1-9]/.test(body);
  return `${zero ? "" : v < 0 ? "−" : signed ? "+" : ""}$${body}`;
}

/** A market's amount and the price the sheet values it at. */
export interface PricedAmount {
  symbol: string;
  /** Signed: a change, or interest, may be negative. */
  amount: number;
  /** USD per token; null where no price stands. */
  price: number | null;
  block?: number | null;
  priceNote?: string;
}

/** A dollar cell: its text, its receipt, and its cents (null: no figure). */
export interface UsdCell {
  text: string;
  info: Provenance;
  usd: number | null;
}

const FACE = "To the cent, shown to the dollar.";
const signedCents = (v: number): string => `${v < 0 ? "−" : ""}${formatUsdValue(Math.abs(v))}`;

/** A cell with no figure: "—", naming the assets with no price. */
export const noFigureCell = (what: string, symbols: string[]): UsdCell => ({
  text: NO_FIGURE,
  info: { kind: "derived", summary: `${what}. No figure: ${noPriceWords([...new Set(symbols)])}.` },
  usd: null,
});

/** The amounts at their prices, summed: one row per market, the figure the
 *  sum of the shown products. No figure where a market has no price. */
export function amountsUsd(
  what: string,
  xs: readonly PricedAmount[],
  o: { amountNote: string; via: string; signed?: boolean },
): UsdCell {
  const live = xs.filter((x) => Math.abs(x.amount) > 1e-12);
  const unpriced = live.filter((x) => x.price == null || !(x.price > 0)).map((x) => x.symbol);
  if (unpriced.length) return noFigureCell(what, unpriced);
  if (live.length === 0) return { text: "$0", info: { kind: "derived", summary: `${what}. Nothing held.` }, usd: 0 };
  // One sign across the legs: the receipt states magnitudes, the cell the sign.
  const sign = live.every((x) => x.amount <= 0) ? -1 : 1;
  const mixed = live.some((x) => Math.sign(x.amount) !== sign && x.amount !== 0);
  const { prov, usd } = holderUsdReceipt({
    what,
    legs: live.map((x) => ({
      token: x.symbol,
      amount: mixed ? x.amount : Math.abs(x.amount),
      amountNote: o.amountNote,
      price: x.price as number,
      priceNote:
        x.priceNote ?? (x.block != null ? `the price at block ${x.block.toLocaleString("en-US")}` : "the price"),
    })),
    blocksPerRow: true,
    byValue: live.length > 1,
    via: o.via,
    caveat: FACE,
  });
  const v = mixed ? usd : sign * usd;
  return { text: o.signed ? sheetUsd(v, true) : sheetUsd(v), info: prov, usd: v };
}

/** Market move: the side's total before this transaction less its total at
 *  the last event and the interest since, each a sum of shown products; no
 *  figure where any of them has none. */
export function marketMoveUsd(what: string, before: UsdCell, last: UsdCell, interest: UsdCell | null): UsdCell {
  const parts = [before, last, ...(interest ? [interest] : [])];
  if (parts.some((p) => p.usd == null))
    return {
      text: NO_FIGURE,
      info: { kind: "derived", summary: `${what}. No figure: a total beside it has none.` },
      usd: null,
    };
  const v = centsOf((before.usd as number) - (last.usd as number) - (interest?.usd ?? 0));
  return {
    text: sheetUsd(v, true),
    usd: v,
    info: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${what}. The total before this transaction less the total at the last event${interest ? " and the interest since" : ""}, each the sum of its markets' amounts times their prices as shown: the change the prices made to the balances held between the two. No token moved. ${FACE}`,
      formula: interest ? "before − last event − interest" : "before − last event",
      inputs: [
        {
          label: "before this event",
          value: signedCents(before.usd as number),
          kind: "chain-derived",
          pclass: "oracle",
        },
        { label: "at the last event", value: signedCents(last.usd as number), kind: "chain-derived", pclass: "oracle" },
        ...(interest
          ? [
              {
                label: "interest since",
                value: signedCents(interest.usd as number),
                kind: "chain-derived" as const,
                pclass: "oracle" as const,
              },
            ]
          : []),
        { label: "difference", value: signedCents(v), kind: "derived", step: true },
      ],
    },
  };
}
