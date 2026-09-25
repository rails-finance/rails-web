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
//
// EVERY POSITION LISTS WHAT IT HOLDS, PRICED OR NOT (ui-jobs 56). Several
// protocols run no USD feed of their own — Morpho and Fluid quote in the
// market's loan token, Frankencoin and PWN state no price at all, Maple's
// USDC "oracle" is a governance $1 pin — and Rails renders no number the
// protocol does not state. So an asset may arrive with no `price`: the row
// still names it, and `reason` carries that protocol's own recorded sentence
// (lib/shared/oracle-usd-reasons.ts, the same string the coverage matrix's
// `oracleUsd: { why }` cell shows) in place of the generic "not yet".

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { fmtNative, fmtPrice, PricePill } from "@/components/shared/price-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";

/** A dropdown row. `price` absent means the protocol states none for this
 *  asset: the row names what is held and `reason` says why no figure follows
 *  it. A `PriceStripAsset` (the bottom dock's shape, always priced) is
 *  assignable here, so the priced views pass through unchanged. */
export type LatestPriceAsset = Omit<PriceStripAsset, "price"> & { price?: number };

export function LatestPrices({ assets, reason }: { assets: LatestPriceAsset[]; reason?: string }) {
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
  const priced = (a: LatestPriceAsset) => typeof a.price === "number" && a.price > 0;
  // The reason answers "why is there no dollar figure here", so it belongs
  // under any list that is not wholly USD — a row with no price at all, and a
  // row quoted in the protocol's own unit alike — and in place of the generic
  // sentence when there is no list.
  const showReason = reason != null && !assets.every((a) => priced(a) && !a.unit);

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
            : `${assets.some(priced) ? "Prices for" : "Assets in"} this position: ${assets.length} ${assets.length === 1 ? "asset" : "assets"}`
        }
        className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} h-7 gap-1.5 rounded-md px-2 text-xs`}
      >
        {first ? (
          <>
            <TokenChipIcon symbol={first.symbol} address={first.address} size={14} filterable={false} />
            {/* The figure shows at every width (ui-jobs 59). It used to be
                withheld below sm because the row carried back, the block
                number, prices and Tools across 390px; the recency stamp beside
                this one now shows the age alone, and the nine characters the
                block number gave up are what this figure fits in. An asset on
                show with no price next to it was the odd half of the row. */}
            {/* An unpriced first asset puts its symbol where the figure would
                be, so the trigger still names what the position holds. */}
            <span className={`tabular-nums ${priced(first) ? "font-bold text-green-400" : "font-medium text-rb-500"}`}>
              {priced(first)
                ? first.unit
                  ? fmtNative(first.price as number, first.unit)
                  : fmtPrice(first.price as number)
                : first.symbol}
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

      {/* A list alone sizes to its longest price. A reason is prose and needs a
          measure to read at, so the panel widens for one and caps at the
          viewport on a phone; a long one scrolls rather than running off the
          bottom of a short window. */}
      {open && (
        <div
          className={`overlay-panel absolute left-0 top-full z-50 mt-2 max-h-[min(70vh,26rem)] max-w-[calc(100vw-2rem)] overflow-y-auto py-1 ${
            showReason ? "w-[20rem]" : "min-w-[200px]"
          }`}
          role="menu"
        >
          <div className="px-4 py-2">
            <span className={`${OVERLAY_HEADING} text-rb-500`}>
              {assets.length > 0 && !assets.some(priced) ? "Assets held" : "Prices"}
            </span>
          </div>
          <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
          {assets.length > 0 && (
            <ul className={showReason ? "" : "pb-1"}>
              {assets.map((a) =>
                priced(a) ? (
                  <li key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol} className="px-2">
                    <PricePill
                      symbol={a.symbol}
                      address={a.address}
                      price={a.price as number}
                      unit={a.unit}
                      filterable={false}
                      title={a.label ?? a.symbol}
                      showSymbol
                      bare
                    />
                  </li>
                ) : (
                  // Held, and the protocol states no figure for it. The row
                  // names the asset and leaves the price column empty rather
                  // than filling it with a number from somewhere else.
                  <li key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol} className="px-2">
                    <span
                      title={a.label ?? a.symbol}
                      className="inline-flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-xs tabular-nums"
                    >
                      <TokenChipIcon symbol={a.symbol} address={a.address} size={14} filterable={false} />
                      <span className="font-medium text-rb-500">{a.symbol}</span>
                      <span className="text-rb-500" aria-label="no price stated">
                        &ndash;
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
          {showReason ? (
            <p className="px-4 pb-2 pt-1 text-xs leading-relaxed text-rb-500">{reason}</p>
          ) : (
            assets.length === 0 && (
              <p className="px-4 pb-2 pt-1 text-xs leading-relaxed text-rb-500">
                This explorer does not price the position&rsquo;s assets yet.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
