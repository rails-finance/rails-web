"use client";

// The profile control (H20) and its menu (rails-ops ui-jobs 504, redrawn in
// 582 to Miles's mockup of 11 Nov 2026). The menu has no heading of its own.
// Top down: the theme as a three-way segment; with nothing saved, "New to
// Rails? Start here" to /start (ui-jobs 509); then four groups, Focus,
// Listings, Wallets and Positions, each under a heading that links to its tab
// on /bookmarks (a cog at the group's right on hover or keyboard focus; on a
// touch screen see HEADING_TOUCH); last, Advanced, holding the provenance
// inspector switch (decision 0062; ui-jobs 571).
//
// Focus offers one saved view, the one chosen on /bookmarks?tab=focus (else
// the view in use, else the first saved; lib/shared/asset-scope.ts
// `menuView`), and Off. Listings, Wallets and Positions each list the items
// starred on /bookmarks, up to five, or with none starred the first five, in
// the reader's order (ui-jobs 586; lib/shared/sessions.ts `menuEntries`). A
// group is drawn only when it holds something. Long names fade at the line's
// end (`FADE`); rows read nothing, showing what the browser holds.
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
// page wherever the control sits (H2 below md, the column's corner from md;
// components/nav/rail-shell.tsx). Escape, a press outside and a lookup close
// it, and focus returns to the control; the arrow keys, Home and End move
// through its items.

import { CHROME_HOVER, CHROME_HOVER_ON } from "@/components/nav/chrome-hover";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, CircleHelp, Crosshair, Monitor, Moon, Settings, Signpost, Sun } from "lucide-react";
import { useTheme } from "next-themes";

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
import { START_CTA } from "@/lib/shared/ui-grammar";
import type { ChainId } from "@/lib/shared/chains";
import type { SavedLink, WalletSession } from "@/lib/shared/sessions";
import { setProvPreference, useProvPreference } from "@/lib/shared/prov-preference";
import { menuEntries } from "@/lib/shared/sessions";

const BOOKMARKS_PATH = "/bookmarks";
/** The control's and the menu's accessible name: what the menu holds as a whole. */
const MENU_NAME = "Saved and settings";
/** The guided way in (G, /start), reached from this menu (ui-jobs 509). */
const START_PATH = "/start";
/** The gap kept under the dropdown when it scrolls within the window. */
const DROP_MARGIN = 16;

/** The room between the menu's groups (Miles's mockup: about 32px). */
const GROUP = "mt-8";
/** A row: 44px tall, a blue rounded outline on hover and keyboard focus. */
const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground outline-none transition-shadow hover:ring-1 hover:ring-blue-500 focus-visible:ring-[1.5px] focus-visible:ring-blue-500";
/** A long name fades at the line's end, with no ellipsis. */
const FADE =
  "min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]";
/** A group's label, muted (Advanced; the linked headings add the blue). */
const LABEL = "px-3 text-[15px] text-rb-500";

/** On a touch screen nothing hovers, so a heading shows that it links in one
 *  of two ways. The cog always shown, muted, is in use; Miles is weighing the
 *  headings drawn blue instead. Swap `HEADING_TOUCH` to change it. */
const TOUCH_HEADINGS = {
  cog: { head: "", cog: "[@media(hover:none)]:opacity-100" },
  blue: { head: "[@media(hover:none)]:text-blue-600 dark:[@media(hover:none)]:text-[var(--text-link)]", cog: "" },
} as const;
const HEADING_TOUCH = TOUCH_HEADINGS.cog;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A group's heading: a link to its tab on /bookmarks, blue with the cog at
 *  the group's right on hover or keyboard focus. */
function GroupHeading({
  id,
  group,
  tab,
  label,
  onDone,
}: {
  id: string;
  group: string;
  tab: string;
  label: string;
  onDone: () => void;
}) {
  return (
    <Link
      id={id}
      href={`${BOOKMARKS_PATH}?tab=${tab}`}
      role="menuitem"
      onClick={onDone}
      className={`group/head flex min-h-8 items-center justify-between rounded-lg text-rb-500 outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 dark:hover:text-[var(--text-link)] dark:focus-visible:text-[var(--text-link)] ${LABEL} ${HEADING_TOUCH.head}`}
      data-profile-menu-group={group}
    >
      {label}
      <Settings
        className={`size-[18px] shrink-0 opacity-0 transition-opacity group-hover/head:opacity-100 group-focus-visible/head:opacity-100 ${HEADING_TOUCH.cog}`}
        aria-hidden="true"
      />
    </Link>
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

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Auto", Icon: Monitor },
] as const;

/** Light, dark or the system's: a three-way segment, the one chosen on a
 *  raised tile. */
function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Theme" className="flex gap-1" data-profile-menu-theme="">
      {THEMES.map(({ value, label, Icon }) => {
        const on = (theme ?? "system") === value;
        return (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => setTheme(value)}
            className={`flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm transition-colors outline-none focus-visible:ring-[1.5px] focus-visible:ring-blue-500 ${
              on
                ? "bg-rb-100 font-medium text-foreground dark:bg-rb-800"
                : "text-rb-500 hover:text-foreground hover:ring-1 hover:ring-blue-500"
            }`}
            data-theme-option={value}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const PROV_HELP =
  "Keeps the inspector on across the pages that support it: click an underlined figure to see where it comes from.";

/** The standing provenance inspector (decision 0062; ui-jobs 571): arms the
 *  inspector on arrival on every page that has passed the coverage gate
 *  (lib/shared/prov-preference-routes.ts). Off by default. */
function ProvInspectorSwitch() {
  const on = useProvPreference();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={() => setProvPreference(!on)}
      className={ITEM}
      data-anatomy="H20.1"
      data-profile-menu-prov={on ? "on" : "off"}
    >
      <Crosshair className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate">Provenance inspector</span>
        <span className="inline-flex shrink-0 text-rb-400" title={PROV_HELP} data-profile-menu-prov-help="">
          <CircleHelp className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{PROV_HELP}</span>
        </span>
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
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
    </button>
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

  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  // The starred of each kind, or the first five (ui-jobs 586).
  const rows = menuEntries(bookmarks ?? []);
  const listings = menuEntries(views ?? []);
  const held = menuEntries(positions ?? []);
  const focusOn = scope.ready && scope.on;
  const menuView = scope.menuView;
  /** Anything saved, focus views included, takes "Start here" out of the menu. */
  const anything = rows.length > 0 || listings.length > 0 || held.length > 0 || (scope.ready && scope.views.length > 0);
  const focusLabel = scope.active?.name || focusShort(scope.picks, scope.chains);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  const done = useCallback(() => close(false), [close]);

  // A navigation closes it.
  useEffect(() => setOpen(false), [pathname]);

  // Placed under the control: from md its right edge on the control's, below
  // md across the viewport.
  const measure = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setPlace({
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
      phone: window.innerWidth < 768,
    });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
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
    { kind: "listings", tab: "listings", label: "Listings", rows: listings },
    { kind: "positions", tab: "positions", label: "Positions", rows: held },
  ] as const;
  const linkGroup = (g: (typeof linkGroups)[number]) =>
    g.rows.length > 0 && (
      <div key={g.kind} role="group" aria-labelledby={`${menuId}-${g.kind}`} className={GROUP}>
        <GroupHeading id={`${menuId}-${g.kind}`} group={g.kind} tab={g.tab} label={g.label} onDone={done} />
        <div className="mt-1" data-profile-menu-links={g.kind}>
          {g.rows.map((l) => (
            <LinkRow key={l.key} link={l} onDone={done} />
          ))}
        </div>
      </div>
    );

  return (
    <>
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
              className={`fixed z-[var(--z-popover)] overflow-y-auto overscroll-contain border border-rb-200 bg-background px-3 pb-4 pt-3 shadow-xl dark:border-rb-800 dark:bg-rb-900 ${
                place.phone
                  ? "profile-sheet inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-x-0 border-b-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
                  : "profile-drop w-80 rounded-xl"
              }`}
              // The dropdown stops above the window's foot and scrolls within
              // itself (ui-jobs 586).
              style={
                place.phone
                  ? undefined
                  : { top: place.top, right: place.right, maxHeight: `calc(100dvh - ${place.top + DROP_MARGIN}px)` }
              }
            >
              <ThemeSwitch />
              {/* With nothing saved, the way in, after the theme (Miles, 11
                  Nov 2026); with anything saved there is none (ui-jobs 509). */}
              {!anything && (
                <Link
                  href={START_PATH}
                  role="menuitem"
                  onClick={done}
                  className={`mt-6 flex w-full ${START_CTA}`}
                  data-profile-menu-start=""
                >
                  New to Rails? Start here
                  <Signpost className="ml-auto size-4 shrink-0" aria-hidden="true" />
                </Link>
              )}
              {/* Focus: the one view chosen for this menu and Off (ui-jobs
                  582); the others are on /bookmarks?tab=focus. */}
              {menuView && (
                <div role="group" aria-labelledby={`${menuId}-focus`} className={GROUP} data-profile-menu-focus="">
                  <GroupHeading id={`${menuId}-focus`} group="focus" tab="focus" label="Focus" onDone={done} />
                  <div className="mt-1" data-profile-menu-focus-views={scope.views.length}>
                    <>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={scope.active?.id === menuView.id}
                        onClick={() => focusViews.use(menuView.id)}
                        className={ITEM}
                        data-profile-menu-focus-view={menuView.id}
                      >
                        <RadioMark on={scope.active?.id === menuView.id} />
                        <span className="flex min-w-0 flex-1 items-center">
                          <ViewIcons picks={menuView.assets} chains={menuView.chains} />
                          <span className={`${FADE} ml-1 font-medium`}>{viewName(menuView)}</span>
                        </span>
                      </button>
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
                </div>
              )}
              {linkGroup(linkGroups[0])}
              {rows.length > 0 && (
                <div role="group" aria-labelledby={`${menuId}-wallets`} className={GROUP}>
                  <GroupHeading id={`${menuId}-wallets`} group="wallets" tab="wallets" label="Wallets" onDone={done} />
                  <div className="mt-1" data-profile-menu-wallets="">
                    {rows.map((s) => (
                      <WalletRow key={s.key} session={s} onDone={done} />
                    ))}
                  </div>
                </div>
              )}
              {linkGroup(linkGroups[1])}
              <div role="group" aria-labelledby={`${menuId}-advanced`} className={GROUP}>
                <p id={`${menuId}-advanced`} className={`${LABEL} flex min-h-8 items-center`}>
                  Advanced
                </p>
                <div className="mt-1">
                  <ProvInspectorSwitch />
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
