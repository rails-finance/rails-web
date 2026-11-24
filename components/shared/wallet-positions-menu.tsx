"use client";

// The positions menu under the wallet heading (H13.2; rails-ops decisions/0050
// point 10, decisions/0051 step 3; Miles 17 Nov 2026, ui-jobs 701): "3
// positions ⌄", opening one row per protocol and chain the wallet holds
// positions in: the protocol's and the chain's icons, the protocol's name and
// its counts ("1 open · 2 closed"). A row links to its one position, or past
// one to the protocol's listing searched by the wallet; the row holding the
// page's position reads "this page" (not a link where it is the page). Then
// "Wallet dashboard" and "Testnets not included". Read after mount from
// /api/chain/wallet/<address>/summary, so the page's render does not wait on
// it. Its line is held from first paint (the loading grammar,
// skeleton-card.tsx): a placeholder bar while the read is out, and the line
// left empty when it fails or when the page's position is the wallet's only
// one, so the heading never changes height. The popover is the address menu's (C7,
// wallet-menu.tsx): a dropdown on desktop, a sheet below sm, closed by an
// outside press and Escape; the rows take the Tools menu's keys.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { moveFocus } from "@/components/shared/tools-menu";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  ARBITRUM_CHAIN_ID,
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  MAINNET_CHAIN_ID,
  chainMeta,
  type ChainId,
} from "@/lib/shared/chains";
import { PROTOCOLS, listingHrefForWallet, protocolForPathname } from "@/lib/shared/protocols";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { walletProtocolHref } from "@/lib/wallet/wallet-filters";
import {
  MENU_TESTNETS,
  rowIsPage,
  VAULT_SHARES_FAMILY,
  vaultProtocolOfHref,
  walletProtocolMenu,
  type MenuProtocol,
  type WalletCounts,
  type WalletCountsChain,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const CHAIN_ID: Record<WalletCountsChain, ChainId> = {
  ethereum: MAINNET_CHAIN_ID,
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
  arc: ARC_CHAIN_ID,
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
      if (!c || c.partial) reads.delete(address);
    });
  }
  return read;
}

type Menu = NonNullable<ReturnType<typeof walletProtocolMenu<WalletCountsPosition>>>;

/** A position's explorer on the roster: its name, its place, and its listing
 *  searched by the wallet (every wallet family's listing reads `q`). A
 *  vault-share row names its vault protocol ("MetaMorpho vaults" under
 *  Morpho's door) and opens the holder listing of the explorer's Vaults tab,
 *  where it has one; Yearn V3 has none, so its row opens the wallet view
 *  narrowed to the vault shares. */
function protocolOf(p: WalletCountsPosition, address: string): MenuProtocol | undefined {
  const entry = protocolForPathname(p.href.split("?")[0]);
  if (!entry) return undefined;
  const vault = vaultProtocolOfHref(p.href);
  return {
    name: vault ?? entry.label,
    order: PROTOCOLS.indexOf(entry),
    listing: vault
      ? (listingHrefForWallet(entry.session, address, "vaults") ?? walletProtocolHref(address, VAULT_SHARES_FAMILY))
      : listingHrefForWallet(entry.session, address),
  };
}

const ROW = "mx-1 my-0.5 flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-left";
const ROW_LINK = `${ROW} transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]`;
const DIVIDER = <div role="separator" className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />;

/** The protocol's and the chain's icons, each named for screen readers and on hover. */
function ProtocolIcons({ p }: { p: WalletCountsPosition }) {
  const entry = protocolForPathname(p.href.split("?")[0]);
  const protocol = vaultProtocolOfHref(p.href) ?? entry?.label ?? p.family;
  const chain = chainMeta(CHAIN_ID[p.chain]).name;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span role="img" aria-label={protocol} title={protocol} className="flex" data-wallet-protocol-name={protocol}>
        <ProtocolIcon id={entry?.id ?? p.family} className="size-4 shrink-0" />
      </span>
      <span role="img" aria-label={chain} title={chain} className="flex text-rb-500" data-wallet-protocol-chain={chain}>
        <ChainGlyph id={CHAIN_ID[p.chain]} className="size-3.5 shrink-0" />
      </span>
    </span>
  );
}

export function WalletPositionsMenu({ wallet }: { wallet: string }) {
  const pathname = usePathname();
  const address = wallet.toLowerCase();
  const [menu, setMenu] = useState<Menu | null>(null);
  // The summary read has answered (or failed): the placeholder goes.
  const [settled, setSettled] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const close = () => setOpen(false);
  // Escape and the sheet's close hand focus back to the trigger.
  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    let live = true;
    setMenu(null);
    setSettled(false);
    setOpen(false);
    if (!ADDRESS.test(address)) {
      setSettled(true);
      return;
    }
    readCounts(address).then((c) => {
      if (!live) return;
      setSettled(true);
      if (!c || c.error) return;
      const search = window.location.search;
      setMenu(
        walletProtocolMenu(
          c.positions,
          (p) => rowIsPage(p.href, pathname, search),
          (p) => protocolOf(p, address),
          `/wallet/${address}`,
        ),
      );
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

  if (!menu)
    return (
      <div className="flex h-5 items-center" data-wallet-positions-pending={settled ? undefined : ""}>
        {!settled && <SkeletonBar width={72} />}
      </div>
    );
  const dashboard = `/wallet/${address}`;

  const rows = (
    <>
      {menu.rows.map((r) => {
        const hook = { "data-wallet-protocol-row": r.key, "data-family": r.first.family };
        const body = (
          <>
            <ProtocolIcons p={r.first} />
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="ml-auto flex shrink-0 items-baseline gap-2 pl-3 text-xs text-rb-500 tabular-nums">
              {r.page && <span data-wallet-protocol-page="">this page ·</span>}
              <span data-wallet-protocol-counts="">{r.counts}</span>
            </span>
          </>
        );
        return r.current ? (
          <div
            key={r.key}
            role="menuitem"
            aria-disabled="true"
            aria-current="page"
            tabIndex={-1}
            className={`${ROW} text-sm text-foreground`}
            {...hook}
          >
            {body}
          </div>
        ) : (
          <Link
            key={r.key}
            href={r.href}
            prefetch={false}
            role="menuitem"
            className={`${ROW_LINK} text-sm text-foreground`}
            onClick={close}
            {...hook}
          >
            {body}
          </Link>
        );
      })}
      {DIVIDER}
      <Link
        href={dashboard}
        prefetch={false}
        role="menuitem"
        className={`${ROW_LINK} text-sm text-[var(--text-link)]`}
        onClick={close}
        data-wallet-positions-dashboard=""
      >
        Wallet dashboard
      </Link>
      <div className="px-4 pb-1.5 pt-1 text-xs text-rb-500" data-wallet-positions-testnets="">
        {MENU_TESTNETS}
      </div>
    </>
  );

  return (
    <div
      ref={ref}
      className="reveal-in relative flex min-w-0"
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
