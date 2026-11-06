"use client";

// The profile control (H20) and its menu (rails-ops ui-jobs 504): the facehash
// with a chevron, a menu button. The menu has no heading of its own: each group
// carries its own label (ui-jobs 524), so groups can join it (saved searches,
// ui-jobs 521). Top down: with none saved, "New to Rails? Start here" to /start
// as a blue button across the top (ui-jobs 509); the filled bookmark and "Saved
// wallets", then the first ten in the reader's order (lib/shared/sessions.ts;
// /bookmarks orders them) or, with none, how to save one; "Manage wallets →" to
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
// through its items. The dropdown has no animation.

import { CHROME_HOVER, CHROME_HOVER_ON } from "@/components/nav/chrome-hover";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ChevronDown, Monitor, Moon, Settings, Signpost, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Facehash } from "@/components/shared/facehash";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { BOOKMARKS_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { CTRL_OFF, CTRL_ON } from "@/lib/shared/ui-grammar";
import type { WalletSession } from "@/lib/shared/sessions";

const BOOKMARKS_PATH = "/bookmarks";
/** The control's and the menu's accessible name: what the menu holds as a whole. */
const MENU_NAME = "Saved and settings";
/** A group's small label (Saved wallets; Saved searches to come). */
const GROUP_LABEL = "flex items-center gap-2 px-3 pb-2 pt-2 text-sm font-semibold text-foreground";
/** "New to Rails? Start here" across the menu's top: link blue on a blue-tinted
 *  ground with a blue border, the marketing CTA's dark treatment (PILL_CTA). */
const START_BUTTON =
  "mb-1 flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:border-blue-500";
/** The guided way in (G, /start), reached from this menu (ui-jobs 509). */
const START_PATH = "/start";
/** The menu lists this many; the rest are on /bookmarks. */
const MENU_ROWS = 10;

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
  const pathname = usePathname();
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
        aria-label={MENU_NAME}
        title={MENU_NAME}
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
        {face ? (
          <Facehash address={face} size={20} mono />
        ) : (
          <span className="block size-5 rounded-[4.4px] bg-current opacity-30" aria-hidden="true" />
        )}
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
                  : "w-80 rounded-xl"
              }`}
              style={place.phone ? undefined : { top: place.top, right: place.right }}
            >
              {/* With none saved, the way in fills the menu's top (Miles, 6 Nov
                  2026); with a wallet saved there is none (ui-jobs 509). */}
              {rows.length === 0 && (
                <Link
                  href={START_PATH}
                  role="menuitem"
                  onClick={() => close(false)}
                  className={START_BUTTON}
                  data-profile-menu-start=""
                >
                  <Signpost className="size-4 shrink-0" aria-hidden="true" />
                  New to Rails? Start here
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
              {rows.length > 0 && <div className="mx-1 border-t border-rb-200 dark:border-rb-800" />}
              <div className="py-1">
                <Link
                  href={BOOKMARKS_PATH}
                  role="menuitem"
                  onClick={() => close(false)}
                  className={`${ITEM} text-blue-600 dark:text-blue-400`}
                  data-profile-menu-manage=""
                >
                  <Settings className="size-4 shrink-0" aria-hidden="true" />
                  Manage wallets →
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
