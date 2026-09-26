"use client";

// Central bookmarks surface. Bookmarks are stored PER RAIL (each explorer's own
// `${protocol}-sessions` key) — this modal is the one place that reads across
// all of them, grouped by rail, so per-rail storage doesn't mean "scattered and
// unfindable". Grouping-by-rail is also what keeps the scoping legible: a
// wallet under the Spark group is a Spark bookmark, full stop.
//
// EVERY GROUP IS A ROSTER ENTRY NOW. The two chain-scoped vault sections had
// their own groups here, drawn from a registry rather than the roster, because
// a section had no `ProtocolEntry` to draw a glyph and a label from. Both
// sections are gone (rails-ops decision 0028) — a vault belongs to the protocol
// whose factory deployed it, and that protocol's rail owns the bookmark — so
// this reads the roster and nothing else.
//
// Shell mirrors AppPreferencesModal (createPortal + Esc-to-close + backdrop).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Info } from "lucide-react";

import { Facehash } from "@/components/shared/facehash";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainMark } from "@/components/shared/explorer-mark";
import { LAUNCHED_PROTOCOLS, PROTOCOLS, bookmarkHref, type ProtocolEntry } from "@/lib/shared/protocols";
import {
  bookmarksBackupFilename,
  countBackupBookmarks,
  exportBookmarks,
  importBookmarks,
  loadBookmarks,
  removeBookmark,
  renameSession,
  SESSIONS_CHANGED_EVENT,
  type BookmarkScope,
  type WalletSession,
} from "@/lib/shared/sessions";

interface Group {
  entry: ProtocolEntry;
  bookmarks: WalletSession[];
}

/** The one line the backup controls report through — a count, or the reason a
 *  file was refused. */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function BookmarksModal({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Write every scope's bookmarks to a JSON file the reader keeps. Bookmarks
  // live in per-origin localStorage, so this file is the only thing that
  // carries them to another browser or survives a site-data clear.
  const handleExport = () => {
    const backup = exportBookmarks();
    const count = countBackupBookmarks(backup);
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
      const result = importBookmarks(
        await file.text(),
        // The WHOLE roster: an import must recognise a scope this build has an
        // explorer for even while that explorer is unlaunched, or a reader's
        // bookmarks under it would come back filed as "unknown scope".
        PROTOCOLS.map((p) => p.session),
      );
      const parts = [`Read ${plural(result.scopes, "scope")}, ${plural(result.added, "new bookmark")}`];
      if (result.unknownScopes.length > 0) {
        parts.push(
          `${plural(result.unknownScopes.length, "scope")} this build has no explorer for were stored as they are`,
        );
      }
      setNotice(`${parts.join("; ")}.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

  // Read every scope's bookmarks, drop the empty ones, and resync on any
  // mutation (a bookmark toggled on a card, a remove here, or another tab).
  useEffect(() => {
    const sync = () => {
      // LAUNCHED explorers only: each group heading is a link into its
      // explorer and each row a link into a position, so an unlaunched
      // explorer's bookmarks would be exactly the door the rest of this change
      // closes. Nothing is discarded — the bookmarks stay in storage, they
      // export (the export below reads every scope), and the group reappears
      // the day that explorer launches.
      setGroups(
        LAUNCHED_PROTOCOLS.map((entry) => ({ entry, bookmarks: loadBookmarks(entry.session) })).filter(
          (g) => g.bookmarks.length > 0,
        ),
      );
    };
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl max-w-xl w-full my-8 p-6 sm:p-8 shadow-xl"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 cursor-pointer p-2 rounded-lg hover:bg-rb-200 dark:hover:bg-rb-800 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
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

          <div className="mb-1.5 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">My bookmarks</h2>
          </div>

          {/* Storage smallprint. Bookmarks live in this origin's localStorage
              only, with no server copy, so a reader deciding whether to rely
              on one deserves to be told before they fill a list, not after a
              cleared browser loses it. Shown in both branches below (empty
              and populated) since the empty state is when this is most worth
              knowing.

              THE GLYPH IS `Info`, NOT A TRIANGLE. standards/color-grammar.md
              reserves the caution triangle for adverse events (redemption,
              liquidation, zombie, deprecation), so that a triangle beside a
              figure always means the position is at risk. Where the bookmarks
              live is a fact about storage, so it takes the neutral mark and
              the muted tone (Miles, 2026-09-26). */}
          <div className="mb-5 flex items-start gap-1.5 text-[11px] text-rb-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <p>
              Bookmarks are stored in your browser&apos;s local storage. Nothing is saved to our servers or anywhere
              else. To keep a copy safe, use Export to file below.
            </p>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-rb-500">
              No bookmarks yet. Tap the bookmark on a position card in any explorer to add one — they&apos;re kept per
              scope and collected here.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map(({ entry, bookmarks }) => (
                /* `data-bookmark-group` is the scope a group holds, as data —
                   the hook the vault groups carried before they were merged
                   into the roster, kept so a reader can be held to the scope
                   it says it is showing. */
                <div key={entry.session} data-bookmark-group={entry.session}>
                  <Link
                    href={entry.href}
                    onClick={onClose}
                    className="group mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold text-rb-500 hover:text-foreground transition-colors"
                  >
                    <ProtocolIcon id={entry.id} className="h-3.5 w-3.5 shrink-0" />
                    {entry.label}
                    {/* Two explorers can share a name across chains (Aave V3 on
                        Ethereum and on Base); the chain mark, not a suffix,
                        tells the groups apart. */}
                    <ChainMark chainId={entry.chainId} className="h-[11px] w-[11px]" />
                  </Link>
                  <div className="flex flex-col gap-1">
                    {bookmarks.map((s) => (
                      <BookmarkRow
                        key={s.key}
                        scope={entry.session}
                        href={bookmarkHref(entry, s.addresses[0], s.listing)}
                        session={s}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Backup. Bookmarks sit in this origin's localStorage and nowhere
              else, so without a file the reader can carry, a site-data clear
              or a second browser loses them. Import merges — it adds to what
              is here rather than replacing it. */}
          <div className="mt-6 border-t border-rb-200 pt-4 dark:border-rb-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground dark:hover:bg-rb-800"
              >
                Export to file
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground dark:hover:bg-rb-800"
              >
                Import from file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear the input so re-picking the same file fires again.
                  e.target.value = "";
                  if (file) void handleImport(file);
                }}
              />
            </div>
            {notice && <p className="mt-2 text-[11px] text-rb-500">{notice}</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Copy the wallet address to the clipboard, flashing a tick for ~1.2s. Mirrors
 *  the toolbar dropdown's copy affordance so the two bookmark surfaces match. */
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

function BookmarkRow({
  scope,
  href,
  session,
  onClose,
}: {
  /** Which storage namespace this row lives in — a rail, or a vault section. */
  scope: BookmarkScope;
  /** Where the row OPENS: the scope's own listing, filtered to this wallet. */
  href: string;
  session: WalletSession;
  onClose: () => void;
}) {
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
  // renameSession persists + dispatches SESSIONS_CHANGED_EVENT, so the modal's
  // sync re-reads this row's new label — no local session state to keep in step.
  const commitEdit = () => {
    renameSession(session.key, draftName, scope);
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
      <Link href={href} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2.5">
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
          onClick={() => removeBookmark(primary, scope)}
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
