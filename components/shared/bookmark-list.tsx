"use client";

// The bookmarks list and its backup controls, drawn by the bookmarks page
// (/bookmarks, rails-ops ui-jobs 480), and `useBookmarks`, which the profile
// control (H20) reads for its face. The list lives in this origin's
// localStorage under `rails-bookmarks` (lib/shared/sessions.ts).

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { Facehash } from "@/components/shared/facehash";
import { walletHref } from "@/components/shared/front-door-search";
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

/** The bookmarks, kept in step with this tab's changes and other tabs'.
 *  `null` until read in the browser, so a page can hold its empty state
 *  back until it knows the list is empty. */
export function useBookmarks(): WalletSession[] | null {
  const [bookmarks, setBookmarks] = useState<WalletSession[] | null>(null);
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
  return bookmarks;
}

/** One list of bookmark rows, or `empty` when there are none. A row opens
 *  `/wallet/<address>`. */
export function BookmarkList({ bookmarks, empty }: { bookmarks: WalletSession[]; empty: ReactNode }) {
  if (bookmarks.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1" data-bookmark-list="">
      {bookmarks.map((s) => (
        <BookmarkRow key={s.key} session={s} />
      ))}
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const BACKUP_BUTTON =
  "cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground focus-ring dark:hover:bg-rb-800";

/** Export to file and Import from file, with the line that reports what
 *  either did. The file is a JSON backup (version 2, one list); an import
 *  also takes a version 1 file (per-explorer lists) and merges by address. */
export function BookmarkBackup({ className = "" }: { className?: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  return (
    <div className={className} data-bookmark-backup="">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleExport} className={BACKUP_BUTTON}>
          Export to file
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={BACKUP_BUTTON}>
          Import from file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          tabIndex={-1}
          data-bookmark-import=""
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear the input so re-picking the same file fires again.
            e.target.value = "";
            if (file) void handleImport(file);
          }}
        />
      </div>
      {notice && (
        <p className="mt-2 text-[11px] text-rb-500" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

const ICON_BUTTON =
  "cursor-pointer rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 dark:hover:bg-rb-800 focus-ring";

function Glyph({ children, strokeWidth = 2 }: { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const TICK = (
  <Glyph strokeWidth={2.5}>
    <path d="M20 6 9 17l-5-5" />
  </Glyph>
);

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
      className={`${ICON_BUTTON} hover:text-foreground`}
    >
      {copied ? (
        TICK
      ) : (
        <Glyph>
          <rect width="14" height="14" x="8" y="8" rx="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </Glyph>
      )}
    </button>
  );
}

function BookmarkRow({ session }: { session: WalletSession }) {
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
  // list's sync reads this row's new label.
  const commitEdit = () => {
    renameSession(session.key, draftName);
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraftName("");
  };

  const avatar = (
    <div style={{ borderRadius: 6, boxShadow: "0 0 0 2px var(--facehash-ring)" }} className="shrink-0">
      <Facehash address={primary} size={24} />
    </div>
  );

  const rowClasses =
    "group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-blue-500 hover:bg-rb-100 dark:hover:bg-rb-900";

  if (editing) {
    return (
      <div className={rowClasses} data-bookmark-row="" data-editing="">
        {avatar}
        <input
          autoFocus
          aria-label="Bookmark name"
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
          className="min-w-0 flex-1 rounded border border-rb-300 bg-raised px-1.5 py-0.5 text-base font-bold outline-none sm:text-sm dark:border-rb-700"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={commitEdit}
            title="Save name"
            aria-label="Save name"
            className={`${ICON_BUTTON} hover:text-green-500`}
          >
            {TICK}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            title="Cancel"
            aria-label="Cancel rename"
            className={`${ICON_BUTTON} hover:text-foreground`}
          >
            <Glyph>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </Glyph>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={rowClasses} data-bookmark-row="">
      <Link href={walletHref(primary)} className="flex min-w-0 flex-1 items-center gap-3">
        {avatar}
        <span className="truncate text-sm font-bold text-foreground" title={primary}>
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
          className={`${ICON_BUTTON} hover:text-foreground`}
        >
          <Glyph>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </Glyph>
        </button>
        <button
          type="button"
          onClick={() => removeBookmark(primary)}
          title="Remove bookmark"
          aria-label="Remove bookmark"
          className={`${ICON_BUTTON} hover:text-red-400`}
        >
          <Glyph>
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </Glyph>
        </button>
      </div>
    </div>
  );
}
