"use client";

// Then / today on the event card (rails-ops standards/detail-page-anatomy.md,
// "USD values on the timeline"; anatomy T2; ui-jobs 283, 309, 761). T2's price
// chips stand at the event's prices by default; a press on the clock icon
// before them (PriceBasisPress) moves the chips and the card's USD figures
// (its cells, the opened ledger's USD column, the closed cell's tooltip) to
// the latest block's price. The
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
    summary: `${what} ${TODAY_PRICE_WORDS}. The amount at the event times ${symbol}'s oracle price at the latest block, which the page's Prices chip states.`,
    formula: "amount × price at the latest block",
  };
}

/** A chip's flip, as `PriceBasisPress` takes it: the symbol, and whether its
 *  figure is in another unit than the page's Prices chip. */
export interface Flippable {
  symbol: string;
  noToday?: boolean;
}

/** Whether any of a row's chips can stand at the latest block's price. */
function useAnyFlips(chips: Flippable[]): boolean {
  const prices = useContext(TodayPricesContext)?.prices;
  const ctx = useContext(BasisContext);
  return !!ctx && !!prices && chips.some((c) => !c.noToday && prices[c.symbol.toLowerCase()] != null);
}

const CLOCK_PATHS = {
  // Lucide rotate-ccw-clock and clock-check, which lucide-react 0.541 does
  // not export.
  event: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  today: ["M21.95 13a10 10 0 1 0-8.685 8.92", "M12 6v6l4 2", "m16 19 2 2 4-4"],
} satisfies Record<PriceBasis, string[]>;

function ClockIcon({ basis, size }: { basis: PriceBasis; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
      data-clock={basis}
    >
      {CLOCK_PATHS[basis].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The row's then/today press: one clock icon before its price chips (Miles,
 *  19 Nov 2026; ui-jobs 761). Rotate-ccw-clock at the event's prices, the
 *  default; clock-check at the latest block's. A press flips every chip on
 *  the card; none is drawn where no chip can flip. */
export function PriceBasisPress({ chips }: { chips: Flippable[] }) {
  const ctx = useContext(BasisContext);
  const flips = useAnyFlips(chips);
  if (!ctx || !flips) return null;
  const isToday = ctx.basis === "today";
  const label = isToday
    ? "Prices at the latest block. Press for the prices at this event."
    : "Prices at this event. Press for the prices at the latest block.";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isToday}
      onClick={(e) => {
        e.stopPropagation();
        ctx.setBasis(isToday ? "event" : "today");
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`${CTRL_GHOST} size-6 shrink-0 rounded-sm focus-ring ${isToday ? CTRL_ON : CTRL_OFF}`}
      data-price-basis-press=""
      data-price-basis={ctx.basis}
    >
      <ClockIcon basis={ctx.basis} size={16} />
    </button>
  );
}

/** T2's price chip: the event's figure by default (`then`, its receipt with
 *  it), and the latest block's price, in the pressed styling, while the
 *  card's PriceBasisPress stands at today (ui-jobs 309, 761). Without a card
 *  to switch or a price today it stays the event's figure. */
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
  const isToday = ctx.basis === "today";
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded-sm${isToday ? ` px-1.5 py-0.5 ${CTRL_ON}` : ""}`}
      data-then-today=""
      data-price-basis={ctx.basis}
    >
      {isToday ? (
        <Prov
          info={{
            kind: "chain-derived",
            summary: `${symbol} price today. The oracle's price at the latest block, which the page's Prices chip states.`,
          }}
        >
          {format(today)}
        </Prov>
      ) : (
        then
      )}
    </span>
  );
}
