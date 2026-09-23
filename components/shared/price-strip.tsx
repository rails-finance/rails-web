"use client";

// Fixed bottom strip showing current USD prices for the assets relevant to the
// position in view. Liquity troves carry two (collateral + BOLD); Aave spokes
// carry one row per supplied/borrowed reserve, so the strip scrolls
// horizontally when an asset-heavy spoke overflows.
//
// The strip is `fixed` to the viewport, so when scrolled to the bottom it
// overlays the AppFooter. A tiny context lets the footer learn a strip is
// mounted (counter, not boolean — survives StrictMode's double-invoke and
// multiple strips) and pad its bottom so its content clears the strip. The
// API context exposes only a stable setter so the strip's register effect
// never re-fires on active-state changes; the footer reads the boolean from a
// separate context.
//
// A coins-icon toggle collapses the strip to just that button, driven by
// `priceStripMinimized` in the global preferences store rather than local
// state — the strip remounts fresh on every call site, so only a persisted
// preference survives navigation. The mount-registration effect above still
// fires whether minimized or not, so the footer keeps padding for the full
// strip's height either way. Minimized, the price chips and crosshair tool
// are left out of the render entirely, not just visually hidden.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Coins } from "lucide-react";
import { PricePill } from "@/components/shared/price-pill";
import { usePreferences } from "@/lib/shared/preferences-context";

const PriceStripApiContext = createContext<((active: boolean) => void) | null>(null);
const PriceStripActiveContext = createContext<boolean>(false);

export function PriceStripProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const setActive = useCallback((active: boolean) => {
    setCount((c) => Math.max(0, c + (active ? 1 : -1)));
  }, []);
  return (
    <PriceStripApiContext.Provider value={setActive}>
      <PriceStripActiveContext.Provider value={count > 0}>{children}</PriceStripActiveContext.Provider>
    </PriceStripApiContext.Provider>
  );
}

/** True while a PriceStrip is mounted — the footer uses this to pad clear. */
export function usePriceStripActive(): boolean {
  return useContext(PriceStripActiveContext);
}

export interface PriceStripAsset {
  symbol: string;
  address?: string;
  price: number;
  /** Quote `price` in this asset instead of USD (e.g. "ETH") — see PricePill.
   *  A position can carry the same symbol twice, once per unit (a native rate
   *  beside its USD conversion), so pair a `unit` with a `label` to keep both
   *  the React key and the tooltip distinct. */
  unit?: string;
  /** Tooltip override for when `symbol` alone would not say which reading
   *  this is (e.g. two pills for the same token, one per unit). Defaults to
   *  `symbol`. */
  label?: string;
}

export function PriceStrip({
  assets,
  leading,
}: {
  assets: PriceStripAsset[];
  /** Tool slot ahead of the price pills — the strip doubles as the page's
   *  floating instruments dock (the provenance inspector's toggle rides
   *  here). A strip with a tool but no priced assets still renders. */
  leading?: React.ReactNode;
}) {
  const setActive = useContext(PriceStripApiContext);
  const present = assets.length > 0 || leading != null;
  const { prefs, update } = usePreferences();
  const minimized = prefs.priceStripMinimized;

  useEffect(() => {
    if (!setActive || !present) return;
    setActive(true);
    return () => setActive(false);
  }, [setActive, present]);

  if (!present) return null;

  // Same control in both states, so it's always the way back out of the
  // minimized state. Minimized shows the coins icon (what's hiding behind
  // it); open shows a chevron pointing right — the direction the strip
  // collapses to — and flips to point left on hover, previewing the reopen.
  const toggle = (
    <button
      type="button"
      onClick={() => update({ priceStripMinimized: !minimized })}
      aria-label={minimized ? "Show prices" : "Minimize prices"}
      title={minimized ? "Show prices" : "Minimize prices"}
      className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-rb-500 hover:text-foreground hover:bg-sunken transition-colors"
    >
      {minimized ? (
        <Coins className="h-4 w-4" aria-hidden />
      ) : (
        <>
          <ChevronRight className="h-4 w-4 group-hover:hidden" aria-hidden />
          <ChevronLeft className="hidden h-4 w-4 group-hover:block" aria-hidden />
        </>
      )}
    </button>
  );

  return (
    // Compact, right-aligned cluster — hugs its content rather than spanning
    // the viewport. Caps at the viewport width and scrolls for asset-heavy
    // spokes. Each pill drops its symbol label; the tooltip names the asset.
    <div className="fixed bottom-3 right-3 md:right-4 z-30 max-w-[calc(100vw-1.5rem)] overflow-x-auto rounded-lg bg-white dark:bg-rb-900 shadow-lg">
      {minimized ? (
        <div className="flex items-center p-1.5">{toggle}</div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-2">
          {toggle}
          {leading}
          {leading != null && assets.length > 0 && (
            <span className="h-4 w-px shrink-0 bg-rb-300 dark:bg-rb-700" aria-hidden />
          )}
          {assets.map((a) => (
            <PricePill
              key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol}
              symbol={a.symbol}
              address={a.address}
              price={a.price}
              unit={a.unit}
              filterable={false}
              title={a.label ?? a.symbol}
              bare
            />
          ))}
        </div>
      )}
    </div>
  );
}
