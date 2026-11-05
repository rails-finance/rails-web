"use client";

// The wallet panel (rails-ops TO-DO-ui-jobs 431, 503): a full-height panel
// that glides in from the left over the page, with the search pinned at its
// top and the explorer chooser (H4) under it. The saved wallets are the
// suggestions' first rows (H15.2) once the reader types, or on ArrowDown in
// the empty field; their page is in the profile control's menu (H20, ui-jobs
// 504). The header bar's launcher (the Rails mark and its chevron, H15.1),
// ⌘K, and `/` on a page with no search of its own open it with the field
// focused; `openWalletPanel(from, "chooser")` opens it with the
// focus on the chooser's chain row instead.
//
// It starts at the viewport's left edge on every page: 400px wide from md,
// the full width below (ui-jobs 509: no rail at any width).
// A scrim dims the page behind it (no blur, Miles 5 Nov 2026) and closes it on
// a press; the page's animations hold still under it
// (`html[data-wallet-panel-open]`, globals.css). Escape closes it;
// focus moves in on open, stays inside while open and returns to the trigger.
//
// Open state is a small store, so every trigger reads and sets the same panel,
// which is mounted once (app/layout.tsx).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { RailsMark } from "@/components/nav/rails-mark";
import { ExplorerChooser } from "@/components/nav/explorer-chooser";
import { FrontDoorSearch, OPEN_SEARCH_EVENT, TOGGLE_SEARCH_EVENT } from "@/components/shared/front-door-search";

let open = false;
/** Where the focus lands as the panel opens: the field, or the chooser. */
let openAt: "search" | "chooser" = "search";
let trigger: HTMLElement | null = null;
/** The header launcher's top as the panel opens, so the panel's close lands
 *  on it under the beta strip too; 16px (the bar's padding) otherwise. */
let launcherTop = 16;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Open the panel; focus returns to `from` (the pressed control) on close. */
export function openWalletPanel(from?: HTMLElement | null, at: "search" | "chooser" = "search") {
  trigger = from ?? (document.activeElement as HTMLElement | null);
  openAt = at;
  const launcher = trigger?.closest<HTMLElement>('[data-search-launcher="header"]');
  launcherTop = launcher ? Math.max(0, Math.round(launcher.getBoundingClientRect().top)) : 16;
  open = true;
  notify();
}

export function closeWalletPanel() {
  if (!open) return;
  open = false;
  notify();
  const back = trigger;
  trigger = null;
  // After the panel turns inert, so the focus lands.
  requestAnimationFrame(() => back?.focus());
}

export function toggleWalletPanel(from?: HTMLElement | null, at: "search" | "chooser" = "search") {
  if (open) closeWalletPanel();
  else openWalletPanel(from, at);
}

/** Whether the panel is open: the triggers read it for their active state. */
export function useWalletPanelOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => open,
    () => false,
  );
}

/** The slide and the scrim's fade: a soft ease in, a quicker ease out. */
const OUT_MS = 220;
const EASE_IN = "320ms cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_OUT = `${OUT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WalletPanel() {
  const isOpen = useWalletPanelOpen();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setStill(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // `/` with no search on the page opens the panel.
  useEffect(() => {
    const onOpen = () => openWalletPanel();
    const onToggle = () => toggleWalletPanel();
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener(TOGGLE_SEARCH_EVENT, onToggle);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener(TOGGLE_SEARCH_EVENT, onToggle);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-wallet-panel-open", "");
    const focusField = requestAnimationFrame(() =>
      panelRef.current
        ?.querySelector<HTMLElement>(openAt === "chooser" ? '[data-switcher-tabs] [aria-selected="true"]' : "input")
        ?.focus(),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWalletPanel();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusField);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-wallet-panel-open");
    };
  }, [isOpen]);

  const close = useCallback(() => closeWalletPanel(), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[var(--z-modal)] overflow-hidden ${isOpen ? "" : "pointer-events-none"}`}
      data-wallet-panel-root=""
    >
      {/* The scrim: the page behind the panel lightened (light) or darkened
          (dark); a press closes it. */}
      <div
        aria-hidden="true"
        onClick={close}
        data-anatomy="H16.1"
        className="absolute inset-0 bg-white/60 dark:bg-black/70"
        style={{
          opacity: isOpen ? 1 : 0,
          transition: still ? "none" : `opacity ${isOpen ? EASE_IN : EASE_OUT}`,
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search and explorers"
        aria-hidden={!isOpen}
        inert={!isOpen}
        data-search-launcher-panel=""
        data-anatomy="H16"
        className="absolute inset-y-0 left-0 flex w-full flex-col md:border-r border-rb-200 bg-raised shadow-xl md:w-[400px] dark:border-rb-800"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          // Hidden only once the slide out has run.
          transition: still
            ? "none"
            : isOpen
              ? `transform ${EASE_IN}, visibility 0s`
              : `transform ${EASE_OUT}, visibility 0s linear ${OUT_MS}ms`,
          visibility: isOpen ? "visible" : "hidden",
        }}
      >
        {/* The header bar is under the panel, so the panel's top row restates
            the bar's left end: the Rails mark
            with its chevron pointing left, in the bar's launcher box at its
            place (16px in, 24px from md; the launcher's height down, measured as
            the panel opens, under the beta strip too), so the tap that opened the panel closes
            it in the same spot; and on the right "Home", since the mark no
            longer goes home (ui-jobs 509). The bar's padding, so the box
            lands on the launcher's place at every width. */}
        <div className="flex shrink-0 items-center justify-between px-4 md:px-6" style={{ paddingTop: launcherTop }}>
          <button
            type="button"
            onClick={close}
            className="group flex h-[38px] shrink-0 cursor-pointer items-center gap-1 rounded-lg text-foreground focus-ring"
            aria-label="Close search and explorers"
            data-wallet-panel-close=""
          >
            <RailsMark size={30} />
            <ChevronLeft
              size={16}
              className="text-rb-500 transition-colors group-hover:text-foreground"
              aria-hidden="true"
            />
          </button>
          <Link
            href="/"
            onClick={close}
            className="inline-flex h-[38px] items-center rounded-sm px-1.5 text-sm font-medium text-blue-600 underline-offset-4 hover:underline focus-ring dark:text-blue-400"
            data-wallet-panel-home=""
          >
            Home
          </Link>
        </div>
        {/* Pinned at the top: the search row, no heading (the field names the
            panel; Miles, 1 Nov 2026). */}
        <div className="relative z-10 shrink-0 px-5 pb-4 pt-4">
          <FrontDoorSearch size="lg" surface="raised" onDone={close} suggest />
        </div>

        {/* The explorer chooser (H4) under the search; the suggestions list
            (H15.2) opens over it while the reader types. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <ExplorerChooser key={isOpen ? "open" : "shut"} onNavigate={close} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
