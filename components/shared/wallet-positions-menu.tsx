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
//
// The menu is the first crumb of the trail under the address (H13.4; Miles,
// 25 Nov 2026): "3 positions ⌄ / Aave V3 / Core ⟠", slash-separated. The
// protocol crumb is the menu's row for the page's protocol, linking where
// that row's listing does (`walletTrailCrumb`): the wallet view narrowed to
// the protocol, which spans its chains. On a page that lists the wallet's
// positions in one protocol it is the page and the trail ends there. On a
// position page the position crumb follows, the detail card's name
// (`usePositionCardName`) with its chain's glyph, as the page: the only
// crumb that truncates. There the menu's row reads "this protocol"; on the
// wallet page "this page". Where the page's position is the wallet's only
// one the trail is the protocol and the position, with no menu.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import type { CardMenuRender, TrailStatus } from "@/components/shared/position-card-strip";
import { Prov } from "@/components/shared/provenance";
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
  SEPOLIA_CHAIN_ID,
  chainMeta,
  type ChainId,
} from "@/lib/shared/chains";
import { menuProtocolOf, protocolEntryOf, protocolLabelOf } from "@/lib/wallet/position-protocol";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import {
  MENU_TESTNETS,
  rowIsPage,
  walletProtocolMenu,
  walletProtocolRows,
  walletTrailCrumb,
  type TrailPage,
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
  sepolia: SEPOLIA_CHAIN_ID,
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

type Menu = ReturnType<typeof walletProtocolMenu<WalletCountsPosition>>;
type Crumb = ReturnType<typeof walletTrailCrumb<WalletCountsPosition>>;

const ROW = "mx-1 my-0.5 flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-left";
const ROW_LINK = `${ROW} transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]`;
const DIVIDER = <div role="separator" className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />;
/** The pulse's colour for each pill tone: the pill's text colour. */
const PULSE_TONE: Record<TrailStatus["tone"], string> = {
  open: "text-positive",
  muted: "text-rb-500",
  danger: "text-red-500",
  caution: "text-tone-caution",
};
const SLASH = (
  <span className="shrink-0 px-1.5 text-rb-500" aria-hidden="true">
    /
  </span>
);

/** The protocol's and the chain's icons, each named for screen readers and on hover. */
function ProtocolIcons({ p }: { p: WalletCountsPosition }) {
  const entry = protocolEntryOf(p);
  const protocol = protocolLabelOf(p);
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

export function WalletPositionsMenu({
  wallet,
  page = "position",
  search: givenSearch,
  position,
  status,
  cardMenu,
  onCrumb,
}: {
  wallet: string;
  /** What the page is: the protocol crumb is the page on a wallet page. */
  page?: TrailPage;
  /** The page's query where the page knows it better than the URL read at
   *  mount (the wallet view's chosen protocol, which it changes in place). */
  search?: string;
  /** The position crumb's words, on a position page whose card has named it. */
  position?: string | null;
  /** The card's lifecycle, the pulse before the position crumb. */
  status?: TrailStatus | null;
  /** The card's ⋮ menu, which the position crumb opens. */
  cardMenu?: CardMenuRender | null;
  /** Told once the read settles whether the trail has a protocol crumb. */
  onCrumb?: (found: boolean) => void;
}) {
  const pathname = usePathname();
  const address = wallet.toLowerCase();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [crumb, setCrumb] = useState<Crumb>(null);
  const crumbRef = useRef(onCrumb);
  crumbRef.current = onCrumb;
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
    setCrumb(null);
    setSettled(false);
    setOpen(false);
    if (!ADDRESS.test(address)) {
      setSettled(true);
      crumbRef.current?.(false);
      return;
    }
    readCounts(address).then((c) => {
      if (!live) return;
      setSettled(true);
      if (!c || c.error) {
        crumbRef.current?.(false);
        return;
      }
      const search = givenSearch ?? window.location.search;
      const isPage = (p: WalletCountsPosition) => rowIsPage(p.href, pathname, search);
      const protocolOf = (p: WalletCountsPosition) => menuProtocolOf(p, address);
      const dashboard = `/wallet/${address}`;
      setMenu(walletProtocolMenu(c.positions, isPage, protocolOf, dashboard));
      setCrumb(
        walletTrailCrumb(walletProtocolRows(c.positions, isPage, protocolOf, dashboard), pathname, search, page),
      );
    });
    return () => {
      live = false;
    };
  }, [address, pathname, givenSearch, page]);

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

  // The position crumb stands whatever the summary read answers: the card
  // leaves its name to it.
  const named = page === "position" && !crumb?.current && position ? position : null;
  if (!menu && !crumb && !named)
    return (
      <div className="flex h-5 items-center" data-wallet-positions-pending={settled ? undefined : ""}>
        {!settled && <SkeletonBar width={72} />}
      </div>
    );
  const dashboard = `/wallet/${address}`;
  // On a wallet page the crumb's row is the page.
  const here = (key: string) => page === "wallet" && crumb?.current === true && crumb.keys.includes(key);

  const rows = menu && (
    <>
      {menu.rows.map((r) => {
        const hook = { "data-wallet-protocol-row": r.key, "data-family": r.first.family };
        const mark = here(r.key) ? "this page" : r.page ? (page === "wallet" ? "this page" : "this protocol") : null;
        const body = (
          <>
            <ProtocolIcons p={r.first} />
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="ml-auto flex shrink-0 items-baseline gap-2 pl-3 text-xs text-rb-500 tabular-nums">
              {mark && <span data-wallet-protocol-page="">{mark} ·</span>}
              <span data-wallet-protocol-counts="">{r.counts}</span>
            </span>
          </>
        );
        return r.current || here(r.key) ? (
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

  const dropdown = menu && (
    <div
      ref={ref}
      className="relative flex shrink-0"
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

  const protocolBody = crumb && <span className="whitespace-nowrap">{crumb.row.name}</span>;
  // The pulse's words: the pill's, with its read-more where it has one.
  const statusTip = status && (status.tip ? `${status.word}. ${status.tip}` : status.word);
  return (
    <nav
      aria-label="Breadcrumb"
      className="reveal-in flex h-5 min-w-0 max-w-full items-center text-xs"
      data-anatomy="H13.4"
      data-prov-chrome=""
      data-wallet-trail=""
    >
      {dropdown ?? (!settled && <SkeletonBar width={72} />)}
      {crumb && (
        <>
          {dropdown && SLASH}
          {crumb.current ? (
            <span
              aria-current="page"
              className="flex shrink-0 items-center gap-1 text-foreground"
              data-wallet-trail-protocol={crumb.row.key}
            >
              {protocolBody}
            </span>
          ) : (
            <Link
              href={crumb.href}
              prefetch={false}
              className="relative -mx-1 flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-rb-500 transition-colors hover:text-foreground focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
              data-wallet-trail-protocol={crumb.row.key}
            >
              {protocolBody}
            </Link>
          )}
        </>
      )}
      {named && (
        <>
          {(dropdown || crumb || !settled) && SLASH}
          <span
            aria-current="page"
            className="flex min-w-0 items-center gap-1 text-foreground"
            data-wallet-trail-position=""
          >
            {cardMenu ? (
              // The card's ⋮ menu, opened from the crumb: the status row
              // first (ui-jobs 856).
              cardMenu({
                trigger: (open) => (
                  <>
                    {status && (
                      <span
                        className={`flex shrink-0 ${PULSE_TONE[status.tone]}`}
                        title={status.word}
                        data-wallet-trail-status={status.tone}
                      >
                        <Activity className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 truncate">{named}</span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </>
                ),
                label: status ? `${named}, ${status.word}: position menu` : `${named}: position menu`,
                top: status && (
                  <>
                    <div
                      role="none"
                      className="mx-1 my-0.5 flex items-start gap-2 px-3 py-1.5"
                      data-trail-status-row=""
                    >
                      <Activity className={`mt-0.5 size-4 shrink-0 ${PULSE_TONE[status.tone]}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-sm text-foreground">
                          {status.prov ? <Prov info={status.prov}>{status.word}</Prov> : status.word}
                        </div>
                        {status.tip && <p className="mt-0.5 text-xs leading-relaxed text-rb-500">{status.tip}</p>}
                      </div>
                    </div>
                    {DIVIDER}
                  </>
                ),
              })
            ) : (
              <>
                {status && statusTip && (
                  <RevealTip
                    tip={<span className="block max-w-72 whitespace-normal">{statusTip}</span>}
                    label={statusTip}
                    focusable
                    className="flex shrink-0 rounded-sm focus-ring"
                  >
                    <span className={`flex ${PULSE_TONE[status.tone]}`} data-wallet-trail-status={status.tone}>
                      <Activity className="size-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </RevealTip>
                )}
                <span title={named} className="min-w-0 truncate">
                  {named}
                </span>
              </>
            )}
          </span>
        </>
      )}
    </nav>
  );
}
