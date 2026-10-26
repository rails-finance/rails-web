"use client";

// AssetPopover — what an asset icon opens (rails-ops TO-DO-ui-jobs 248). The
// icon is the trigger: a click or a tap opens a panel about the asset, a
// second click, Escape or a click elsewhere closes it. Above 640px the panel
// is anchored to the icon; under it, a bottom sheet (mobile-sheet.tsx), the
// way the Lifetime flows panel and the provenance inspector open there.
//
// The panel states what the data carries and nothing else: the figure the
// caller passes (its first line), the icon and ticker, the asset's name, its
// contract on the chain's explorer, its price and where the price comes from.
// A field the caller cannot fill is left out. It is one component so every
// icon opens the same panel. Where the asset has a page (the Prices list's
// row for its chain and contract, rails-ops reference/asset-key-map.md) the
// panel ends with that row: the last day's price, the 30-day line and change,
// and the link to the page. Inside an explorer the row is priced by the line
// that explorer's protocol reads (the page's main line where it reads none),
// and the link carries the protocol and the path back (`?via=&from=`,
// lib/shared/asset-via.ts), so the page opens from that protocol's side.
//
// Two collisions on the cards it sits in:
//   • the figure beside the icon is a provenance target (`data-prov-exact`):
//     the trigger wraps the icon alone, and while the inspector is armed a
//     click on the icon is the inspector's, as RevealTip leaves it;
//   • a card can be a link or a toggle: a click on the trigger or inside the
//     panel never reaches it.

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { QuietTipsContext } from "@/components/shared/reveal-tip";
import { createPortal } from "react-dom";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { provInspector } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { getTokenAddress } from "@/lib/shared/token-addresses";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PriceUnitMark } from "@/components/assets/price-unit-mark";
import { fmtChange, PriceSparkline } from "@/components/assets/price-sparkline";
import { asOfMark, asOfWords, fmtRowPrice } from "@/components/assets/asset-price-row";
import { loadAssetPrices } from "@/lib/api/fetch-asset-prices";
import { rowFor, type AssetPriceRow } from "@/lib/shared/asset-prices";
import { assetHref, NATIVE } from "@/lib/shared/asset-roster";
import { usesWords, viaName, withVia } from "@/lib/shared/asset-via";
import { viaForPathname, viaValue } from "@/lib/shared/asset-via-links";

const WORDS = {
  about: (symbol: string) => `About ${symbol}`,
  contract: "Contract",
  price: "Price",
  source: "Price source",
  open: (symbol: string) => `Open ${symbol} →`,
};

const POP_W = 288;
const GUTTER = 12;

export interface AssetPopoverProps {
  /** The ticker; with the chain, the token table's key for the contract. */
  symbol: string;
  /** The token's address where the caller has it; else the token table's. */
  address?: string;
  /** The asset's name, where the data carries one. */
  name?: string;
  /** The chain the contract link goes to; default the page's. */
  chainId?: ChainId;
  /** The panel's first line: the figure the icon stands beside, exact. */
  figure?: ReactNode;
  /** The asset's price as the row states it ("$0.9997"). */
  price?: ReactNode;
  /** Where the price comes from. */
  priceSource?: ReactNode;
  /** Classes on the trigger (a muted icon's opacity). */
  className?: string;
  /** The icon. */
  children: ReactNode;
}

export function AssetPopover({
  symbol,
  address,
  name,
  chainId,
  figure,
  price,
  priceSource,
  className,
  children,
}: AssetPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pageChain = useChainId();
  const chain = chainId ?? pageChain;
  const contract = address ?? getTokenAddress(symbol, chain);
  const label = WORDS.about(symbol);
  // Inside another control (the position card's breakdown button) the icon
  // opens nothing: a button may not sit in a button.
  const quiet = useContext(QuietTipsContext);

  const close = () => setOpen(false);
  if (quiet) return <span className={`inline-flex items-center ${className ?? ""}`}>{children}</span>;

  return (
    <span className="inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-asset-popover={symbol}
        data-prov-hidden=""
        className={`inline-flex cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${className ?? ""}`}
        onClick={(e) => {
          // While the inspector is armed the click traces the figure.
          if (provInspector.getArmed()) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {children}
      </button>
      {open && (
        // The panel renders in a portal, but its events still pass through
        // the card's React handlers: this stops them here.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel id={panelId} label={label} anchor={() => triggerRef.current} onClose={close}>
            <AssetPanelBody
              symbol={symbol}
              name={name}
              figure={figure}
              contract={contract}
              chain={chain}
              price={price}
              priceSource={priceSource}
            />
          </AnchoredPanel>
        </span>
      )}
    </span>
  );
}

function AssetPanelBody({
  symbol,
  name,
  figure,
  contract,
  chain,
  price,
  priceSource,
}: {
  symbol: string;
  name?: string;
  figure?: ReactNode;
  contract: string | null;
  chain: ChainId;
  price?: ReactNode;
  priceSource?: ReactNode;
}) {
  const short = contract ? `${contract.slice(0, 6)}…${contract.slice(-4)}` : null;
  return (
    <div className="flex flex-col gap-2 text-xs" data-asset-popover-body="">
      {figure != null && (
        <p className="pr-8 text-sm font-semibold tabular-nums text-foreground" data-asset-popover-line="figure">
          {figure}
        </p>
      )}
      <div className="flex items-center gap-2 pr-8" data-asset-popover-line="asset">
        <TokenChipIcon symbol={symbol} address={contract ?? undefined} size={24} filterable={false} untitled />
        <span className="font-semibold text-foreground">{symbol}</span>
        {name && <span className="text-rb-500">{name}</span>}
      </div>
      {(contract || price != null || priceSource != null) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          {contract && short && (
            <div className="contents" data-asset-popover-line="contract">
              <dt className="text-rb-500">{WORDS.contract}</dt>
              <dd className="text-right">
                <a
                  href={explorerUrl(chain, "token", contract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external font-mono"
                  aria-label={`${WORDS.contract} ${contract}`}
                >
                  {short}
                </a>
              </dd>
            </div>
          )}
          {price != null && (
            <div className="contents" data-asset-popover-line="price">
              <dt className="text-rb-500">{WORDS.price}</dt>
              <dd className="text-right tabular-nums text-foreground">{price}</dd>
            </div>
          )}
          {priceSource != null && (
            <div className="contents" data-asset-popover-line="source">
              <dt className="text-rb-500">{WORDS.source}</dt>
              <dd className="text-right text-foreground">{priceSource}</dd>
            </div>
          )}
        </dl>
      )}
      {(contract ?? (symbol === "ETH" ? NATIVE : null)) && <AssetPageRow chain={chain} contract={contract ?? NATIVE} />}
    </div>
  );
}

/** The asset's Prices list row and its page link, once the list is read;
 *  nothing where the asset has no page. */
function AssetPageRow({ chain, contract }: { chain: ChainId; contract: string }) {
  const pathname = usePathname();
  // The panel opens on a click, so the browser's location is there to read.
  const search = typeof window === "undefined" ? "" : window.location.search;
  const via = viaForPathname(pathname, search);
  const value = via ? viaValue(via) : null;
  const [row, setRow] = useState<ReturnType<typeof rowFor>>(null);
  useEffect(() => {
    let live = true;
    loadAssetPrices().then((list) => live && setRow(list ? rowFor(list, chain, contract, value) : null));
    return () => {
      live = false;
    };
  }, [chain, contract, value]);
  if (!row) return null;
  const open = withVia(assetHref(chain, row.token), value, `${pathname}${search}`);
  return (
    <div
      className="flex flex-col gap-1.5 border-t border-[var(--rb-tooltip-border)] pt-2"
      data-asset-popover-line="page"
    >
      {row.price != null && (
        <div className="flex items-center gap-2 tabular-nums">
          <span className="flex flex-1 items-center gap-1">
            <PriceUnitMark unit={row.unit} size={12} />
            <span className="font-semibold text-foreground">{fmtRowPrice(row.price)}</span>
            {row.asOf && (
              <span
                className="text-[11px] text-rb-500"
                title={`The stored round in force ${asOfWords(row.asOf)}`}
                data-asset-popover-as-of={row.asOf.block}
              >
                {asOfMark(row.asOf)}
              </span>
            )}
          </span>
          <PriceSparkline points={row.spark} label={`${row.symbol} over 30 days`} className="h-6 w-20" />
          <span
            className={`w-12 text-right ${row.change == null ? "text-rb-500" : row.change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {row.change == null ? "–" : fmtChange(row.change)}
          </span>
        </div>
      )}
      {row.oracle && (
        <p className="text-[11px] text-rb-500" title={row.oracle} data-asset-popover-via={row.viaLine ?? ""}>
          {via && row.viaLine === "own"
            ? `${usesWords(viaName(row.by[row.viaKey ?? via.id], via.label)).replace(/^t/, "T")}: `
            : via && row.viaLine === "none"
              ? `${via.label} has no stored price for it; the main line: `
              : ""}
          {row.oracle}
          {row.asOf ? `, its stored rounds to block ${row.asOf.block.toLocaleString("en-US")}` : ""}, last 30 days
        </p>
      )}
      <Link href={open} className="font-medium text-foreground hover:underline" data-asset-popover-open={open}>
        {WORDS.open(row.symbol)}
      </Link>
    </div>
  );
}

/** The anchored popover above 640px, the bottom sheet under it: the asset
 *  panel's shell, shared with the position card's breakdowns. */
export function AnchoredPanel({
  id,
  label,
  anchor,
  onClose,
  fit,
  drop,
  sheetHeader,
  name = "asset-popover-panel",
  surface = "tooltip",
  className,
  children,
}: {
  id: string;
  label: string;
  anchor: () => HTMLElement | null;
  onClose: () => void;
  /** Width to the content, up to this many pixels, in place of the asset
   *  panel's fixed width. */
  fit?: number;
  /** Under the anchor, as a dropdown, where the room below allows. */
  drop?: boolean;
  /** The bottom sheet's heading row. */
  sheetHeader?: ReactNode;
  /** The panel's data attribute (`data-<name>="popover" | "sheet"`). */
  name?: string;
  /** The tooltip's surface (the asset panel), or the dropdown menus'
   *  (`.overlay-panel`). */
  surface?: "tooltip" | "overlay";
  className?: string;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; tall: boolean } | null>(null);
  const latest = useRef({ anchor, onClose });
  useLayoutEffect(() => {
    latest.current = { anchor, onClose };
  });

  // Over the icon, clamped inside the viewport; under it where the room above
  // is short (a dropdown the other way round). Re-placed on scroll and resize.
  useLayoutEffect(() => {
    if (phone) return;
    const place = () => {
      const a = latest.current.anchor();
      const el = ref.current;
      if (!a || !el) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(fit != null ? el.offsetWidth : POP_W, vw - GUTTER * 2);
      const h = el.offsetHeight;
      const mid = r.left + r.width / 2;
      const left = Math.min(Math.max(GUTTER, mid - width / 2), vw - GUTTER - width);
      const above = r.top - 8 - h;
      const roomBelow = r.bottom + 8 + h <= vh - GUTTER;
      const top = drop
        ? roomBelow
          ? r.bottom + 8
          : above >= GUTTER
            ? above
            : Math.max(GUTTER, vh - GUTTER - h)
        : above >= GUTTER || !roomBelow
          ? Math.max(GUTTER, above)
          : r.bottom + 8;
      // Taller than the viewport: it scrolls (else nothing clips a tip in it).
      const tall = el.scrollHeight > vh - GUTTER * 2;
      setPos((p) =>
        p && p.top === top && p.left === left && p.width === width && p.tall === tall ? p : { top, left, width, tall },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });

  // A press outside the panel and its icon closes it.
  useEffect(() => {
    if (phone) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || latest.current.anchor()?.contains(t)) return;
      latest.current.onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [phone]);

  // Escape closes it and returns focus to the icon. While the provenance
  // inspector is armed, Escape is the inspector's.
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || provInspector.getArmed()) return;
      e.preventDefault();
      const a = latest.current.anchor();
      latest.current.onClose();
      a?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phone]);

  if (typeof document === "undefined") return null;
  if (phone)
    return (
      <MobileSheet label={label} mode="live" dismiss onClose={onClose} header={sheetHeader}>
        <div id={id} {...{ [`data-${name}`]: "sheet" }} className={`text-sm ${className ?? ""}`}>
          {children}
        </div>
      </MobileSheet>
    );
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      {...{ [`data-${name}`]: "popover" }}
      className={`fixed z-[var(--z-popover)] p-3 text-foreground outline-none ${surface === "overlay" ? "overlay-panel" : "rounded-2xl border shadow-lg"} ${className ?? ""}`}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        ...(fit != null
          ? {
              width: pos && pos.width < fit ? pos.width : undefined,
              maxWidth: fit,
              ...(pos?.tall ? { maxHeight: `calc(100vh - ${GUTTER * 2}px)`, overflowY: "auto" as const } : {}),
            }
          : { width: pos?.width ?? POP_W }),
        visibility: pos ? undefined : "hidden",
        ...(surface === "tooltip"
          ? { background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }
          : {}),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
