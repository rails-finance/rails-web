"use client";

// The wallet panel (rails-ops TO-DO-ui-jobs 431): a full-height panel that
// glides in from the left over the page, with the search pinned at its top,
// the bookmarks as one list under it, and the backup controls at its foot.
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
import { Info, X } from "lucide-react";

import { Facehash } from "@/components/shared/facehash";
import { FrontDoorSearch, OPEN_SEARCH_EVENT, walletHref } from "@/components/shared/front-door-search";
import {
  bookmarksBackupFilename,
  exportBookmarks,
  importBookmarks,
  loadBookmarks,
  removeBookmark,
  renameSession,
  SESSIONS_CHANGED_EVENT,
  type WalletSession,
} from "@/lib/shared/sessions";

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

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The slide and the scrim's fade: a soft ease in, a quicker ease out. */
const OUT_MS = 220;
const EASE_IN = "320ms cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_OUT = `${OUT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WalletPanel() {
  const isOpen = useWalletPanelOpen();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [still, setStill] = useState(false);
  const [bookmarks, setBookmarks] = useState<WalletSession[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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
    const sync = () => setBookmarks(loadBookmarks());
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setNotice(null);
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

  // The list as a JSON file the reader keeps: bookmarks live in this
  // origin's localStorage, so the file is what carries them elsewhere.
  const handleExport = () => {
    const backup = exportBookmarks();
    const count = backup.bookmarks.length;
    if (count === 0) {
      setNotice("No bookmarks to export yet.");
      return;
    }
    const name = bookmarksBackupFilename();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`${plural(count, "bookmark")} saved to ${name}.`);
  };

  const handleImport = async (file: File) => {
    try {
      const result = importBookmarks(await file.text());
      setNotice(`Read ${plural(result.read, "bookmark")}, ${result.added} new.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

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
        aria-labelledby="wallet-panel-title"
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
        {/* Pinned at the top: the heading, the × and the search. */}
        <div className="shrink-0 px-5 pb-4 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="wallet-panel-title" className="text-base font-semibold text-foreground">
              Look up a wallet
            </h2>
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:text-foreground focus-ring"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <FrontDoorSearch size="lg" onDone={close} />
        </div>

        {/* The bookmarks: one list, scrolling between the search and the foot. */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-rb-200 px-3 py-3 dark:border-rb-800">
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rb-500">Bookmarks</p>
          {bookmarks.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-rb-500">No bookmarks yet.</p>
          ) : (
            <div className="flex flex-col gap-1" data-bookmark-list="">
              {bookmarks.map((s) => (
                <BookmarkRow key={s.key} session={s} onClose={close} />
              ))}
            </div>
          )}
        </div>

        {/* Pinned at the foot: the backup and where bookmarks are kept. */}
        <div className="shrink-0 border-t border-rb-200 px-5 py-4 dark:border-rb-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground focus-ring dark:hover:bg-rb-800"
            >
              Export to file
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground focus-ring dark:hover:bg-rb-800"
            >
              Import from file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Clear the input so re-picking the same file fires again.
                e.target.value = "";
                if (file) void handleImport(file);
              }}
            />
          </div>
          {notice && <p className="mt-2 text-[11px] text-rb-500">{notice}</p>}
          {/* The neutral mark: where bookmarks live is a fact about storage,
              and the caution triangle is kept for adverse events
              (standards/color-grammar.md). */}
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-rb-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <p>
              Bookmarks are stored in your browser&apos;s local storage. Nothing is saved to our servers or anywhere
              else. To keep a copy safe, use Export to file.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Copy the wallet address to the clipboard, flashing a tick for ~1.2s. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Copy address"
      aria-label="Copy address"
      className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground dark:hover:bg-rb-800"
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}

function BookmarkRow({ session, onClose }: { session: WalletSession; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");

  const primary = session.addresses[0];
  const ens = session.ensNames[primary] || null;
  const fallback = ens || `${primary.slice(0, 6)}…${primary.slice(-4)}`;
  const label = session.customName || fallback;

  const startEdit = () => {
    setDraftName(session.customName ?? "");
    setEditing(true);
  };
  // renameSession persists and dispatches SESSIONS_CHANGED_EVENT, so the
  // panel's sync reads this row's new label.
  const commitEdit = () => {
    renameSession(session.key, draftName);
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraftName("");
  };

  const avatar = (
    <div style={{ borderRadius: 5, boxShadow: "0 0 0 2px var(--facehash-ring)" }} className="shrink-0">
      <Facehash address={primary} size={18} />
    </div>
  );

  const rowClasses =
    "group flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-blue-500 hover:bg-rb-100 dark:hover:bg-rb-900";

  if (editing) {
    return (
      <div className={rowClasses}>
        {avatar}
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          placeholder={fallback}
          className="min-w-0 flex-1 rounded border border-rb-300 bg-raised px-1.5 py-0.5 text-xs font-bold outline-none dark:border-rb-700"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={commitEdit}
            title="Save name"
            aria-label="Save name"
            className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 hover:text-green-500 dark:hover:bg-rb-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            title="Cancel"
            aria-label="Cancel rename"
            className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground dark:hover:bg-rb-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={rowClasses}>
      <Link href={walletHref(primary)} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2.5">
        {avatar}
        <span className="truncate text-xs font-bold text-foreground" title={primary}>
          {label}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <CopyButton text={primary} />
        <button
          type="button"
          onClick={startEdit}
          title="Rename"
          aria-label="Rename bookmark"
          className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground dark:hover:bg-rb-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => removeBookmark(primary)}
          title="Remove bookmark"
          aria-label="Remove bookmark"
          className="cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 hover:text-red-400 dark:hover:bg-rb-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
