"use client";

// The wallet panel (rails-ops TO-DO-ui-jobs 431): a full-height panel that
// glides in from the left over the page, with the search pinned at its top
// and a link to the bookmarks page (/bookmarks, ui-jobs 480) at its foot. The
// bookmarks are the search's suggestions on a focused, empty field (H15.2).
// The rail's magnifier, the header bar's search and bookmark controls, and
// `/` on a page with no search of its own all open it.
//
// From md it starts at the brand rail's right edge, so the rail stays in view
// and the two read as one piece of chrome; below md, and on a marketing page
// (no rail), it starts at the viewport's edge and takes the full width there.
// A scrim dims the page behind it and closes it on a press; Escape closes it;
// focus moves in on open, stays inside while open and returns to the trigger.
//
// Open state is a small store, so every trigger reads and sets the same panel,
// which is mounted once (app/layout.tsx).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";

import { RailsGlyph } from "@/components/nav/brand-rail";
import { useBookmarksName } from "@/components/shared/bookmarks-name";
import { FrontDoorSearch, OPEN_SEARCH_EVENT } from "@/components/shared/front-door-search";

let open = false;
let trigger: HTMLElement | null = null;
/** The brand rail's right edge, measured as the panel opens; 0 with no rail. */
let railRight = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Open the panel; focus returns to `from` (the pressed control) on close. */
export function openWalletPanel(from?: HTMLElement | null) {
  trigger = from ?? (document.activeElement as HTMLElement | null);
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

export function toggleWalletPanel(from?: HTMLElement | null) {
  if (open) closeWalletPanel();
  else openWalletPanel(from);
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
  const bookmarksName = useBookmarksName();
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
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusField = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>("input")?.focus());
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
          (dark) and blurred; a press closes it. */}
      <div
        aria-hidden="true"
        onClick={close}
        data-anatomy="H16.1"
        className="absolute inset-0 bg-white/60 backdrop-blur-[4px] dark:bg-black/60"
        style={{ opacity: isOpen ? 1 : 0, transition: still ? "none" : `opacity ${isOpen ? EASE_IN : EASE_OUT}` }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Look up a wallet"
        aria-hidden={!isOpen}
        inert={!isOpen}
        data-search-launcher-panel=""
        data-anatomy="H16"
        className="absolute inset-y-0 left-0 flex w-full flex-col border-r border-rb-200 bg-raised shadow-xl md:w-[400px] dark:border-rb-800"
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
        {/* Below `md` there is no rail and the header bar is under the panel,
            so the panel's top row restates the bar's furniture as the bar lays
            it out: the Rails mark top left (16px in, 16px down) and a × top
            right where the bar's controls are (Miles, 1 Nov 2026). */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 md:hidden">
          <RailsGlyph onClick={close} />
          <button
            type="button"
            onClick={close}
            className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:text-foreground focus-ring"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* Pinned at the top: the search row, no heading (the field names the
            panel; Miles, 1 Nov 2026). From `md` the row sits level with the
            rail's glyph (H15.1), blue while the panel is open, which stands as
            the row's icon: the rail's 16px top padding, the 30px mark, the
            12px gap and half the 38px launcher put its centre at 77px, so the
            48px field starts at 53px. */}
        <div className="shrink-0 px-5 pb-4 pt-4 md:pt-[53px]">
          <FrontDoorSearch size="lg" surface="raised" onDone={close} suggest />
        </div>

        {/* The bookmarks are the suggestions' first rows (H15.2): the list
            opens on the focused field with them, newest first, and matches
            them as the reader types. Their page, with rename, remove and the
            backup, is one link at the foot (ui-jobs 480). */}
        <div className="min-h-0 flex-1" />
        <div className="shrink-0 border-t border-rb-200 px-5 py-4 dark:border-rb-800">
          <Link
            href="/bookmarks"
            onClick={close}
            className="rounded-sm text-sm text-blue-500 transition-colors hover:text-blue-600 focus-ring dark:hover:text-blue-400"
            data-wallet-panel-bookmarks=""
          >
            {bookmarksName} →
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
