"use client";

// The position's assets at their current prices, in a dropdown.
// ----------------------------------------------------------------------------
// This is the price half of the detail pages' "latest" row (DetailTopRow). It
// replaces the fixed bottom dock (components/shared/price-strip.tsx) on the
// position and detail views: a six-reserve Aave spoke used to lay six chips
// along the bottom of the viewport and scroll sideways on a phone, so the
// prices now sit behind one trigger that states the first asset and how many
// more there are, and the list opens over the page.
//
// A view whose assets are not wired yet still renders the trigger and says so
// when it opens — the row is the same shape on every position, and an absent
// price list is a fact about that protocol, not a missing control.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { fmtNative, fmtPrice, PricePill } from "@/components/shared/price-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";

export function LatestPrices({ assets }: { assets: PriceStripAsset[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — the same behaviour as the Tools menu
  // beside it and the listing's sort control.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const first = assets[0];
  const more = assets.length - 1;

  return (
    <div ref={ref} className="relative" data-latest-prices>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          assets.length === 0
            ? "Prices for this position"
            : `Prices for this position: ${assets.length} ${assets.length === 1 ? "asset" : "assets"}`
        }
        className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} h-7 gap-1.5 rounded-md px-2 text-xs`}
      >
        {first ? (
          <>
            <TokenChipIcon symbol={first.symbol} address={first.address} size={14} filterable={false} />
            {/* Below sm the row carries back, block, prices and Tools across
                390px, so the summary keeps the icon and the count and leaves
                the figure to the open list. */}
            <span className="hidden font-bold tabular-nums text-green-400 sm:inline">
              {first.unit ? fmtNative(first.price, first.unit) : fmtPrice(first.price)}
            </span>
            {more > 0 && <span className="tabular-nums text-rb-500">+{more}</span>}
          </>
        ) : (
          <>
            <Coins className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Prices</span>
          </>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="overlay-panel absolute left-0 top-full z-50 mt-2 min-w-[200px] py-1" role="menu">
          <div className="px-4 py-2">
            <span className={`${OVERLAY_HEADING} text-rb-500`}>Prices</span>
          </div>
          <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
          {assets.length === 0 ? (
            <p className="px-4 pb-2 pt-1 text-xs leading-relaxed text-rb-500">
              This explorer does not price the position&rsquo;s assets yet.
            </p>
          ) : (
            <ul className="pb-1">
              {assets.map((a) => (
                <li key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol} className="px-2">
                  <PricePill
                    symbol={a.symbol}
                    address={a.address}
                    price={a.price}
                    unit={a.unit}
                    filterable={false}
                    title={a.label ?? a.symbol}
                    showSymbol
                    bare
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
