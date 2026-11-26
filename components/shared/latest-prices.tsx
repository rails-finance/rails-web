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

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Coins } from "lucide-react";
import { fmtNative, fmtPrice, PricePill } from "@/components/shared/price-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useAssetPageHref } from "@/components/shared/asset-popover";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { formatDate } from "@/lib/date";
import { offPar } from "@/lib/shared/usd-display";
import { OFF_PAR_BAND } from "@/components/shared/usd-figure";
import { Prov, type Provenance } from "@/components/shared/provenance";

/** A dropdown row. `price` absent means the protocol states none for this
 *  asset: the row names what is held and `reason` says why no figure follows
 *  it. A `PriceStripAsset` (the bottom dock's shape, always priced) is
 *  assignable here, so the priced views pass through unchanged.
 *
 *  `info` is the asset's oracle receipt — the same one the view builds for
 *  this price elsewhere on the page. Absent on a view not yet wired for it;
 *  present, it traces the trigger's leading figure (the dropdown's own rows
 *  stay their own surface). */
export type LatestPriceAsset = Omit<PriceStripAsset, "price"> & {
  price?: number;
  info?: Provenance;
  /** A word drawn before the trigger's figure, where the figure alone reads
   *  as something else (Polaris: "2.84 ETH" read as a gas price). Unset, the
   *  token glyph alone names it. */
  triggerLabel?: string;
  /** Where this asset leads the trigger, the count says what it counts
   *  ("+1 more price"). Unset, it reads "+1". */
  moreInWords?: boolean;
  /** The figure as the view's card writes it (Uniswap: "1.481 WETH"), drawn
   *  in the trigger and the row in place of `fmtNative`, so chip and card
   *  agree on precision. */
  figure?: string;
};

/** The block a closed position's prices were read at: its closing row. */
export interface PricesAt {
  block: number;
  /** Unix seconds. */
  timestamp: number;
}

export function LatestPrices({
  assets,
  reason,
  at,
  bare = false,
  subject = "position",
}: {
  assets: LatestPriceAsset[];
  reason?: string;
  /** The wallet row's strip (ui-jobs 272): no "Prices" word before the
   *  figure; the icon, the price and "+1" with its chevron. */
  bare?: boolean;
  /** Set on a closed position: the prices are the closing block's, and the
   *  panel says so under its heading. */
  at?: PricesAt;
  /** What the control prices, in its accessible name and empty panel: the
   *  family's word ("wallet" on CoW, rails-ops ui-jobs 657 C9). */
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The panel hangs from the trigger's left edge, which on a phone sits a
  // third of the way across: a 20rem panel then ran past the right edge and
  // gave the page a sideways scroll. Once open, it moves left by whatever it
  // overhangs the viewport's 1rem margin.
  const panelRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !panelRef.current) {
      setShift(0);
      return;
    }
    const box = panelRef.current.getBoundingClientRect();
    const over = box.right - (document.documentElement.clientWidth - 16);
    setShift(over > 0 ? over : 0);
  }, [open]);

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

  // Up to three prices stand inline, each with its receipt; past three the
  // "+N" dropdown holds the rest (Miles, 26 Nov 2026, ui-jobs 856).
  const INLINE = 3;
  const inline = assets.slice(0, INLINE);
  const rest = assets.slice(INLINE);
  const more = rest.length;
  const first = assets[0];
  const priced = (a: LatestPriceAsset) => typeof a.price === "number" && a.price > 0;
  // A dollar stablecoin beyond DEPEG_BAND off $1 takes the caution orange,
  // as its USD figures do on the cards (ui-jobs 746).
  const inBand = (a: LatestPriceAsset) => !a.unit && priced(a) && offPar(a.price, a.symbol)?.band === true;
  const figureTone = (a: LatestPriceAsset) => (inBand(a) ? OFF_PAR_BAND : "text-green-400");
  // The reason answers "why is there no dollar figure here", so it belongs
  // under any list that is not wholly USD — a row with no price at all, and a
  // row quoted in the protocol's own unit alike — and in place of the generic
  // sentence when there is no list.
  const showReason = reason != null && !assets.every((a) => priced(a) && !a.unit);
  // The panel stays for the rest, and for what the inline prices cannot say:
  // the protocol's reason, a closed position's closing block, or no list.
  const panel = more > 0 || showReason || at != null || assets.length === 0;
  const listed = more > 0 && !showReason && at == null ? rest : assets;

  // The trigger carries no tooltip (Miles, 16 Oct 2026): the visible "Prices"
  // label names the control, the panel's rows name each price and its block,
  // and what an asset IS belongs on a surface with room for it (ui-jobs 356).
  const anyPriced = assets.some(priced);

  /** An inline price's receipt: the asset's, with a closed position's
   *  closing block where the receipt names none, so a price standing inline
   *  states the block and source the panel's row and heading state
   *  (ui-jobs 856). */
  const receiptOf = (a: LatestPriceAsset): Provenance | undefined =>
    a.info && at && a.info.source?.block == null
      ? { ...a.info, source: { ...a.info.source, block: at.block } }
      : a.info;

  /** One inline price: the asset's icon and its figure, traced where the
   *  view hands its receipt and named on hover as the panel's row is; an
   *  unpriced asset puts its symbol in the figure's place, so the strip still
   *  names what the position holds. */
  const inlinePrice = (a: LatestPriceAsset) => {
    const info = priced(a) ? receiptOf(a) : undefined;
    const text = priced(a)
      ? (a.figure ?? (a.unit ? fmtNative(a.price as number, a.unit) : fmtPrice(a.price as number)))
      : a.symbol;
    const figure = (
      <span
        className={`tabular-nums ${priced(a) ? `font-bold ${figureTone(a)}` : "font-medium text-rb-500"}`}
        data-usd-off-par={inBand(a) ? "band" : undefined}
      >
        {text}
      </span>
    );
    return (
      <span
        key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol}
        className="inline-flex items-center gap-1"
        title={a.label ?? a.symbol}
        data-latest-price={a.symbol}
        data-latest-price-block={info?.source?.block ?? at?.block}
      >
        <TokenChipIcon symbol={a.symbol} address={a.address} size={14} filterable={false} />
        {a.triggerLabel && <span className="font-medium text-foreground">{a.triggerLabel}</span>}
        {info ? (
          <Prov info={info} value={String(a.price)} symbol={a.symbol}>
            {figure}
          </Prov>
        ) : (
          figure
        )}
      </span>
    );
  };

  return (
    <div
      ref={ref}
      className="relative flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-xs"
      data-latest-prices
      data-anatomy="H7.2"
    >
      {first && !bare && <span className="text-[11px] text-rb-500 sm:text-xs">{anyPriced ? "Prices" : "Assets"}</span>}
      {inline.map(inlinePrice)}
      {panel && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={
            assets.length === 0
              ? `Prices for this ${subject}`
              : more > 0
                ? `${anyPriced ? (at ? "More prices at closing for" : "More prices for") : "More assets in"} this ${subject}: ${more} more`
                : `${anyPriced ? (at ? "Prices at closing for" : "Prices for") : "Assets in"} this ${subject}`
          }
          className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} h-7 gap-1 rounded-md px-1.5 text-xs`}
        >
          {assets.length === 0 ? (
            <>
              <Coins className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Prices</span>
            </>
          ) : (
            /* The count is chrome naming how many more rows the dropdown
               holds, not a value of its own — exempt rather than traced. */
            more > 0 && (
              <span className="tabular-nums text-rb-500" data-prov-exempt>
                +{more}
                {first?.moreInWords ? ` more ${anyPriced ? "price" : "asset"}${more === 1 ? "" : "s"}` : ""}
              </span>
            )
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}

      {/* A list alone sizes to its longest price. A reason is prose and needs a
          measure to read at, so the panel widens for one and caps at the
          viewport on a phone; a long one scrolls rather than running off the
          bottom of a short window. */}
      {open && (
        <div
          ref={panelRef}
          style={shift > 0 ? { transform: `translateX(-${shift}px)` } : undefined}
          className={`overlay-panel absolute left-0 top-full z-[var(--z-dropdown)] mt-2 max-h-[min(70vh,26rem)] max-w-[calc(100vw-2rem)] overflow-y-auto py-1 ${
            showReason ? "w-[20rem]" : "min-w-[200px]"
          }`}
          role="menu"
        >
          <div className="px-4 py-2">
            <span className={`${OVERLAY_HEADING} text-rb-500`}>
              {assets.length > 0 && !assets.some(priced) ? "Assets held" : "Prices"}
            </span>
            {at && (
              <p className="mt-1 text-xs tabular-nums text-rb-500" data-prices-at-block={at.block}>
                at closing · {formatDate(at.timestamp)}
                <br />
                block {at.block.toLocaleString("en-US")}
              </p>
            )}
          </div>
          <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
          {listed.length > 0 && (
            <ul className={showReason ? "" : "pb-1"}>
              {listed.map((a) =>
                priced(a) ? (
                  <li key={a.unit ? `${a.symbol}-${a.unit}` : a.symbol} className="px-2">
                    <AssetPageLink symbol={a.symbol} address={a.address}>
                      <PricePill
                        symbol={a.symbol}
                        address={a.address}
                        price={a.price as number}
                        unit={a.unit}
                        filterable={false}
                        title={a.label ?? a.symbol}
                        showSymbol
                        bare
                        figure={a.figure}
                        band={inBand(a)}
                      />
                    </AssetPageLink>
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
                This explorer does not price the {subject}&rsquo;s assets yet.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** A price row as a link to its asset's page (ui-jobs 516), where the asset
 *  has one; the row alone otherwise. */
function AssetPageLink({ symbol, address, children }: { symbol: string; address?: string; children: ReactNode }) {
  const href = useAssetPageHref(symbol, address);
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex rounded-md hover:bg-[var(--surface-hover)] focus-ring [&>span]:cursor-pointer"
      data-latest-prices-asset={symbol}
    >
      {children}
    </Link>
  );
}
