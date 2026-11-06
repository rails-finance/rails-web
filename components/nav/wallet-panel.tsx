"use client";

// The wallet panel (rails-ops TO-DO-ui-jobs 431, 503): a full-height panel
// that glides in from the left over the page, with the search pinned at its
// top and the explorer chooser (H4) under it. The saved wallets are the
// suggestions' first rows (H15.2) once the reader types, or on ArrowDown in
// the empty field; their page is in the profile control's menu (H20, ui-jobs
// 504). The rail's magnifier, the
// header bar's, ⌘K, and `/` on a page with no search of its own open it with
// the field focused; `openWalletPanel(from, "chooser")` opens it with the
// focus on the chooser's chain row instead.
//
// From md it starts at the brand rail's right edge, so the rail stays in view
// and the two read as one piece of chrome, on every page (the site's too,
// ui-jobs 498); below md (no rail) it starts at the viewport's edge and takes
// the full width there.
// A scrim dims the page behind it (no blur, Miles 5 Nov 2026) and closes it on
// a press; the page's animations hold still under it
// (`html[data-wallet-panel-open]`, globals.css). Escape closes it;
// focus moves in on open, stays inside while open and returns to the trigger.
//
// Open state is a small store, so every trigger reads and sets the same panel,
// which is mounted once (app/layout.tsx).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ExplorerChooser, PANEL_HEADING } from "@/components/nav/explorer-chooser";
import {
  FrontDoorSearch,
  OPEN_SEARCH_EVENT,
  SidebarToggleGlyph,
  TOGGLE_SEARCH_EVENT,
} from "@/components/shared/front-door-search";

let open = false;
/** Where the focus lands as the panel opens: the field, or the chooser. */
let openAt: "search" | "chooser" = "search";
let trigger: HTMLElement | null = null;
/** The header launcher's top as the panel opens, so the panel's close lands
 *  on it under the beta strip too; 16px (the bar's padding) otherwise. */
let launcherTop = 16;
/** The brand rail's right edge, measured as the panel opens; 0 with no rail. */
let railRight = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Open the panel; focus returns to `from` (the pressed control) on close. */
export function openWalletPanel(from?: HTMLElement | null, at: "search" | "chooser" = "search") {
  trigger = from ?? (document.activeElement as HTMLElement | null);
  openAt = at;
  const launcher = trigger?.closest<HTMLElement>('[data-search-launcher="header"]');
  launcherTop = launcher ? Math.max(0, Math.round(launcher.getBoundingClientRect().top)) : 16;
  // The rail's right edge, where one is drawn (an app route from md).
  const rail = document.querySelector<HTMLElement>('aside[data-anatomy="H1"]');
  railRight = rail && rail.getClientRects().length > 0 ? rail.getBoundingClientRect().right : 0;
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
const OUT_MS = 130;
const EASE_IN = "200ms cubic-bezier(0.22, 1, 0.36, 1)";
/** The slide in (ui-jobs 514): a damped spring (damping ratio 0.72) sampled
 *  into `linear()`, overshooting by 3.8% at 165ms and settling by 300ms
 *  (Miles asked for it quicker, 6 Nov 2026). Browsers without `linear()` take
 *  EASE_IN. */
const SPRING_IN =
  "300ms linear(0, 0.0199, 0.0718, 0.1453, 0.2321, 0.3253, 0.4198, 0.5116, 0.598, 0.6771, 0.7478, 0.8096, 0.8625, 0.9068, 0.9431, 0.972, 0.9945, 1.0113, 1.0233, 1.0313, 1.036, 1.0381, 1.0383, 1.0369, 1.0345, 1.0314, 1.0279, 1.0243, 1.0207, 1.0173, 1.0141, 1.0112, 1.0086, 1.0064, 1.0045, 1.0029, 1.0017, 1.0007, 0.9999, 0.9993, 1)";
/** How far the panel reaches left of its edge, out of sight under the rail (or
 *  the viewport's edge) at rest, so the overshoot never opens a gap there. */
const BLEED = 24;
const EASE_OUT = `${OUT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WalletPanel() {
  const isOpen = useWalletPanelOpen();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [still, setStill] = useState(false);
  const [slideIn, setSlideIn] = useState(EASE_IN);
  useEffect(() => {
    setMounted(true);
    if (CSS.supports("transition-timing-function", "linear(0, 1)")) setSlideIn(SPRING_IN);
  }, []);

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
      className={`fixed inset-y-0 right-0 z-[var(--z-modal)] overflow-hidden ${isOpen ? "" : "pointer-events-none"}`}
      style={{ left: railRight }}
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
        className="absolute inset-y-0 flex flex-col md:border-r border-rb-200 bg-raised shadow-xl dark:border-rb-800"
        style={{
          left: -BLEED,
          paddingLeft: BLEED,
          width: railRight > 0 ? 400 + BLEED : `calc(100% + ${BLEED}px)`,
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          // Hidden only once the slide out has run.
          transition: still
            ? "none"
            : isOpen
              ? `transform ${slideIn}, visibility 0s`
              : `transform ${EASE_OUT}, visibility 0s linear ${OUT_MS}ms`,
          visibility: isOpen ? "visible" : "hidden",
        }}
      >
        {/* The top row, below `md` only: the header bar is under the panel,
            so the row restates it (ui-jobs 514): the toggle's open glyph in
            the toggle's place (16px in; the launcher's top, measured as the
            panel opens, under the beta strip too), so the tap that opened the
            panel closes it in the same spot. From md the rail's mark goes home and its toggle closes
            the panel. */}
        <div className="flex shrink-0 items-center px-4 md:hidden" style={{ paddingTop: launcherTop }}>
          <button
            type="button"
            onClick={close}
            className="relative flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground focus-ring"
            aria-label="Close search and explorers"
            data-wallet-panel-close=""
          >
            <SidebarToggleGlyph open />
          </button>
        </div>
        {/* Pinned at the top: the search under its heading, the field with no
            placeholder (ui-jobs 514). From md the heading's line centres on the
            rail's toggle (its 38px box at 68px, so its middle at 87px; the
            heading's 20px line from 77px). */}
        <div className="relative z-10 shrink-0 px-5 pb-4 pt-4 md:pt-[77px]">
          <h2 className={PANEL_HEADING}>Search wallet, vault or protocol</h2>
          <div className="-ml-2 mt-5">
            <FrontDoorSearch size="lg" surface="raised" onDone={close} suggest placeholder="" />
          </div>
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
