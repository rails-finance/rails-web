"use client";

// The profile control (H20) and its menu (rails-ops ui-jobs 504): the facehash
// with a chevron, a menu button. The menu has no heading of its own: each group
// carries its own label (ui-jobs 524). Top down: with nothing saved, focus
// views included, "New to Rails? Start here" to /start as a blue button across
// the top (ui-jobs 509);
// the filled bookmark and "Saved wallets", then the first ten in the reader's
// order (lib/shared/sessions.ts; /bookmarks orders them) or, with none, how to
// save one; "Saved positions" (ui-jobs 530) and "Saved views" (ui-jobs 521),
// the first five of each, drawn when there is one; "Manage saved items →" to
// /bookmarks; the theme switch. From md a dropdown under the control, right
// edges aligned; below md a sheet from the foot of the screen over a dim (ui-jobs 507), rising
// over 220ms (globals.css `.profile-sheet`). Rows show what the
// browser holds (name, ENS, address) and read nothing.
//
// The face is the first saved wallet's; with none, the sample wallet's
// (lib/shared/sample-wallet.ts). Until the browser's list is read a faint
// square holds the place.
//
// The menu is a portal positioned against the control, so it stands over the
// page wherever the control sits (H2 below md, the column's corner from md;
// components/nav/rail-shell.tsx). Escape, a press outside and a lookup close
// it, and focus returns to the control; the arrow keys, Home and End move
// through its items. The dropdown drops in with a small bounce
// (globals.css `.profile-drop`, the wallet panel's spring timing).

import { CHROME_HOVER, CHROME_HOVER_ON } from "@/components/nav/chrome-hover";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Check, ChevronDown, ListFilter, Monitor, Moon, Settings, Signpost, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Facehash } from "@/components/shared/facehash";
import { FocusAvatar } from "@/components/shared/focus-avatar";
import { ExplorerScopeLine, FocusRows, ViewIcons, viewName } from "@/components/shared/asset-scope-strip";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { savedName, useSavedLinks } from "@/components/shared/saved-items";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { BOOKMARKS_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { focusViews, openFocusPanel, useAssetScope } from "@/lib/shared/asset-scope";
import { focusShort } from "@/components/shared/aim-gate";
import { CTRL_OFF, CTRL_ON, INPLACE_TEXT, START_CTA } from "@/lib/shared/ui-grammar";
import type { SavedLink, WalletSession } from "@/lib/shared/sessions";

const BOOKMARKS_PATH = "/bookmarks";
/** A text press in the menu is 44px tall on a phone. */
const MENU_TAP = "inline-flex min-h-11 items-center sm:min-h-0";
/** The control's and the menu's accessible name: what the menu holds as a whole. */
const MENU_NAME = "Saved and settings";
/** A group's small label (Saved wallets, Saved positions, Saved views). */
const GROUP_LABEL = "flex items-center gap-2 px-3 pb-2 pt-2 text-sm font-semibold text-foreground";
/** "New to Rails? Start here" across the menu's top. */
const START_BUTTON = `mb-1 flex w-full ${START_CTA}`;
/** The guided way in (G, /start), reached from this menu (ui-jobs 509). */
const START_PATH = "/start";
/** The menu lists this many wallets, and this many of each other kind; the
 *  rest are on /bookmarks. */
const MENU_ROWS = 10;
const MENU_LINK_ROWS = 5;
/** The menu lists this many focus views, and the view in use's first rows. */
const MENU_FOCUS_VIEWS = 5;
const MENU_FOCUS_ROWS = 3;
const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** A focus view's radio mark: ticked for the view in use. */
function RadioMark({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${
        on
          ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500"
          : "border-rb-300 dark:border-rb-600"
      }`}
      aria-hidden="true"
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

const ITEM =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:bg-rb-100 hover:bg-rb-100 dark:hover:bg-rb-800 dark:focus-visible:bg-rb-800";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function WalletRow({ session, onDone }: { session: WalletSession; onDone: () => void }) {
  const primary = session.addresses[0];
  const ens = session.ensNames[primary] || null;
  const name = session.customName || ens;
  return (
    <Link
      href={walletHref(primary)}
      role="menuitem"
      onClick={onDone}
      className={ITEM}
      data-profile-menu-wallet={primary}
    >
      <span className="shrink-0" style={{ borderRadius: 5, boxShadow: "0 0 0 2px var(--facehash-ring)" }}>
        <Facehash address={primary} size={20} />
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{name ?? short(primary)}</span>
      {name && <span className="shrink-0 font-mono text-xs text-rb-500">{short(primary)}</span>}
    </Link>
  );
}

/** A saved position or view: the explorer's mark, the name, the chain. */
function LinkRow({ link, onDone }: { link: SavedLink; onDone: () => void }) {
  return (
    <Link
      href={link.key}
      role="menuitem"
      onClick={onDone}
      className={ITEM}
      data-profile-menu-link={link.kind}
      data-href={link.key}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-rb-500">
        {link.protocol && <ProtocolIcon id={link.protocol.id} className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{savedName(link)}</span>
      {link.ended ? (
        <span className="shrink-0 text-xs text-rb-500">{link.ended.word}</span>
      ) : (
        link.kind === "position" &&
        link.chain && <span className="shrink-0 text-xs text-rb-500">{link.chain.name}</span>
      )}
    </Link>
  );
}

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Auto", Icon: Monitor },
] as const;

/** Light, dark or the system's, as three radio items in the menu. */
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
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              on ? CTRL_ON : CTRL_OFF
            }`}
            data-theme-option={value}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

export function ProfileMenu() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const pathname = usePathname();
  const scope = useAssetScope();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [place, setPlace] = useState<{ top: number; right: number; phone: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // When a press outside closed the menu, the click that ends the same press
  // can land on the control under the dim and would open it again: a press on
  // the control's place closes it and leaves it closed (ui-jobs 507).
  const closedByPress = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => setMounted(true), []);

  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  const rows = (bookmarks ?? []).slice(0, MENU_ROWS);
  const links = [
    { kind: "positions", label: "Saved positions", rows: (positions ?? []).slice(0, MENU_LINK_ROWS) },
    { kind: "views", label: "Saved views", rows: (views ?? []).slice(0, MENU_LINK_ROWS) },
  ].filter((g) => g.rows.length > 0);
  const focusOn = scope.ready && scope.on;
  /** Anything saved, focus views included, takes "Start here" out of the menu. */
  const anything = rows.length > 0 || links.length > 0 || (scope.ready && scope.views.length > 0);
  /** The Focus section shows with Focus on or any view saved. */
  const focusShown = scope.ready && (scope.on || scope.views.length > 0);
  const menuViews = scope.views.slice(0, MENU_FOCUS_VIEWS);
  const focusLabel = scope.active?.name || focusShort(scope.picks, scope.chains);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  // A navigation closes it.
  useEffect(() => setOpen(false), [pathname]);

  // Placed under the control: from md its right edge on the control's, below
  // md across the viewport.
  const measure = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setPlace({ top: r.bottom + 8, right: window.innerWidth - r.right, phone: window.innerWidth < 768 });
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
        // 516): the menu opens in place.
        className={`flex shrink-0 cursor-pointer items-center gap-0.5 rounded-lg py-[9px] pl-[9px] pr-1 text-foreground transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
              className={`fixed z-[var(--z-popover)] border border-rb-200 bg-background p-2 shadow-xl dark:border-rb-800 dark:bg-rb-900 ${
                place.phone
                  ? "profile-sheet inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-x-0 border-b-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                  : "profile-drop w-80 rounded-xl"
              }`}
              style={place.phone ? undefined : { top: place.top, right: place.right }}
            >
              {/* With Focus on or a focus view saved, the menu opens with
                  Focus (Miles, 10 Nov 2026): the saved views as a switcher
                  with Off, what the view in use holds, and its presses. */}
              {focusShown && (
                <div role="group" aria-labelledby={`${menuId}-focus`} className="pb-2" data-profile-menu-focus="">
                  <p id={`${menuId}-focus`} className={GROUP_LABEL}>
                    <ListFilter className="size-4 shrink-0" aria-hidden="true" />
                    Focus mode
                  </p>
                  <div data-profile-menu-focus-views={scope.views.length}>
                    {menuViews.map((v) => {
                      const on = scope.active?.id === v.id;
                      return (
                        <div key={v.id}>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={on}
                            onClick={() => focusViews.use(v.id)}
                            className={ITEM}
                            data-profile-menu-focus-view={v.id}
                          >
                            <RadioMark on={on} />
                            <span className="flex min-w-0 flex-1 items-center">
                              <ViewIcons picks={v.assets} chains={v.chains} />
                              <span className={`truncate ${on ? "font-semibold text-foreground" : "text-foreground"}`}>
                                {viewName(v)}
                              </span>
                            </span>
                          </button>
                          {on && (
                            <div className="pb-1 pl-11 pr-3">
                              <FocusRows picks={v.assets} chains={v.chains} max={MENU_FOCUS_ROWS} size={16} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {scope.views.length > MENU_FOCUS_VIEWS && (
                      <Link
                        href={`${BOOKMARKS_PATH}?tab=focus`}
                        role="menuitem"
                        onClick={() => close(false)}
                        className={`${ITEM} text-xs text-blue-600 dark:text-[var(--text-link)]`}
                      >
                        All {scope.views.length} focus views →
                      </Link>
                    )}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={!scope.on}
                      onClick={() => scope.clear()}
                      className={ITEM}
                      data-profile-menu-focus-off=""
                    >
                      <RadioMark on={!scope.on} />
                      <span className="flex-1 text-foreground">Off</span>
                    </button>
                  </div>
                  {/* On an explorer's page that the focus hides: why (the
                      strip's second line, Miles 10 Nov 2026). */}
                  <ExplorerScopeLine
                    keys={scope.keys}
                    className="px-3 pb-2 pt-1 text-xs leading-snug text-rb-500"
                    onLeave={() => close(false)}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-1 text-xs">
                    {scope.on && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          close(false);
                          openFocusPanel("edit");
                        }}
                        className={`rounded font-semibold ${FOCUS_RING} ${INPLACE_TEXT} ${MENU_TAP}`}
                        data-profile-menu-focus-change=""
                      >
                        Change
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close(false);
                        focusViews.create();
                      }}
                      className={`rounded font-semibold ${FOCUS_RING} ${INPLACE_TEXT} ${MENU_TAP}`}
                      data-profile-menu-focus-new=""
                    >
                      New view
                    </button>
                  </div>
                  <div className="mx-1 mt-3 border-t border-rb-200 dark:border-rb-800" />
                </div>
              )}
              {/* With none saved, the way in fills the menu's top (Miles, 6 Nov
                  2026); with a wallet saved there is none (ui-jobs 509). */}
              {!anything && (
                <Link
                  href={START_PATH}
                  role="menuitem"
                  onClick={() => close(false)}
                  className={START_BUTTON}
                  data-profile-menu-start=""
                >
                  New to Rails? Start here
                  <Signpost className="size-4 shrink-0 ml-auto" aria-hidden="true" />
                </Link>
              )}
              <div role="group" aria-labelledby={`${menuId}-wallets`}>
                <p id={`${menuId}-wallets`} className={GROUP_LABEL} data-profile-menu-group="wallets">
                  <Bookmark className="size-4 shrink-0" fill="currentColor" aria-hidden="true" />
                  {BOOKMARKS_NAME}
                </p>
                {rows.length > 0 ? (
                  <div className="pb-1" data-profile-menu-wallets="">
                    {rows.map((s) => (
                      <WalletRow key={s.key} session={s} onDone={() => close(false)} />
                    ))}
                  </div>
                ) : (
                  <p className="px-3 pb-1 text-sm text-rb-500" data-profile-menu-empty="">
                    To save a wallet, press the bookmark beside its address on its wallet page.
                  </p>
                )}
              </div>
              {links.map((g) => (
                <div key={g.kind} role="group" aria-labelledby={`${menuId}-${g.kind}`}>
                  <p id={`${menuId}-${g.kind}`} className={GROUP_LABEL} data-profile-menu-group={g.kind}>
                    <Bookmark className="size-4 shrink-0" fill="currentColor" aria-hidden="true" />
                    {g.label}
                  </p>
                  <div className="pb-1" data-profile-menu-links={g.kind}>
                    {g.rows.map((l) => (
                      <LinkRow key={l.key} link={l} onDone={() => close(false)} />
                    ))}
                  </div>
                </div>
              ))}
              {anything && <div className="mx-1 border-t border-rb-200 dark:border-rb-800" />}
              <div className="py-1">
                {/* Focus mode's way in while it is off (ui-jobs 557): opens its
                    panel (components/shared/asset-scope-strip.tsx). */}
                {!focusShown && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close(false);
                      focusViews.create();
                    }}
                    className={ITEM}
                    data-profile-menu-assets={scope.picks.length}
                  >
                    <ListFilter className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-foreground">Focus mode</span>
                    <span className="shrink-0 truncate text-xs text-rb-500">Off</span>
                  </button>
                )}
                <Link
                  href={BOOKMARKS_PATH}
                  role="menuitem"
                  onClick={() => close(false)}
                  className={`${ITEM} text-blue-600 dark:text-[var(--text-link)]`}
                  data-profile-menu-manage=""
                >
                  <Settings className="size-4 shrink-0" aria-hidden="true" />
                  Manage saved items →
                </Link>
              </div>
              <div className="px-1 pb-1 pt-1">
                <ThemeSwitch />
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
