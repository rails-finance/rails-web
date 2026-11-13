"use client";

// The profile control (H20) and its menu (rails-ops ui-jobs 504, redrawn in
// 582 to Miles's mockup of 11 Nov 2026, cut into two sections to Miles's
// mockup of 13 Nov 2026). The menu has no heading of its own. Each section
// opens with a header in `MENU_SECTION_HEAD` (lib/shared/ui-grammar.ts):
//
// 1. "Saved views", with its bookmark, a link to /saved-views whatever is
//    saved (ui-jobs 652), link blue on hover; it never collapses. An inset
//    hairline under it, then: with nothing saved, "New to Rails? Start here"
//    to /start (ui-jobs 509); then the subgroups Focus, Listings, Wallets and
//    Positions, each under a small uppercase subheading.
// 2. A hairline across the whole panel, then "Advanced", a toggle holding the
//    switch "Inspector" (decision 0062; ui-jobs 571, 651).
//
// Advanced and each subgroup open and close from their heading: the subgroups
// start open, Advanced closed, and the reader's choice per group is kept in
// this browser (`OPEN_KEY`). The subheadings' toggles hang on one flag,
// `SUBGROUPS_COLLAPSE`. The chevron follows the dropdown rule for collapsible
// groups (lib/shared/ui-grammar.ts `disclosureChevron`): down and always shown
// while the group is closed; up while it is open, shown on the heading's
// hover or keyboard focus and always on a touch screen. The theme is set at
// the brand rail's foot from md and at the wallet panel's foot below md
// (components/nav/theme-switch.tsx).
//
// Stars alone decide what each group lists (ui-jobs 652): Focus lists the
// views starred on /saved-views?tab=focus and, while it is unstarred, the view
// in use, so Focus can always be turned off here; then Off
// (lib/shared/asset-scope.ts `menuViews`). Listings, Wallets and Positions
// list the items starred on /saved-views (lib/shared/sessions.ts
// `menuEntries`). A group with nothing to list is not drawn. Long names fade
// at the line's end (`FADE`); rows read nothing, showing what the browser
// holds.
//
// From md a dropdown under the control, right edges aligned, dropping in with
// a small bounce (globals.css `.profile-drop`), no taller than the window
// below it, scrolling within itself; below md a sheet from the foot of the
// screen over a dim (ui-jobs 507), rising over 220ms (`.profile-sheet`).
//
// The face is the first saved wallet's; with none, the sample wallet's
// (lib/shared/sample-wallet.ts). Until the browser's list is read a faint
// square holds the place.
//
// The menu is a portal positioned against the control, so it stands over the
// page wherever the control sits; from md it is placed in page coordinates and
// scrolls with the page as one piece with the control (ui-jobs 602) (H2 below md, the column's corner from md;
// components/nav/rail-shell.tsx). Escape, a press outside and a lookup close
// it, and focus returns to the control; the arrow keys, Home and End move
// through its items, the headings included and a closed group's rows left
// out; on a heading ArrowRight opens the group and ArrowLeft closes it.

import { CHROME_HOVER, CHROME_HOVER_ON } from "@/components/nav/chrome-hover";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Check, ChevronDown, CircleHelp, Crosshair, Signpost } from "lucide-react";

import { Facehash } from "@/components/shared/facehash";
import { FocusAvatar } from "@/components/shared/focus-avatar";
import { ViewIcons, viewName } from "@/components/shared/asset-scope-strip";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { savedName, useSavedLinks } from "@/components/shared/saved-items";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { focusViews, useAssetScope } from "@/lib/shared/asset-scope";
import { focusShort } from "@/components/shared/aim-gate";
import { DISCLOSURE_HEAD, MENU_SECTION_HEAD, START_CTA, disclosureChevron } from "@/lib/shared/ui-grammar";
import type { ChainId } from "@/lib/shared/chains";
import type { SavedLink, WalletSession } from "@/lib/shared/sessions";
import { setProvPreference, useProvPreference } from "@/lib/shared/prov-preference";
import { ProvInspectorIndicator, putDownInspector } from "@/components/shared/prov-inspector";
import { menuEntries } from "@/lib/shared/sessions";
import { SAVED_NAME, SAVED_PATH } from "@/components/shared/bookmarks-name";

/** The control's and the menu's accessible name: what the menu holds as a whole. */
const MENU_NAME = "Saved and settings";
/** The guided way in (G, /start), reached from this menu (ui-jobs 509). */
const START_PATH = "/start";
/** The gap kept under the dropdown when it scrolls within the window. */
const DROP_MARGIN = 16;

/** Whether the subheadings in Saved views open and close their subgroups
 *  (Miles 13 Nov 2026, to be confirmed). False draws them as plain labels
 *  with their subgroups always open. */
const SUBGROUPS_COLLAPSE = true;

/** The room between the subgroups; the first sits closer to the hairline. */
const GROUP = "mt-6 first:mt-3";
/** A row: 44px tall, a blue rounded outline on hover and keyboard focus. */
const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground outline-none transition-shadow hover:ring-1 hover:ring-blue-500 focus-visible:ring-[1.5px] focus-visible:ring-blue-500";
/** The Saved views header: the section head's look on a row's box, a link's
 *  hover in place of the ring, the bookmark and words turning link blue;
 *  keyboard focus adds the ring (Miles 13 Nov 2026). */
const SAVED_HEAD = `flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left ${MENU_SECTION_HEAD} outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:ring-[1.5px] focus-visible:ring-blue-500 dark:hover:text-[var(--text-link)] dark:focus-visible:text-[var(--text-link)]`;
/** The Advanced header: the section head's look, a toggle, the foreground on
 *  hover and keyboard focus. */
const SECTION_TOGGLE = `${DISCLOSURE_HEAD} flex min-h-11 w-full cursor-pointer items-center gap-1 rounded-lg px-3 text-left ${MENU_SECTION_HEAD} outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-[1.5px] focus-visible:ring-blue-500`;
/** The menu's hairline colour. */
const HAIRLINE = "border-t border-rb-200 dark:border-rb-700";
/** A long name fades at the line's end, with no ellipsis. */
const FADE =
  "min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]";
/** A subgroup's heading: the app's small label, muted. */
const SUBHEAD_TEXT = "text-[11px] font-medium uppercase tracking-wider text-rb-500";
/** As a toggle that opens and closes the subgroup (Miles 13 Nov 2026). */
const HEADING = `${DISCLOSURE_HEAD} flex min-h-8 w-full cursor-pointer items-center gap-1 rounded-lg px-3 text-left ${SUBHEAD_TEXT} outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-[1.5px] focus-visible:ring-blue-500`;
/** As a plain label, while `SUBGROUPS_COLLAPSE` is off. */
const HEADING_STATIC = `flex min-h-8 items-center px-3 ${SUBHEAD_TEXT}`;

type GroupKind = "focus" | "listings" | "wallets" | "positions" | "advanced";
/** Which groups stand open, kept per browser as a small JSON map. */
const OPEN_KEY = "rails-profile-menu-open";
/** Every group open but Advanced, so the inspector's switch waits to be asked for. */
const OPEN_DEFAULT: Record<GroupKind, boolean> = {
  focus: true,
  listings: true,
  wallets: true,
  positions: true,
  advanced: false,
};
function readOpen(): Record<GroupKind, boolean> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
    const next = { ...OPEN_DEFAULT };
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(OPEN_DEFAULT) as GroupKind[]) {
        const v = (raw as Record<string, unknown>)[k];
        if (typeof v === "boolean") next[k] = v;
      }
    }
    return next;
  } catch {
    return { ...OPEN_DEFAULT };
  }
}
function writeOpen(open: Record<GroupKind, boolean>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open));
  } catch {
    // Storage refused (a private window, a full quota): the choice lasts the visit.
  }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A group under its heading, a disclosure toggle that names the group
 *  (`aria-labelledby`). Closed, the rows are not drawn, so they leave the tab
 *  and arrow-key order. A subgroup of Saved views takes the small heading
 *  (`SUBGROUPS_COLLAPSE` off: a plain label, always open); the Advanced
 *  section takes the section header (`section`). */
function MenuGroup({
  menuId,
  group,
  label,
  open,
  onToggle,
  section = false,
  hook,
  children,
}: {
  menuId: string;
  group: GroupKind;
  label: string;
  open: boolean;
  onToggle: (g: GroupKind) => void;
  /** A section's header in place of a subgroup's heading. */
  section?: boolean;
  /** The group's own data attribute, for the verifiers. */
  hook?: Record<string, string>;
  children: ReactNode;
}) {
  const headId = `${menuId}-${group}`;
  const bodyId = `${headId}-rows`;
  const toggles = section || SUBGROUPS_COLLAPSE;
  const shown = open || !toggles;
  return (
    <div
      role="group"
      aria-labelledby={headId}
      className={section ? undefined : GROUP}
      data-open={shown ? "true" : "false"}
      {...hook}
    >
      {toggles ? (
        <button
          id={headId}
          type="button"
          role="menuitem"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(group)}
          className={section ? SECTION_TOGGLE : HEADING}
          data-profile-menu-group={group}
          data-profile-menu-group-toggle={group}
        >
          {label}
          <ChevronDown className={disclosureChevron(open)} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <div id={headId} className={HEADING_STATIC} data-profile-menu-group={group}>
          {label}
        </div>
      )}
      <div id={bodyId} hidden={!shown} className="mt-1">
        {shown && children}
      </div>
    </div>
  );
}

/** The radio mark of a Focus row: ticked for the view in use, or Off. */
function RadioMark({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${
        on
          ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-rb-950"
          : "border-rb-300 dark:border-rb-700"
      }`}
      aria-hidden="true"
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

function WalletRow({ session, onDone }: { session: WalletSession; onDone: () => void }) {
  const primary = session.addresses[0];
  const ens = session.ensNames[primary] || null;
  const name = session.customName || ens;
  return (
    <Link
      href={walletHref(primary)}
      role="menuitem"
      onClick={onDone}
      className={`${ITEM} gap-4`}
      data-profile-menu-wallet={primary}
    >
      <span className="shrink-0" style={{ borderRadius: 5, boxShadow: "0 0 0 2px var(--facehash-ring)" }}>
        <Facehash address={primary} size={22} />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{name ?? short(primary)}</span>
      {name && <span className="shrink-0 font-mono text-xs text-rb-500">{short(primary)}</span>}
    </Link>
  );
}

/** A saved listing or position: the explorer's and the chain's marks, then
 *  the name (a position's chain after it, muted), fading at the line's end. */
function LinkRow({ link, onDone }: { link: SavedLink; onDone: () => void }) {
  const chain = link.chain ? Number(link.chain.id) : NaN;
  const after = link.ended?.word ?? (link.kind === "position" ? link.chain?.name : undefined);
  return (
    <Link
      href={link.key}
      role="menuitem"
      onClick={onDone}
      className={ITEM}
      data-profile-menu-link={link.kind}
      data-href={link.key}
    >
      <span className="flex shrink-0 items-center gap-1.5 text-rb-500">
        <span className="flex size-4 items-center justify-center">
          {link.protocol && <ProtocolIcon id={link.protocol.id} className="size-4" />}
        </span>
        <span className="flex size-4 items-center justify-center">
          {Number.isInteger(chain) && <ChainGlyph chainId={chain as ChainId} className="h-4 w-auto" />}
        </span>
      </span>
      <span className={`${FADE} font-medium`}>
        {savedName(link)}
        {after && <span className="ml-3 font-normal text-rb-500">{after}</span>}
      </span>
    </Link>
  );
}

const PROV_ABOUT_PATH = "/about/provenance";
const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** The inspector's one switch, "Inspector" (decision 0062; ui-jobs 571, 625,
 *  651): arms the inspector on arrival on every page that has passed the
 *  coverage gate (lib/shared/prov-preference-routes.ts). Off by default.
 *
 *  One line, the height of the other rows. Its "?" is a link to
 *  /about/provenance that closes the menu; it is a sibling of the switch,
 *  standing over the switch's stretched hit area (`after:inset-0`), so a press
 *  on it navigates and never toggles (ui-jobs 602, 603, 651).
 *
 *  The switch reads the saved choice alone and toggles it on every page
 *  (Miles 13 Nov 2026); whether the page arms is the inspector's call
 *  (components/shared/prov-inspector.tsx, `provPreferenceAllows`). */
function ProvInspectorSwitch({ onDone }: { onDone: () => void }) {
  const on = useProvPreference();
  const descId = useId();
  return (
    <div
      // ITEM's row with no hover ring: on hover the crosshair and the label
      // turn teal, the switch's on colour (ui-jobs 651; Miles 13 Nov 2026).
      // The (?) stands over the switch's hit area, so hovering it turns
      // neither. The focus ring answers the keyboard.
      className="group/prov relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px] text-foreground has-[[role=menuitemcheckbox]:focus-visible]:ring-[1.5px] has-[[role=menuitemcheckbox]:focus-visible]:ring-blue-500"
      data-anatomy="H20.1"
    >
      <Crosshair
        className="size-5 shrink-0 transition-colors group-has-[[role=menuitemcheckbox]:hover]/prov:text-teal-600 dark:group-has-[[role=menuitemcheckbox]:hover]/prov:text-teal-400"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={on}
        aria-describedby={descId}
        onClick={() => {
          if (on) putDownInspector();
          else setProvPreference(true);
        }}
        className="min-w-0 truncate text-left outline-none transition-colors after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:text-teal-600 dark:hover:text-teal-400"
        data-profile-menu-prov={on ? "on" : "off"}
      >
        Inspector
      </button>
      <span id={descId} className="sr-only">
        Shows where each figure comes from.
      </span>
      <Link
        href={PROV_ABOUT_PATH}
        role="menuitem"
        aria-label="About the inspector"
        onClick={onDone}
        className="relative z-10 -ml-1.5 inline-flex rounded-full p-0.5 text-rb-400 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-[1.5px] focus-visible:ring-blue-500"
        data-profile-menu-prov-help=""
        data-profile-menu-prov-about=""
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </Link>
      <span
        className={`pointer-events-none relative ml-auto inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? "bg-teal-500" : "bg-rb-300 dark:bg-rb-700"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </div>
  );
}

export function ProfileMenu() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const pathname = usePathname();
  const scope = useAssetScope();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [place, setPlace] = useState<{
    top: number;
    right: number;
    room: number;
    phone: boolean;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // When a press outside closed the menu, the click that ends the same press
  // can land on the control under the dim and would open it again: a press on
  // the control's place closes it and leaves it closed (ui-jobs 507).
  const closedByPress = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => setMounted(true), []);
  const [groupsOpen, setGroupsOpen] = useState(OPEN_DEFAULT);
  // Read as the menu opens, before it paints, so another tab's choice holds too.
  useLayoutEffect(() => {
    if (open) setGroupsOpen(readOpen());
  }, [open]);
  const toggleGroup = useCallback(
    (g: GroupKind) => {
      const next = { ...groupsOpen, [g]: !groupsOpen[g] };
      setGroupsOpen(next);
      writeOpen(next);
    },
    [groupsOpen],
  );

  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  const rows = menuEntries(bookmarks ?? []);
  const listings = menuEntries(views ?? []);
  const held = menuEntries(positions ?? []);
  const focusOn = scope.ready && scope.on;
  const menuViews = scope.menuViews;
  /** Anything saved, starred or not, focus views included, takes "Start here"
   *  out of the menu. */
  const anything =
    !!bookmarks?.length || !!views?.length || !!positions?.length || (scope.ready && scope.views.length > 0);
  const focusLabel = scope.active?.name || focusShort(scope.picks, scope.chains);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  const done = useCallback(() => close(false), [close]);

  // A navigation closes it.
  useEffect(() => setOpen(false), [pathname]);

  // Placed under the control: from md its right edge on the control's, below
  // md across the viewport. The dropdown is placed in page coordinates
  // (`position: absolute` against the document), so the browser scrolls it
  // with the page in the same frame as the control; a fixed box re-placed
  // from a scroll listener trails the page by a frame (ui-jobs 602). `room`
  // is the window's height below the control at opening, the dropdown's
  // ceiling.
  const measure = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setPlace({
      top: r.bottom + 8 + window.scrollY,
      right: document.documentElement.clientWidth - r.right,
      room: window.innerHeight - (r.bottom + 8) - DROP_MARGIN,
      phone: window.innerWidth < 768,
    });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Below md the sheet holds the page still under it, as the wallet panel
  // does, and scrolls within itself past 85% of the screen (ui-jobs 507).
  useEffect(() => {
    if (!open || window.innerWidth >= 768) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>(ITEMS)?.focus());
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) {
        closedByPress.current = performance.now();
        close(false);
      }
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
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        // On a group's heading, ArrowRight opens it and ArrowLeft closes it.
        const head = document.activeElement as HTMLElement | null;
        if (!head?.hasAttribute("data-profile-menu-group-toggle")) return;
        e.preventDefault();
        if ((head.getAttribute("aria-expanded") === "true") === (e.key === "ArrowLeft")) head.click();
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

  // A group is drawn only when it holds something (ui-jobs 586).
  const linkGroups = [
    { kind: "listings", label: "Listings", rows: listings },
    { kind: "positions", label: "Positions", rows: held },
  ] as const;
  const linkGroup = (g: (typeof linkGroups)[number]) =>
    g.rows.length > 0 && (
      <MenuGroup
        key={g.kind}
        menuId={menuId}
        group={g.kind}
        label={g.label}
        open={groupsOpen[g.kind]}
        onToggle={toggleGroup}
      >
        <div data-profile-menu-links={g.kind}>
          {g.rows.map((l) => (
            <LinkRow key={l.key} link={l} onDone={done} />
          ))}
        </div>
      </MenuGroup>
    );

  return (
    <>
      {/* While the inspector is armed on a page with a traced value, the
          inspector indicator stands left of the control (ui-jobs 624.2,
          651). */}
      <ProvInspectorIndicator />
      <button
        ref={trigger}
        type="button"
        aria-label={focusOn ? `${MENU_NAME}. Focus mode: ${focusLabel}` : MENU_NAME}
        title={focusOn ? `Focus mode: ${focusLabel}` : MENU_NAME}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (performance.now() - closedByPress.current < 600) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-anatomy="H20"
        data-profile-face={face ?? undefined}
        // Neutral, with the chrome's tile on hover and while open (ui-jobs
        // 516): the menu opens in place. Below sm an invisible band takes the
        // press to 44px tall without moving the header.
        className={`relative flex shrink-0 cursor-pointer items-center gap-0.5 rounded-lg py-[9px] pl-[9px] pr-1 max-sm:before:absolute max-sm:before:-inset-y-[3px] max-sm:before:inset-x-0 max-sm:before:content-[''] text-foreground transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          open ? CHROME_HOVER_ON : CHROME_HOVER
        }`}
      >
        <FocusAvatar face={face} />
        <ChevronDown className={`size-3.5 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {mounted &&
        open &&
        place &&
        createPortal(
          <>
            {/* Below md the sheet dims the page under it, as the wallet
                panel's scrim does (H16.1); a press on it closes the sheet. */}
            {place.phone && (
              <div
                aria-hidden="true"
                className="fixed inset-0 z-[var(--z-popover)] bg-white/60 dark:bg-rb-950/70"
                data-profile-menu-scrim=""
              />
            )}
            <div
              ref={menu}
              id={menuId}
              role="menu"
              aria-label={MENU_NAME}
              data-profile-menu=""
              data-profile-menu-variant={place.phone ? "sheet" : "drop"}
              className={`${place.phone ? "fixed" : "absolute"} z-[var(--z-popover)] overflow-y-auto overscroll-contain border border-rb-200 bg-background px-3 pb-4 pt-3 shadow-xl dark:border-rb-800 dark:bg-rb-900 ${
                place.phone
                  ? "profile-sheet inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-x-0 border-b-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
                  : "profile-drop w-80 rounded-xl"
              }`}
              // The dropdown stops above the window's foot and scrolls within
              // itself (ui-jobs 586).
              style={place.phone ? undefined : { top: place.top, right: place.right, maxHeight: place.room }}
            >
              {/* The first section, Saved views: its header is the way to
                  /saved-views, whatever is saved, and never collapses (Miles
                  13 Nov 2026, mockup; ui-jobs 652). */}
              <div role="group" aria-labelledby={`${menuId}-saved`} data-profile-menu-section="saved">
                <Link
                  id={`${menuId}-saved`}
                  href={SAVED_PATH}
                  role="menuitem"
                  onClick={done}
                  className={SAVED_HEAD}
                  data-profile-menu-bookmarks=""
                >
                  <Bookmark className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                  {SAVED_NAME}
                </Link>
                {/* Inset: the hairline stays inside the panel's padding. */}
                <div aria-hidden="true" className={`mt-1 ${HAIRLINE}`} data-profile-menu-rule="inset" />
                <div data-profile-menu-saved-body="">
                  {/* With nothing saved, the way in (ui-jobs 509). */}
                  {!anything && (
                    <Link
                      href={START_PATH}
                      role="menuitem"
                      onClick={done}
                      className={`mt-3 flex w-full ${START_CTA}`}
                      data-profile-menu-start=""
                    >
                      New to Rails? Start here
                      <Signpost className="ml-auto size-4 shrink-0" aria-hidden="true" />
                    </Link>
                  )}
                  {/* Focus: the starred views, the view in use, and Off (ui-jobs 652). */}
                  {menuViews.length > 0 && (
                    <MenuGroup
                      menuId={menuId}
                      group="focus"
                      label="Focus"
                      open={groupsOpen.focus}
                      onToggle={toggleGroup}
                      hook={{ "data-profile-menu-focus": "" }}
                    >
                      <div data-profile-menu-focus-views={menuViews.length}>
                        <>
                          {menuViews.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={scope.active?.id === v.id}
                              onClick={() => focusViews.use(v.id)}
                              className={ITEM}
                              data-profile-menu-focus-view={v.id}
                            >
                              <RadioMark on={scope.active?.id === v.id} />
                              <span className="flex min-w-0 flex-1 items-center">
                                <ViewIcons picks={v.assets} chains={v.chains} />
                                <span className={`${FADE} ml-1 font-medium`}>{viewName(v)}</span>
                              </span>
                            </button>
                          ))}
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={!scope.on}
                            onClick={() => scope.clear()}
                            className={ITEM}
                            data-profile-menu-focus-off=""
                          >
                            <RadioMark on={!scope.on} />
                            Off
                          </button>
                        </>
                      </div>
                    </MenuGroup>
                  )}
                  {linkGroup(linkGroups[0])}
                  {rows.length > 0 && (
                    <MenuGroup
                      menuId={menuId}
                      group="wallets"
                      label="Wallets"
                      open={groupsOpen.wallets}
                      onToggle={toggleGroup}
                    >
                      <div data-profile-menu-wallets="">
                        {rows.map((s) => (
                          <WalletRow key={s.key} session={s} onDone={done} />
                        ))}
                      </div>
                    </MenuGroup>
                  )}
                  {linkGroup(linkGroups[1])}
                </div>
              </div>
              {/* The second section: a hairline across the whole panel, through
                  its padding, then Advanced (Miles 13 Nov 2026, mockup). */}
              <div aria-hidden="true" className={`-mx-3 mt-4 mb-2 ${HAIRLINE}`} data-profile-menu-rule="full" />
              <MenuGroup
                menuId={menuId}
                group="advanced"
                label="Advanced"
                open={groupsOpen.advanced}
                onToggle={toggleGroup}
                section
                hook={{ "data-profile-menu-section": "advanced" }}
              >
                <ProvInspectorSwitch onDone={done} />
              </MenuGroup>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
