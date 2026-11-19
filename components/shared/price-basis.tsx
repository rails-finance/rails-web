"use client";

// Then / today on the event card (rails-ops standards/detail-page-anatomy.md,
// "USD values on the timeline"; anatomy T2; ui-jobs 283, 309, 761). T2's
// price chips stand at the event's prices by default; a press on them or the
// clock before them (PriceBasisGroup) moves the chips and the card's USD
// figures (its cells, the opened ledger's USD column, the closed cell's
// tooltip) to the latest block's price. The choice is the card's, held in
// its state and never stored.
//
// Today's prices are the assets DetailTopRow hands the page's Prices chip
// (components/shared/latest-prices.tsx), published by symbol with each one's
// receipt; the cards read them here, so the two never disagree.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  anyFlips,
  clockClass,
  pressState,
  todayChipProv,
  todayChipTitle,
  type Flippable,
  type PriceBasis,
} from "@/lib/shared/price-basis-words";
import { CTRL_GHOST } from "@/lib/shared/ui-grammar";

export { todayChipTitle, type Flippable, type PriceBasis };

/** The latest block's prices in the live green (the price chart's figure at
 *  today, F19.2), on each chip the press flipped. */
const TODAY_TONE = "text-green-600 dark:text-green-400";

/** A price at the latest block and the receipt of the read behind it. */
interface TodayPrice {
  price: number;
  info?: Provenance;
}

type TodayPrices = Record<string, TodayPrice>;

const TodayPricesContext = createContext<{ prices: TodayPrices; set: (p: TodayPrices) => void } | null>(null);

const sameRecord = (a: TodayPrices, b: TodayPrices) => {
  const ka = Object.keys(a);
  return (
    ka.length === Object.keys(b).length && ka.every((k) => a[k]?.price === b[k]?.price && a[k]?.info === b[k]?.info)
  );
};

/** Holds the page's prices at the latest block, by lower-cased symbol. */
export function TodayPricesProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<TodayPrices>({});
  const set = useCallback((p: TodayPrices) => setPrices((prev) => (sameRecord(prev, p) ? prev : p)), []);
  const value = useMemo(() => ({ prices, set }), [prices, set]);
  return <TodayPricesContext.Provider value={value}>{children}</TodayPricesContext.Provider>;
}

/** DetailTopRow's half: the assets its Prices chip states, each with its
 *  receipt. An asset quoted in another unit (`unit`) or with no price is left
 *  out. */
export function usePublishTodayPrices(assets: { symbol: string; price?: number; unit?: string; info?: Provenance }[]) {
  const set = useContext(TodayPricesContext)?.set;
  const priced = assets.filter((a) => !a.unit && typeof a.price === "number" && a.price > 0);
  // The receipts change with their reads, which change the prices or the
  // summaries the key carries.
  const key = priced.map((a) => `${a.symbol.toLowerCase()}=${a.price}=${a.info?.summary ?? ""}`).join("|");
  const latest = useRef(priced);
  latest.current = priced;
  useEffect(() => {
    if (!set) return;
    const record: TodayPrices = {};
    for (const a of latest.current) record[a.symbol.toLowerCase()] = { price: a.price!, info: a.info };
    set(record);
    return () => set({});
  }, [key, set]);
}

/** A symbol's price at the latest block, where the page states one. */
export function useTodayPrice(symbol: string | null | undefined): number | null {
  const prices = useContext(TodayPricesContext)?.prices;
  if (!symbol || !prices) return null;
  return prices[symbol.toLowerCase()]?.price ?? null;
}

/** The same with the read's receipt. */
function useTodayPriceRead(symbol: string): TodayPrice | null {
  return useContext(TodayPricesContext)?.prices[symbol.toLowerCase()] ?? null;
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
  return (symbol) => (basis === "today" && symbol && prices ? (prices[symbol.toLowerCase()]?.price ?? null) : null);
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

function useAnyFlips(chips: Flippable[]): boolean {
  const prices = useContext(TodayPricesContext)?.prices;
  return !!useContext(BasisContext) && anyFlips(chips, prices);
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

/** The row's then/today press (Miles, 19 Nov 2026; ui-jobs 761): the group
 *  of the clock and the price chips. A click anywhere on it flips every chip
 *  on the card. The clock is rotate-ccw-clock at the event's prices, shown on
 *  the group's hover, on keyboard focus and always on a device without
 *  hover; clock-check at the latest block's, always shown, the chips in the
 *  live green.
 *  It is the one focusable control, carrying the name and pressed state: a
 *  receipt pick, while the inspector is armed, is a button of its own and
 *  takes its click first. Where no chip can flip the group is plain. A card
 *  draws one: where its price row carries the chips, the forensics footnote
 *  states none. */
export function PriceBasisGroup({
  chips,
  className,
  children,
}: {
  chips: Flippable[];
  className?: string;
  children: ReactNode;
}) {
  const ctx = useContext(BasisContext);
  const flips = useAnyFlips(chips);
  if (!ctx || !flips) return <div className={className}>{children}</div>;
  const { label, pressed } = pressState(ctx.basis);
  const flip = (e: MouseEvent) => {
    e.stopPropagation();
    ctx.setBasis(ctx.basis === "today" ? "event" : "today");
  };
  return (
    <div
      className={`${className ?? ""} group/price cursor-pointer`}
      title={label}
      onClick={flip}
      data-price-basis-group=""
      data-price-basis={ctx.basis}
    >
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={pressed}
        onClick={flip}
        onKeyDown={(e) => e.stopPropagation()}
        className={`${CTRL_GHOST} -mr-1 size-6 shrink-0 rounded-sm focus-ring ${clockClass(ctx.basis)}`}
        data-price-basis-press=""
        data-price-basis={ctx.basis}
      >
        <ClockIcon basis={ctx.basis} size={16} />
      </button>
      {children}
    </div>
  );
}

/** T2's price chip: the event's figure by default (`then`, its receipt with
 *  it), and the latest block's price, in the live green, while the card's
 *  PriceBasisGroup stands at today (ui-jobs 309, 761). Without a card to
 *  switch or a price today it stays the event's figure. */
export function ThenTodayChip({
  symbol,
  then,
  format,
  noToday,
  icon,
}: {
  symbol: string;
  then: ReactNode;
  format: (n: number) => string;
  /** The chip's figure is in another unit than the page's Prices chip. */
  noToday?: boolean;
  /** The asset's icon after the figure, where `then` draws it there: the
   *  today side draws it in the same place. */
  icon?: ReactNode;
}) {
  const ctx = useContext(BasisContext);
  const today = useTodayPriceRead(symbol);
  if (!ctx || today == null || noToday) return <>{then}</>;
  const isToday = ctx.basis === "today";
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1${isToday ? ` ${TODAY_TONE}` : ""}`}
      title={isToday ? todayChipTitle(symbol) : undefined}
      data-then-today=""
      data-price-basis={ctx.basis}
    >
      {isToday ? (
        <>
          <Prov info={todayChipProv(symbol, today.info)} icon={icon}>
            {format(today.price)}
          </Prov>
          <span className="sr-only">, at the latest block</span>
        </>
      ) : (
        then
      )}
    </span>
  );
}
