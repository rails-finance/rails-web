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
// icon opens the same panel, and it takes more lines later (a price chart).
//
// Two collisions on the cards it sits in:
//   • the figure beside the icon is a provenance target (`data-prov-exact`):
//     the trigger wraps the icon alone, and while the inspector is armed a
//     click on the icon is the inspector's, as RevealTip leaves it;
//   • a card can be a link or a toggle: a click on the trigger or inside the
//     panel never reaches it.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { provInspector } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { getTokenAddress } from "@/lib/shared/token-addresses";

const WORDS = {
  about: (symbol: string) => `About ${symbol}`,
  contract: "Contract",
  price: "Price",
  source: "Price source",
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

  const close = () => setOpen(false);

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
          <AssetPanelShell id={panelId} label={label} anchor={() => triggerRef.current} onClose={close}>
            <AssetPanelBody
              symbol={symbol}
              name={name}
              figure={figure}
              contract={contract}
              chain={chain}
              price={price}
              priceSource={priceSource}
            />
          </AssetPanelShell>
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
    </div>
  );
}

/** The anchored popover above 640px, the bottom sheet under it. */
function AssetPanelShell({
  id,
  label,
  anchor,
  onClose,
  children,
}: {
  id: string;
  label: string;
  anchor: () => HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const latest = useRef({ anchor, onClose });
  useLayoutEffect(() => {
    latest.current = { anchor, onClose };
  });

  // Over the icon, clamped inside the viewport; under it where the room above
  // is short. Re-placed on scroll and resize.
  useLayoutEffect(() => {
    if (phone) return;
    const place = () => {
      const a = latest.current.anchor();
      const el = ref.current;
      if (!a || !el) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(POP_W, vw - GUTTER * 2);
      const h = el.offsetHeight;
      const mid = r.left + r.width / 2;
      const left = Math.min(Math.max(GUTTER, mid - width / 2), vw - GUTTER - width);
      const above = r.top - 8 - h;
      const top = above >= GUTTER || r.bottom + 8 + h > vh - GUTTER ? Math.max(GUTTER, above) : r.bottom + 8;
      setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }));
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
      <MobileSheet label={label} mode="live" dismiss onClose={onClose}>
        <div id={id} data-asset-popover-panel="sheet" className="text-sm">
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
      data-asset-popover-panel="popover"
      className="fixed z-50 rounded-2xl border p-3 text-foreground shadow-lg outline-none"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? POP_W,
        visibility: pos ? undefined : "hidden",
        background: "var(--rb-tooltip-bg)",
        borderColor: "var(--rb-tooltip-border)",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
