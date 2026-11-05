"use client";

// The profile control (H20) and its menu (rails-ops ui-jobs 504): the facehash
// with a chevron, a menu button. The menu, top down: the saved wallets' heading
// (the filled bookmark, "Saved wallets"), the first ten in the reader's order
// (lib/shared/sessions.ts; /bookmarks orders them), "Manage wallets →" to
// /bookmarks, then the theme switch. With none saved, one line on how to save
// one, then the theme switch. From md a dropdown under the control, right
// edges aligned; below md a full-width sheet under it. Rows show what the
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
// through its items. No animation.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ChevronDown, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Facehash } from "@/components/shared/facehash";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { BOOKMARKS_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import type { WalletSession } from "@/lib/shared/sessions";

const BOOKMARKS_PATH = "/bookmarks";
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
    <div
      role="group"
      aria-label="Theme"
      className="flex gap-1 rounded-lg bg-rb-200/70 p-1 dark:bg-rb-900"
      data-profile-menu-theme=""
    >
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
              on ? "bg-background text-foreground shadow-sm" : "text-rb-500 hover:text-foreground"
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

  useEffect(() => {
    if (!open) return;
    const first = requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>(ITEMS)?.focus());
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false);
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

  const onBookmarks = pathname === BOOKMARKS_PATH;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={BOOKMARKS_NAME}
        title={BOOKMARKS_NAME}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-anatomy="H20"
        data-profile-face={face ?? undefined}
        className={`flex shrink-0 cursor-pointer items-center gap-0.5 rounded-lg py-[9px] pl-[9px] pr-1 transition-colors duration-150 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          open || onBookmarks ? "text-blue-600 dark:text-blue-400" : "text-rb-700 dark:text-rb-300"
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
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={BOOKMARKS_NAME}
            data-profile-menu=""
            className={`fixed z-[var(--z-popover)] border border-rb-200 bg-raised p-2 shadow-xl dark:border-rb-800 ${
              place.phone ? "inset-x-0 rounded-b-2xl border-x-0" : "w-80 rounded-xl"
            }`}
            style={place.phone ? { top: place.top } : { top: place.top, right: place.right }}
          >
            <p className="flex items-center gap-2 px-3 pb-2 pt-1 text-sm font-semibold text-foreground">
              <Bookmark className="size-4 shrink-0" fill="currentColor" aria-hidden="true" />
              {BOOKMARKS_NAME}
            </p>
            <div className="mx-1 border-t border-rb-200 dark:border-rb-800" />
            {rows.length > 0 ? (
              <>
                <div className="py-1" data-profile-menu-wallets="">
                  {rows.map((s) => (
                    <WalletRow key={s.key} session={s} onDone={() => close(false)} />
                  ))}
                </div>
                <div className="mx-1 border-t border-rb-200 dark:border-rb-800" />
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
              </>
            ) : (
              <p className="px-3 py-3 text-sm text-rb-500" data-profile-menu-empty="">
                To save a wallet, press the bookmark beside its address on its wallet page.
              </p>
            )}
            <div className="px-1 pb-1 pt-1">
              <ThemeSwitch />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
