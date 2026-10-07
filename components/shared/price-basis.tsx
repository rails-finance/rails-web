"use client";

// Then / today on the event card (rails-ops standards/detail-page-anatomy.md,
// "USD values on the timeline"; anatomy T2; ui-jobs 283). T2's price chip is a
// control, "$4,490 then · $2,713 today": the event's prices by default, and
// pressed to today the card's USD figures (its cells, the opened ledger's USD
// column, the closed cell's tooltip) stand at the latest block's price. The
// choice is the card's, held in its state and never stored.
//
// Today's prices are the page's Prices chip (components/shared/latest-prices.tsx):
// DetailTopRow publishes the assets it hands that chip, by symbol, and the
// cards read them here, so the two never disagree.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON } from "@/lib/shared/ui-grammar";

export type PriceBasis = "event" | "today";

type TodayPrices = Record<string, number>;

const TodayPricesContext = createContext<{ prices: TodayPrices; set: (p: TodayPrices) => void } | null>(null);

const sameRecord = (a: TodayPrices, b: TodayPrices) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Holds the page's prices at the latest block, by lower-cased symbol. */
export function TodayPricesProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<TodayPrices>({});
  const set = useCallback((p: TodayPrices) => setPrices((prev) => (sameRecord(prev, p) ? prev : p)), []);
  const value = useMemo(() => ({ prices, set }), [prices, set]);
  return <TodayPricesContext.Provider value={value}>{children}</TodayPricesContext.Provider>;
}

/** DetailTopRow's half: the assets its Prices chip states. An asset quoted in
 *  another unit (`unit`) or with no price is left out. */
export function usePublishTodayPrices(assets: { symbol: string; price?: number; unit?: string }[]) {
  const set = useContext(TodayPricesContext)?.set;
  const key = assets
    .filter((a) => !a.unit && typeof a.price === "number" && a.price > 0)
    .map((a) => `${a.symbol.toLowerCase()}=${a.price}`)
    .join("|");
  useEffect(() => {
    if (!set) return;
    const record: TodayPrices = {};
    for (const part of key ? key.split("|") : []) {
      const at = part.lastIndexOf("=");
      record[part.slice(0, at)] = Number(part.slice(at + 1));
    }
    set(record);
    return () => set({});
  }, [key, set]);
}

/** A symbol's price at the latest block, where the page states one. */
export function useTodayPrice(symbol: string | null | undefined): number | null {
  const prices = useContext(TodayPricesContext)?.prices;
  if (!symbol || !prices) return null;
  return prices[symbol.toLowerCase()] ?? null;
}

const BasisContext = createContext<{ basis: PriceBasis; setBasis: (b: PriceBasis) => void } | null>(null);

/** One card's choice, the event's prices to start. */
export function PriceBasisProvider({ children }: { children: ReactNode }) {
  const [basis, setBasis] = useState<PriceBasis>("event");
  const value = useMemo(() => ({ basis, setBasis }), [basis]);
  return <BasisContext.Provider value={value}>{children}</BasisContext.Provider>;
}

export function usePriceBasis(): PriceBasis {
  return useContext(BasisContext)?.basis ?? "event";
}

/** The price a symbol's USD figures stand at on this card when it is set to
 *  today; null at the event's prices or where the page has no price today. */
export function useTodayBasisPrice(symbol: string | null | undefined): number | null {
  const basis = usePriceBasis();
  const p = useTodayPrice(symbol);
  return basis === "today" && p != null ? p : null;
}

/** The same for any symbol, where a component reads several. */
export function useTodayBasisPrices(): (symbol: string | null | undefined) => number | null {
  const basis = usePriceBasis();
  const prices = useContext(TodayPricesContext)?.prices;
  return (symbol) => (basis === "today" && symbol && prices ? (prices[symbol.toLowerCase()] ?? null) : null);
}

/** The words for a figure at today's price, in a sentence. */
export const TODAY_PRICE_WORDS = "at the latest block’s price";

/** A figure valued at the latest block's price, for its receipt. */
export function todayUsdProv(what: string, symbol: string): Provenance {
  return {
    kind: "chain-derived",
    summary: `${what} ${TODAY_PRICE_WORDS} — the amount at the event times ${symbol}'s oracle price at the latest block, which the page's Prices chip states.`,
    formula: "amount × price at the latest block",
  };
}

/** T2's price chip as a control: "$4,490 then · $2,713 today". `then` is the
 *  chip's figure as the card drew it before (its receipt with it); without a
 *  card to switch or a price today it stays that figure alone. */
export function ThenTodayChip({
  symbol,
  then,
  format,
  noToday,
}: {
  symbol: string;
  then: ReactNode;
  format: (n: number) => string;
  /** The chip's figure is in another unit than the page's Prices chip. */
  noToday?: boolean;
}) {
  const ctx = useContext(BasisContext);
  const today = useTodayPrice(symbol);
  if (!ctx || today == null || noToday) return <>{then}</>;
  const side = (b: PriceBasis, figure: ReactNode, word: string) => (
    <button
      type="button"
      aria-pressed={ctx.basis === b}
      onClick={(e) => {
        e.stopPropagation();
        ctx.setBasis(b);
      }}
      className={`${CTRL_GHOST} min-h-6 gap-1 rounded-sm px-1.5 py-0.5 focus-ring ${ctx.basis === b ? CTRL_ON : CTRL_OFF}`}
      data-price-basis={b}
    >
      {figure}
      <span className="font-normal">{word}</span>
    </button>
  );
  return (
    <span
      role="group"
      aria-label={`${symbol} price: the event's or the latest block's`}
      className="inline-flex items-center gap-0.5"
      data-then-today=""
    >
      {side("event", then, "then")}
      <span aria-hidden className="text-rb-400">
        ·
      </span>
      {side(
        "today",
        <Prov
          info={{
            kind: "chain-derived",
            summary: `${symbol} price today — the oracle's price at the latest block, which the page's Prices chip states.`,
          }}
        >
          {format(today)}
        </Prov>,
        "today",
      )}
    </span>
  );
}
