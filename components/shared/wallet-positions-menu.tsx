"use client";

// The positions menu under the wallet heading (H13.2; rails-ops decisions/0050
// point 10, decisions/0051 step 3; Miles 17 Nov 2026, ui-jobs 701): "3
// positions ⌄", opening the wallet's open positions, each its protocol's and
// its chain's icon and a short label (lib/wallet/position-label.ts), linking to
// its page; the page's own row marked and not a link; past six "+N more on
// wallet dashboard"; then the closed count and "Testnets not included". Read
// after mount from /api/chain/wallet/<address>/summary, so the page's render
// does not wait on it; nothing is drawn while it loads, when it fails, or when
// the page's position is the wallet's only one. The popover is the address
// menu's (C7, wallet-menu.tsx): a dropdown on desktop, a sheet below sm,
// closed by an outside press and Escape; the rows take the Tools menu's keys.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { moveFocus } from "@/components/shared/tools-menu";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, chainMeta, type ChainId } from "@/lib/shared/chains";
import { protocolForPathname } from "@/lib/shared/protocols";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { positionLabel } from "@/lib/wallet/position-label";
import {
  MENU_TESTNETS,
  rowIsPage,
  walletPositionsMenu,
  type WalletCounts,
  type WalletCountsChain,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const CHAIN_ID: Record<WalletCountsChain, ChainId> = {
  ethereum: MAINNET_CHAIN_ID,
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
};

// One read per address per page load; the route keeps its answer 60 s.
const reads = new Map<string, Promise<WalletCounts | null>>();

function readCounts(address: string): Promise<WalletCounts | null> {
  let read = reads.get(address);
  if (!read) {
    read = fetch(`/api/chain/wallet/${address}/summary`)
      .then((r) => (r.ok ? (r.json() as Promise<WalletCounts>) : null))
      .catch(() => null);
    reads.set(address, read);
    void read.then((c) => {
      if (!c) reads.delete(address);
    });
  }
  return read;
}

type Menu = NonNullable<ReturnType<typeof walletPositionsMenu<WalletCountsPosition>>>;

const ROW = "mx-1 my-0.5 flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-left";
const ROW_LINK = `${ROW} transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]`;
const DIVIDER = <div role="separator" className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />;

/** The protocol's and the chain's icons, each named for screen readers and on hover. */
function PositionIcons({ p }: { p: WalletCountsPosition }) {
  const entry = protocolForPathname(p.href.split("?")[0]);
  const protocol = entry?.label ?? p.family;
  const chain = chainMeta(CHAIN_ID[p.chain]).name;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span role="img" aria-label={protocol} title={protocol} className="flex" data-wallet-position-protocol={protocol}>
        <ProtocolIcon id={entry?.id ?? p.family} className="size-4 shrink-0" />
      </span>
      <span role="img" aria-label={chain} title={chain} className="flex text-rb-500" data-wallet-position-chain={chain}>
        <ChainGlyph id={CHAIN_ID[p.chain]} className="size-3.5 shrink-0" />
      </span>
    </span>
  );
}

export function WalletPositionsMenu({ wallet }: { wallet: string }) {
  const pathname = usePathname();
  const address = wallet.toLowerCase();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const headingId = useId();
  const close = () => setOpen(false);
  // Escape and the sheet's close hand focus back to the trigger.
  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    let live = true;
    setMenu(null);
    setOpen(false);
    if (!ADDRESS.test(address)) return;
    readCounts(address).then((c) => {
      if (!live || !c || c.error) return;
      const search = window.location.search;
      setMenu(walletPositionsMenu(c.positions, (p) => rowIsPage(p.href, pathname, search)));
    });
    return () => {
      live = false;
    };
  }, [address, pathname]);

  // Outside press and Escape close the dropdown, as the address menu's do; the
  // sheet closes from its scrim and Escape, and its rows are portalled outside
  // `ref`.
  useEffect(() => {
    if (!open || isPhone) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      if (ref.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone]);

  // The first row takes focus as the menu opens, so the arrows move from there.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() =>
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
        ?.focus({ preventScroll: true }),
    );
    return () => window.clearTimeout(t);
  }, [open, isPhone]);

  if (!menu) return null;
  const dashboard = `/wallet/${address}`;

  const rows = (
    <>
      {menu.open.length > 0 && (
        <div role="group" aria-labelledby={headingId} data-wallet-positions-open={menu.open.length}>
          <div id={headingId} className="px-4 pb-1 pt-2 text-xs font-semibold text-rb-500">
            {menu.openHeading}
          </div>
          {menu.open.map(({ position: p, page }) => {
            const label = positionLabel(p);
            const hook = { "data-wallet-position-row": p.positionId, "data-family": p.family };
            return page ? (
              <div
                key={`${p.chain}:${p.family}:${p.positionId}`}
                role="menuitem"
                aria-disabled="true"
                aria-current="page"
                tabIndex={-1}
                className={`${ROW} text-sm text-foreground`}
                data-wallet-position-page=""
                {...hook}
              >
                <PositionIcons p={p} />
                <span className="min-w-0 truncate">{label}</span>
                <span className="ml-auto shrink-0 pl-2 text-xs text-rb-500">this page</span>
              </div>
            ) : (
              <Link
                key={`${p.chain}:${p.family}:${p.positionId}`}
                href={p.href}
                prefetch={false}
                role="menuitem"
                className={`${ROW_LINK} text-sm text-foreground`}
                onClick={close}
                {...hook}
              >
                <PositionIcons p={p} />
                <span className="min-w-0 truncate">{label}</span>
              </Link>
            );
          })}
          {menu.more && (
            <Link
              href={dashboard}
              prefetch={false}
              role="menuitem"
              className={`${ROW_LINK} text-xs text-[var(--text-link)]`}
              onClick={close}
              data-wallet-positions-more=""
            >
              {menu.more}
            </Link>
          )}
        </div>
      )}
      {menu.closed && (
        <>
          {menu.open.length > 0 && DIVIDER}
          <Link
            href={dashboard}
            prefetch={false}
            role="menuitem"
            className={`${ROW_LINK} text-xs text-[var(--text-link)]`}
            onClick={close}
            data-wallet-positions-closed=""
          >
            {menu.closed}
          </Link>
        </>
      )}
      {DIVIDER}
      <div className="px-4 pb-1.5 pt-1 text-xs text-rb-500" data-wallet-positions-testnets="">
        {MENU_TESTNETS}
      </div>
    </>
  );

  return (
    <div
      ref={ref}
      className="relative flex min-w-0"
      data-anatomy="H13.2"
      data-wallet-positions-menu=""
      data-wallet-elsewhere={menu.pageCounted ? "others" : "all"}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        // A 20px row with a 36px press area (after:), neutral as the address
        // menu's trigger is.
        className={`relative -mx-1 flex h-5 cursor-pointer items-center gap-0.5 rounded-md px-1 text-xs transition-colors focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] ${
          open ? "text-foreground" : "text-rb-500 hover:text-foreground"
        }`}
        data-wallet-positions-trigger=""
      >
        {menu.trigger}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open &&
        (isPhone ? (
          <MobileSheet
            label="Positions menu"
            onClose={closeToTrigger}
            header={<div className={`${OVERLAY_HEADING} px-1 pb-2`}>Positions</div>}
          >
            <div
              ref={menuRef}
              role="menu"
              aria-label="Positions"
              onKeyDown={moveFocus}
              className="-mx-4 [&_[role=menuitem]]:min-h-11"
            >
              {rows}
            </div>
          </MobileSheet>
        ) : (
          <div
            ref={menuRef}
            className="overlay-panel absolute left-0 top-full z-[var(--z-dropdown)] mt-2 w-max min-w-[240px] max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden py-1"
            role="menu"
            aria-label="Positions"
            onKeyDown={moveFocus}
          >
            {rows}
          </div>
        ))}
    </div>
  );
}
