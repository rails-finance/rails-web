"use client";

// RailHeader — the title row on every explorer surface (rails-ops TO-DO-ui-jobs
// 68, 497, 514, 680). The protocol's identity (ProtocolIdentity), the chain's
// glyph after the name (ChainLabel), then the sections menu (SectionsMenu,
// H5): the current section's name and a chevron, opening the explorer's
// sections as links — a front-door explorer's front door ("Overview"), the
// position listing (named by the protocol's noun:
// Troves, Vaults, Accounts; absent on an explorer that has none), each of the
// roster's sub-pages in order (Markets, Branches, System, …), then About, the
// info page. On a sub-page the current section is the one whose route holds
// the pathname, so a sub-page's nested routes (Morpho's markets/[loanToken])
// mark their parent. Under the sections, where the version is launched on
// more than one chain, the chain row: "Chain" and a glyph per chain, the
// current one on a raised tile (ui-jobs 854). A listing draws the recency
// stamp on a row under it.
//
// A POSITION PAGE DRAWS NO RAIL HEADER (rails-ops decisions/0052): the
// wallet heading is its frame, with a line naming the protocol and linking
// to its listing (components/shared/wallet-heading.tsx).

import { LifecycleLine } from "@/components/shared/lifecycle-line";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { SessionProtocol } from "@/lib/shared/sessions";
import {
  explorerChains,
  explorerSections,
  protocolForSession,
  subPageForPathname,
  type ExplorerChain,
} from "@/lib/shared/protocols";
import { ProtocolIdentity } from "@/components/shared/protocol-identity";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { TAB_BASE } from "@/lib/shared/ui-grammar";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

/** The explorer's chain, muted, a label and not a control. On the title row
 *  its glyph alone follows the protocol's name (Miles, 6 Nov 2026, ui-jobs
 *  514), the chain's name its accessible name; under N5's name (`named`) the
 *  glyph and the name in the rail's small caps. */
export function ChainLabel({
  chainId,
  className = "",
  named = false,
  anatomy = "H3.2",
}: {
  chainId: ChainId;
  className?: string;
  named?: boolean;
  /** The part it is drawn as: the rail's H3.2; null inside another part (the asset page's h1). */
  anatomy?: string | null;
}) {
  const chain = CHAINS[chainId];
  if (!chain) return null;
  if (named)
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 text-rb-500 ${className}`}
        data-chain-label={chain.slug}
        data-anatomy={anatomy ?? undefined}
      >
        <ChainGlyph chainId={chain.id} className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{chain.name}</span>
      </span>
    );
  return (
    <span
      role="img"
      aria-label={chain.name}
      className={`inline-flex shrink-0 items-center text-rb-500 ${className}`}
      data-chain-label={chain.slug}
      data-anatomy={anatomy ?? undefined}
    >
      <ChainGlyph chainId={chain.id} className="h-5 w-5" />
    </span>
  );
}

/** Which surface of the rail is being looked at — decides the lit slot. */
export type RailVenue = "listing" | "subPage" | "info";

// The tabs' type (TAB_BASE, lib/shared/ui-grammar.ts): every tab carries the
// bottom border so the active underline never shifts the baseline. The saved
// tabs (B4) wear these.
export const TAB_ACTIVE = `${TAB_BASE} border-current text-foreground`;
export const TAB_IDLE = `${TAB_BASE} border-transparent text-rb-500 transition-colors hover:text-blue-600 dark:hover:text-[var(--text-link)]`;

/** A menu row: 44px tall, neutral at rest, link blue on hover and keyboard
 *  focus (each row opens another page; color-grammar §4a), the blue focus
 *  ring as the profile menu's rows (H20). */
const SECTION_ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:ring-[1.5px] focus-visible:ring-blue-500 dark:hover:text-[var(--text-link)] dark:focus-visible:text-[var(--text-link)]";

/** A glyph in the chain row: a 44px tile, muted at rest, link blue on hover
 *  and keyboard focus as SECTION_ITEM; the current chain on the chooser's
 *  raised tile (H4). */
const CHAIN_ITEM =
  "flex size-11 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:ring-[1.5px] focus-visible:ring-blue-500 dark:hover:text-[var(--text-link)] dark:focus-visible:text-[var(--text-link)]";

const ITEMS = '[role="menuitem"]';

export interface Section {
  href: string;
  name: string;
  current: boolean;
}

/** The explorer's sections as a menu after the chain's glyph (H5; Miles
 *  14 Nov 2026, ui-jobs 680). The trigger names the current section, muted,
 *  the foreground on hover and while open. Each section is a link, so a
 *  modifier press opens it in a new tab. The menu stays in the page while
 *  closed (`hidden`), so the links are there to read without opening it.
 *  Keyboard as the profile menu (H20): the current row takes focus on
 *  opening; the arrow keys, Home and End move through the rows; Escape closes
 *  it and returns focus to the trigger; Tab, a press outside and a
 *  navigation close it. The /vaults head draws it too (ui-jobs 776), with
 *  no chain row. `chains` (explorerChains) draws the chain row under the
 *  sections, its glyphs menu items after them in the arrow-key order
 *  (ui-jobs 854); fewer than two draw none. Below sm it opens as the
 *  shared sheet (MobileSheet), as the Positions menu does, with no visible
 *  heading: the sheet and its menu are named for a screen reader alone
 *  (ui-jobs 855); the closed menu stays in the page there too, and Back is
 *  left to the page, as the rows navigate. */
export function SectionsMenu({
  sections,
  chains = [],
  label = "Explorer sections",
}: {
  sections: Section[];
  chains?: ExplorerChain[];
  /** The nav's accessible name; /vaults names its own (ui-jobs 776). */
  label?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const triggerId = useId();
  const chainLabelId = useId();
  const sheetChainLabelId = useId();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const sheet = useRef<HTMLDivElement>(null);
  const current = sections.find((s) => s.current);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    // The open rows: the sheet's below sm, the drop's from sm.
    const rows = () => (isPhone ? sheet.current : menu.current);
    // A timeout, not a frame: the sheet's rows mount after this effect runs.
    const first = window.setTimeout(() => {
      const items = rows()?.querySelectorAll<HTMLElement>(ITEMS);
      (rows()?.querySelector<HTMLElement>('[aria-current="page"]') ?? items?.[0])?.focus({ preventScroll: true });
    });
    // The sheet closes from its scrim and Escape, and holds Tab; its rows are
    // portalled outside `wrap`.
    const onPointer = (e: PointerEvent) => {
      if (!isPhone && !wrap.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPhone) return;
        e.preventDefault();
        close();
        return;
      }
      const box = rows();
      if (!box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(ITEMS));
      const at = items.indexOf(document.activeElement as HTMLElement);
      const go = (i: number) => items[(i + items.length) % items.length]?.focus();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        go(at + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        go(at - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(items.length - 1);
      } else if (e.key === "Tab") {
        // The drop closes on Tab. The sheet holds it: its rows sit out of the
        // tab order, so Tab moves through them as the arrows do. The sheet's
        // trap also wraps at the ends; the move waits for the press to
        // finish, so whichever handler runs first, focus moves once.
        if (!isPhone) close(false);
        else if (!e.defaultPrevented) {
          e.preventDefault();
          const to = at + (e.shiftKey ? -1 : 1);
          window.setTimeout(() => go(to));
        }
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, isPhone]);

  // The rows, drawn in the drop (in the page, `hidden` while closed) and in
  // the sheet below sm while open; each copy gives its chain label a separate id.
  const rowsFor = (labelId: string) => (
    <>
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          role="menuitem"
          // Out of the tab order: the arrow keys move between the rows,
          // and Tab leaves the menu.
          tabIndex={-1}
          aria-current={s.current ? "page" : undefined}
          onClick={() => close(false)}
          className={`${SECTION_ITEM} ${s.current ? "font-semibold" : ""}`}
        >
          <span className="min-w-0 flex-1 truncate">{s.name}</span>
          {s.current && <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
        </Link>
      ))}
      {chains.length > 1 && (
        <>
          <div role="separator" className="mx-1 my-2 border-t border-rb-200 dark:border-rb-800" />
          <span
            id={labelId}
            role="presentation"
            className="block px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rb-500"
          >
            Chain
          </span>
          <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1" data-sections-chains="">
            {chains.map((c) => {
              const chain = CHAINS[c.chainId];
              return (
                <Link
                  key={c.chainId}
                  href={c.href}
                  role="menuitem"
                  tabIndex={-1}
                  aria-label={chain.name}
                  aria-current={c.current ? "true" : undefined}
                  title={chain.name}
                  onClick={() => close(false)}
                  data-sections-chain={chain.slug}
                  className={`${CHAIN_ITEM} ${c.current ? "bg-rb-200 text-foreground dark:bg-rb-700" : "text-rb-500"}`}
                >
                  <ChainGlyph chainId={c.chainId} className="h-5 w-5" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  return (
    <nav ref={wrap} aria-label={label} className="relative shrink-0" data-anatomy="H5">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // The drop is hidden below sm, where the sheet stands in for it.
        aria-controls={isPhone ? undefined : menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-sections-trigger=""
        // A 28px row with a 44px press area (after:), as the address menu's
        // trigger (C7).
        className={`relative flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[15px] font-medium leading-none transition-colors focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] ${
          open ? "text-foreground" : "text-rb-500 hover:text-foreground"
        }`}
      >
        {current?.name ?? "Sections"}
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div
        ref={menu}
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        hidden={!open || isPhone}
        data-sections-menu=""
        // Under the trigger: its left edge on the trigger's from sm, its right
        // edge on the trigger's below sm, so it stays inside a phone's width.
        className="profile-drop absolute right-0 top-full sm:right-auto sm:left-0 z-[var(--z-dropdown)] mt-2 w-52 rounded-xl border border-rb-200 bg-background p-2 shadow-xl dark:border-rb-800 dark:bg-rb-900"
      >
        {rowsFor(chainLabelId)}
      </div>
      {open && isPhone && (
        <MobileSheet label={label} onClose={close}>
          <div ref={sheet} role="menu" aria-label="Sections" data-sections-sheet="" className="py-1">
            {rowsFor(sheetChainLabelId)}
          </div>
        </MobileSheet>
      )}
    </nav>
  );
}

export function RailHeader({
  session,
  venue,
  stamp = false,
}: {
  session: SessionProtocol;
  venue: RailVenue;
  /** Render the shared RecencyStamp on a row under the title (decision 0006's
   *  freshness signal). On for listings; off where the page reads no chain
   *  head (the info page). A node takes its place where the rows come from a
   *  read behind the head (Aave V3's hourly refresh, ui-jobs 806). */
  stamp?: boolean | ReactNode;
}) {
  const pathname = usePathname();
  const entry = protocolForSession(session);
  if (!entry) return null;
  // An explorer with no position listing redirects its own route to its first
  // sub-page (/ethereum/yearn), so that sub-page is current
  // while the redirect lands.
  const litSubPage =
    venue === "subPage"
      ? subPageForPathname(entry, pathname)
      : venue === "listing" && entry.positionListing === false
        ? entry.subPages[0]
        : undefined;
  // The menu's entries (explorerSections, lib/shared/protocols.ts): a front
  // door is never current, as it draws no rail header.
  const all = explorerSections(entry);
  const isCurrent = (x: (typeof all)[number]) =>
    x.kind === "listing"
      ? venue === "listing"
      : x.kind === "info"
        ? venue === "info"
        : x.kind === "subPage" && x.sub === litSubPage;
  const sections: Section[] = all.map((x) => ({ href: x.href, name: x.name, current: isCurrent(x) }));
  // The same protocol on its other launched chains (ui-jobs 854).
  const chains = explorerChains(entry, all.find(isCurrent));
  return (
    <div className="flex flex-col gap-2">
      {/* The page's largest type (rails-ops TO-DO-ui-jobs 67), set in
          ProtocolIdentity. `min-w-0` lets a long name give way first, so the
          chain's glyph and the sections menu stay on the line. */}
      <div className="flex items-center gap-3" data-anatomy="H3">
        <div className="flex min-w-0">
          {/* Plain text where the sections menu is the way to the explorer's
              pages (ui-jobs 786); an explorer with About alone draws no menu,
              so its title keeps the link back to its route. */}
          <ProtocolIdentity session={session} scale="title" linked={sections.length <= 1} />
        </div>
        <ChainLabel chainId={entry.chainId} />
        {/* An explorer with one section (About alone) draws no menu. */}
        {sections.length > 1 && <SectionsMenu sections={sections} chains={chains} />}
      </div>
      {/* A closing or closed explorer says so on every venue (H24.1; ui-jobs 612, 621). */}
      <LifecycleLine id={entry.id} />
      {/* The stamp stands at the right, as it does on every page head (ui-jobs 730).
          Its line is held from first paint, so the stamp's arrival moves
          nothing under it. */}
      {stamp && (
        <div className="flex min-h-7 items-center justify-end">{stamp === true ? <RecencyStamp /> : stamp}</div>
      )}
    </div>
  );
}
