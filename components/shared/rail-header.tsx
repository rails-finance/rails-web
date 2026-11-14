"use client";

// RailHeader — the title row on every explorer surface (rails-ops TO-DO-ui-jobs
// 68, 497, 514, 680). The protocol's identity (ProtocolIdentity), the chain's
// glyph after the name (ChainLabel), then the sections menu (SectionsMenu,
// H5): the current section's name and a chevron, opening the explorer's
// sections as links — the position listing (named by the protocol's noun:
// Troves, Vaults, Accounts; absent on an explorer that has none), each of the
// roster's sub-pages in order (Markets, Branches, System, …), then About, the
// info page. On a sub-page the current section is the one whose route holds
// the pathname, so a sub-page's nested routes (Morpho's markets/[loanToken])
// mark their parent. A listing draws the recency stamp on a row under it.
//
// A POSITION PAGE DRAWS NO RAIL HEADER (rails-ops decisions/0052): the
// wallet heading is its frame, with a line naming the protocol and linking
// to its listing (components/shared/wallet-heading.tsx).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { positionNounPlural, protocolForSession, subPageForPathname } from "@/lib/shared/protocols";
import { ProtocolIdentity } from "@/components/shared/protocol-identity";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { TAB_BASE } from "@/lib/shared/ui-grammar";

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

/** The info page's name in the sections menu, as the front door's link (N5). */
const ABOUT = "About";

/** A menu row: 44px tall, neutral at rest, link blue on hover and keyboard
 *  focus (each row opens another page; color-grammar §4a), the blue focus
 *  ring as the profile menu's rows (H20). */
const SECTION_ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:ring-[1.5px] focus-visible:ring-blue-500 dark:hover:text-[var(--text-link)] dark:focus-visible:text-[var(--text-link)]";

const ITEMS = '[role="menuitem"]';

interface Section {
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
 *  navigation close it. */
function SectionsMenu({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const triggerId = useId();
  const current = sections.find((s) => s.current);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const first = requestAnimationFrame(() => {
      const items = menu.current?.querySelectorAll<HTMLElement>(ITEMS);
      (menu.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? items?.[0])?.focus();
    });
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (!menu.current) return;
      const items = Array.from(menu.current.querySelectorAll<HTMLElement>(ITEMS));
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
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(first);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <nav ref={wrap} aria-label="Explorer sections" className="relative shrink-0" data-anatomy="H5">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
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
        hidden={!open}
        data-sections-menu=""
        // Under the trigger: its left edge on the trigger's from sm, its right
        // edge on the trigger's below sm, so it stays inside a phone's width.
        className="profile-drop absolute right-0 top-full sm:right-auto sm:left-0 z-[var(--z-dropdown)] mt-2 w-52 rounded-xl border border-rb-200 bg-background p-2 shadow-xl dark:border-rb-800 dark:bg-rb-900"
      >
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
      </div>
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
   *  head (the info page). */
  stamp?: boolean;
}) {
  const pathname = usePathname();
  const entry = protocolForSession(session);
  if (!entry) return null;
  // An explorer with no position listing redirects its own route to its first
  // sub-page (/ethereum/aave, /ethereum/yearn), so that sub-page is current
  // while the redirect lands.
  const litSubPage =
    venue === "subPage"
      ? subPageForPathname(entry, pathname)
      : venue === "listing" && entry.positionListing === false
        ? entry.subPages[0]
        : undefined;
  const sections: Section[] = [
    // A vault-native explorer has no position listing — a share in a vault is
    // not a position in the roster's sense (rails-ops decision 0027 call 2) —
    // so its first section is its first sub-page.
    ...(entry.positionListing !== false
      ? [{ href: entry.listingHref, name: positionNounPlural(session), current: venue === "listing" }]
      : []),
    ...entry.subPages.map((sub) => ({ href: sub.href, name: sub.tab, current: sub === litSubPage })),
    { href: entry.infoHref, name: ABOUT, current: venue === "info" },
  ];
  return (
    <div className="flex flex-col gap-2">
      {/* The page's largest type (rails-ops TO-DO-ui-jobs 67), set in
          ProtocolIdentity. `min-w-0` lets a long name give way first, so the
          chain's glyph and the sections menu stay on the line. */}
      <div className="flex items-center gap-3" data-anatomy="H3">
        <div className="flex min-w-0">
          <ProtocolIdentity session={session} scale="title" />
        </div>
        <ChainLabel chainId={entry.chainId} />
        {/* An explorer with one section (About alone) draws no menu. */}
        {sections.length > 1 && <SectionsMenu sections={sections} />}
      </div>
      {stamp && (
        <div className="flex items-center">
          <RecencyStamp />
        </div>
      )}
    </div>
  );
}
