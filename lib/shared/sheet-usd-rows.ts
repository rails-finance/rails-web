// The dollar cells of a lending family's event sheet (ui-jobs 743): each
// figure is its rows' cents, shown to the dollar. An amount at a market's
// price is one shown product (lib/shared/holder-usd-receipt.ts); a side's
// total, or its interest since the last event, the sum of its markets'
// products, each price named with its block; Market move the difference of
// those sums. A market with no price draws "—" and names the asset, with no
// partial sum. Used by the cToken family's sheets (Compound V2, Moonwell,
// Dolomite), the Comet sheet and the Aave family's.

import type { Provenance } from "@/components/shared/provenance";
import { FACE_WORDS, holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { centsOf, shownUsd } from "@/lib/shared/shown-usd";
import { listWords, NO_FIGURE, noPriceWords } from "@/lib/shared/flows-sum";
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
  /** A $1 face the protocol defines (crvUSD), not a read. */
  face?: boolean;
}

/** A dollar cell: its text, its receipt, and its cents (null: no figure). */
export interface UsdCell {
  text: string;
  info: Provenance;
  usd: number | null;
}

const signedCents = (v: number): string => `${v < 0 ? "−" : ""}${formatUsdValue(Math.abs(v))}`;

/** A cell as a sheet row's dollar figure, carrying its cents. */
export const cellOf = (c: UsdCell): { text: string; info: Provenance; cents?: number } => ({
  text: c.text,
  info: c.info,
  ...(c.usd != null ? { cents: c.usd } : {}),
});

/** A $1-face amount's face and cents (BOLD, LUSD, DAI, fxUSD at $1): the
 *  amount to six decimals at $1, to the cent. The cell keeps its receipt. */
export const faceParts = (amount: number, signed = false): { text: string; cents: number } => {
  const cents = shownUsd(amount, 1);
  return { text: sheetUsd(cents, signed), cents };
};

/** A figure already in its rows' cents: its face and its cents. */
export const centsParts = (cents: number, signed = false): { text: string; cents: number } => ({
  text: sheetUsd(cents, signed),
  cents,
});

/** One amount at a price named with its block, as a sheet cell. */
export const priceCell = (
  what: string,
  a: PricedAmount,
  o: { amountNote: string; via: string; signed?: boolean },
): { text: string; info: Provenance; cents?: number } => cellOf(amountsUsd(what, [a], o));

/** A cell with no figure: "—", naming the assets with no price. */
export const noFigureCell = (what: string, symbols: string[]): UsdCell => ({
  text: NO_FIGURE,
  info: { kind: "derived", summary: `${what}. No dollar figure: ${noPriceWords([...new Set(symbols)])}.` },
  usd: null,
});

/** The amounts at their prices, summed: one row per market, the figure the
 *  sum of the shown products. No figure where a market has no price. */
export function amountsUsd(
  what: string,
  xs: readonly PricedAmount[],
  o: { amountNote: string; via: string; signed?: boolean },
): UsdCell {
  // An amount not read is no figure, never "Nothing held".
  const unread = xs.filter((x) => !Number.isFinite(x.amount)).map((x) => x.symbol);
  if (unread.length)
    return {
      text: NO_FIGURE,
      info: {
        kind: "derived",
        summary: `${what}. No dollar figure: ${listWords([...new Set(unread)])} ${unread.length > 1 ? "have" : "has"} no amount read.`,
      },
      usd: null,
    };
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
      ...(x.face ? { face: true } : {}),
    })),
    blocksPerRow: true,
    byValue: live.length > 1,
    via: o.via,
    caveat: FACE_WORDS,
    shownAs: (u) => (o.signed ? sheetUsd(mixed ? u : sign * u, true) : sheetUsd(mixed ? u : sign * u)),
  });
  const v = mixed ? usd : sign * usd;
  return { text: o.signed ? sheetUsd(v, true) : sheetUsd(v), info: prov, usd: v };
}

/** A figure as one total less others, each a sum of shown products, to the
 *  cent; no figure where any of them has none. */
function differenceUsd(
  what: string,
  summary: string,
  formula: string,
  from: { label: string; cell: UsdCell },
  less: { label: string; cell: UsdCell }[],
): UsdCell {
  const parts = [from, ...less];
  if (parts.some((p) => p.cell.usd == null))
    return {
      text: NO_FIGURE,
      info: { kind: "derived", summary: `${what}. No dollar figure: a total beside it has none.` },
      usd: null,
    };
  const v = centsOf(less.reduce((a, p) => a - (p.cell.usd as number), from.cell.usd as number));
  return {
    text: sheetUsd(v, true),
    usd: v,
    info: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${what}. ${summary} No token moved.`,
      formula,
      inputs: [
        ...parts.map((p) => ({
          label: p.label,
          value: signedCents(p.cell.usd as number),
          kind: "chain-derived" as const,
          pclass: "oracle" as const,
        })),
        {
          label: "difference",
          value: signedCents(v),
          kind: "derived",
          step: true,
          note: `to the cent, shown as ${sheetUsd(v, true)}`,
        },
      ],
    },
  };
}

/** Market move: the side's total before this transaction less its total at
 *  the last event and the interest since, each a sum of shown products; no
 *  figure where any of them has none. */
export function marketMoveUsd(what: string, before: UsdCell, last: UsdCell, interest: UsdCell | null): UsdCell {
  return differenceUsd(
    what,
    `The total before this transaction less the total at the last event${interest ? " and the interest since" : ""}, each the sum of its markets' amounts times their prices as shown: the change the prices made to the balances held between the two.`,
    interest ? "before − last event − interest" : "before − last event",
    { label: "before this event", cell: before },
    [{ label: "at the last event", cell: last }, ...(interest ? [{ label: "interest since", cell: interest }] : [])],
  );
}

/** Market move across a group of events: the side after the last less the
 *  side before the first, the moves and the interest, each a sum of shown
 *  products. */
export function groupMoveUsd(after: UsdCell, before: UsdCell, moved: UsdCell, interest: UsdCell | null): UsdCell {
  return differenceUsd(
    "Market move across these events",
    "The side after the last event less the side before the first, the moves and the interest, each the sum of its assets' amounts times the prices their rows carry, as shown: what the prices changed.",
    interest ? "after − before − moves − interest" : "after − before − moves",
    { label: "after these events", cell: after },
    [
      { label: "before the group", cell: before },
      { label: "the moves", cell: moved },
      ...(interest ? [{ label: "interest", cell: interest }] : []),
    ],
  );
}
