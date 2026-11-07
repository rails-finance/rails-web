"use client";

// The bookmarks list and its backup controls, drawn by the bookmarks page
// (/bookmarks, rails-ops ui-jobs 480), and `useBookmarks`, which the profile
// control (H20) reads for its face and its menu. The list lives in this
// origin's localStorage under `rails-bookmarks` (lib/shared/sessions.ts), in
// the reader's order: with `reorder`, rows move by drag and drop and by their
// move-up and move-down buttons (ui-jobs 504).

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, GripVertical, Upload } from "lucide-react";
import { NAV_BUTTON, POSITION_TAG_TONE } from "@/lib/shared/ui-grammar";

import { BookmarkSummary } from "@/components/bookmarks/bookmark-summary";
import { Facehash } from "@/components/shared/facehash";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";

import { walletHref } from "@/components/shared/front-door-search";
import {
  bookmarksBackupFilename,
  exportBookmarks,
  importBookmarks,
  loadBookmarks,
  moveSaved,
  removeBookmark,
  removeSaved,
  renameSaved,
  renameSession,
  SESSIONS_CHANGED_EVENT,
  type SavedKind,
  type SavedLink,
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
 *  `/wallet/<address>`; with `summary`, the wallet's protocols draw under its
 *  name (B2.1). */
/** Drag and drop within one kind's list (ui-jobs 504): the row being dragged
 *  and the index it would land at. */
function useRowDrag(kind: SavedKind) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drag = (i: number, id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setDragging(id);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(i);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragging) moveSaved(kind, dragging, i);
      setDragging(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });
  const moveOf = (i: number, count: number, id: string): RowMove => ({
    index: i,
    count,
    drag: drag(i, id),
    dragging: dragging === id,
    target: over === i && dragging !== id,
  });
  return moveOf;
}

/** One list of bookmark rows, or `empty` when there are none. A row opens
 *  `/wallet/<address>`; with `summary`, the wallet's protocols draw under its
 *  name (B2.1). */
export function BookmarkList({
  bookmarks,
  empty,
  summary,
  reorder,
}: {
  bookmarks: WalletSession[];
  empty: ReactNode;
  summary?: boolean;
  /** Rows move: drag and drop, and move-up and move-down buttons. */
  reorder?: boolean;
}) {
  const moveOf = useRowDrag("wallet");
  if (bookmarks.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1" data-bookmark-list="">
      {bookmarks.map((s, i) => (
        <BookmarkRow
          key={s.key}
          session={s}
          summary={summary}
          move={reorder ? moveOf(i, bookmarks.length, s.addresses[0]) : undefined}
        />
      ))}
    </div>
  );
}

/** The saved positions or views (ui-jobs 530, 521), or `empty` when there are
 *  none: rows that open the saved page, moved, renamed and removed as the
 *  wallet rows are. */
export function SavedLinkList({
  kind,
  links,
  empty,
}: {
  kind: "position" | "view";
  links: SavedLink[];
  empty: ReactNode;
}) {
  const moveOf = useRowDrag(kind);
  if (links.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1" data-bookmark-list={kind}>
      {links.map((l, i) => (
        <SavedLinkRow key={l.key} link={l} move={moveOf(i, links.length, l.key)} />
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
 *  either did. The file is a JSON backup of every saved item (version 3, one
 *  list of wallets, positions and views); an import also takes a version 2
 *  file (wallets) and a version 1 file (per-explorer lists).
 *  With nothing saved (`empty`) there is nothing to export: Import stands
 *  alone, after a line asking for the file (Miles, 6 Nov 2026). */
export function BookmarkBackup({ className = "", empty = false }: { className?: string; empty?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The list as a JSON file the reader keeps: bookmarks live in this
  // origin's localStorage, so the file is what carries them elsewhere.
  const handleExport = () => {
    const backup = exportBookmarks();
    const count = backup.bookmarks.length;
    if (count === 0) {
      setNotice("No saved items to export yet.");
      return;
    }
    const name = bookmarksBackupFilename();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`${plural(count, "saved item")} written to ${name}.`);
  };

  const handleImport = async (file: File) => {
    try {
      const result = importBookmarks(await file.text());
      setNotice(`Read ${plural(result.read, "saved item")}, ${result.added} new.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

  return (
    <div className={className} data-bookmark-backup="">
      {empty && (
        <p className="text-sm text-rb-500">
          Saved items in another browser? Export them there, then import the file here.
        </p>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${empty ? "mt-3" : ""}`}>
        {!empty && (
          <button type="button" onClick={handleExport} className={BACKUP_BUTTON}>
            Export to file
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className={empty ? NAV_BUTTON : BACKUP_BUTTON}
          data-bookmark-import-button=""
        >
          {empty && <Upload className="size-4 shrink-0" aria-hidden="true" />}
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

/** Copy the wallet address (or a saved page's link) to the clipboard,
 *  flashing a tick for ~1.2s. */
function CopyButton({ text, what = "Copy address" }: { text: string; what?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={what}
      aria-label={what}
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

const PENCIL = (
  <Glyph>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </Glyph>
);

const BIN = (
  <Glyph>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </Glyph>
);

const CROSS = (
  <Glyph>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);

/** A row's move-up and move-down buttons (ui-jobs 504). */
function MoveButtons({ label, move, onMove }: { label: string; move: RowMove; onMove: (to: number) => void }) {
  const cls = `${ICON_BUTTON} hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent`;
  return (
    <>
      <button
        type="button"
        onClick={() => onMove(move.index - 1)}
        disabled={move.index === 0}
        title="Move up"
        aria-label={`Move ${label} up`}
        className={cls}
        data-bookmark-move="up"
      >
        <ChevronUp className="size-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onMove(move.index + 1)}
        disabled={move.index === move.count - 1}
        title="Move down"
        aria-label={`Move ${label} down`}
        className={cls}
        data-bookmark-move="down"
      >
        <ChevronDown className="size-3" aria-hidden="true" />
      </button>
    </>
  );
}

interface RowMove {
  index: number;
  count: number;
  drag: Record<string, unknown>;
  dragging: boolean;
  target: boolean;
}

function BookmarkRow({ session, summary, move }: { session: WalletSession; summary?: boolean; move?: RowMove }) {
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
          aria-label="Wallet name"
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
            {CROSS}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${rowClasses} ${move?.dragging ? "opacity-50" : ""} ${move?.target ? "border-t-blue-500" : ""}`}
      data-bookmark-row=""
      {...move?.drag}
    >
      {move && (
        <GripVertical
          className="size-4 shrink-0 cursor-grab text-rb-400 active:cursor-grabbing"
          aria-hidden="true"
          data-bookmark-grip=""
        />
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={walletHref(primary)}
          draggable={false}
          className="flex min-w-0 items-center gap-3"
          data-bookmark-open=""
        >
          {avatar}
          <span className="truncate text-sm font-bold text-foreground" title={primary}>
            {label}
          </span>
        </Link>
        {/* Under the name, past the facehash's 24px and the 12px gap. */}
        {summary && (
          <div className="mt-1 pl-9">
            <BookmarkSummary address={primary} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {move && <MoveButtons label={label} move={move} onMove={(to) => moveSaved("wallet", primary, to)} />}
        <CopyButton text={primary} />
        <button
          type="button"
          onClick={startEdit}
          title="Rename"
          aria-label="Rename saved wallet"
          className={`${ICON_BUTTON} hover:text-foreground`}
        >
          {PENCIL}
        </button>
        <button
          type="button"
          onClick={() => removeBookmark(primary)}
          title="Remove from saved wallets"
          aria-label="Remove from saved wallets"
          className={`${ICON_BUTTON} hover:text-red-400`}
        >
          {BIN}
        </button>
      </div>
    </div>
  );
}

const KIND_NOUN = { position: "position", view: "view" } as const;

/** A saved position or view: the explorer's mark, the name, the chain and a
 *  closed position's tag under it; move, copy link, rename and remove as a
 *  wallet row has them. */
function SavedLinkRow({ link, move }: { link: SavedLink; move: RowMove }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const label = link.customName || link.name;
  const noun = KIND_NOUN[link.kind];
  const commitEdit = () => {
    renameSaved(link.kind, link.key, draftName);
    setEditing(false);
  };
  const rowClasses =
    "group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-blue-500 hover:bg-rb-100 dark:hover:bg-rb-900";
  const glyph = (
    <span className="flex size-6 shrink-0 items-center justify-center text-rb-500">
      {link.protocol ? <ProtocolIcon id={link.protocol.id} className="size-5" /> : null}
    </span>
  );

  if (editing) {
    return (
      <div className={rowClasses} data-bookmark-row={link.kind} data-editing="">
        {glyph}
        <input
          autoFocus
          aria-label={`Saved ${noun} name`}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          placeholder={link.name}
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
            onClick={() => setEditing(false)}
            title="Cancel"
            aria-label="Cancel rename"
            className={`${ICON_BUTTON} hover:text-foreground`}
          >
            {CROSS}
          </button>
        </div>
      </div>
    );
  }

  const where = [link.kind === "position" ? link.protocol?.name : null, link.chain?.name].filter(Boolean).join(" · ");
  return (
    <div
      className={`${rowClasses} ${move.dragging ? "opacity-50" : ""} ${move.target ? "border-t-blue-500" : ""}`}
      data-bookmark-row={link.kind}
      {...move.drag}
    >
      <GripVertical
        className="size-4 shrink-0 cursor-grab text-rb-400 active:cursor-grabbing"
        aria-hidden="true"
        data-bookmark-grip=""
      />
      <Link
        href={link.key}
        draggable={false}
        className="flex min-w-0 flex-1 items-center gap-3"
        data-bookmark-open={link.key}
      >
        {glyph}
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{label}</span>
          {(where || link.ended) && (
            <span className="mt-0.5 flex items-center gap-2 text-xs text-rb-500">
              {where && <span className="truncate">{where}</span>}
              {link.ended && <SavedEndedTag ended={link.ended} />}
            </span>
          )}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <MoveButtons label={label} move={move} onMove={(to) => moveSaved(link.kind, link.key, to)} />
        <CopyButton
          text={typeof window === "undefined" ? link.key : `${window.location.origin}${link.key}`}
          what="Copy link"
        />
        <button
          type="button"
          onClick={() => {
            setDraftName(link.customName ?? "");
            setEditing(true);
          }}
          title="Rename"
          aria-label={`Rename saved ${noun}`}
          className={`${ICON_BUTTON} hover:text-foreground`}
        >
          {PENCIL}
        </button>
        <button
          type="button"
          onClick={() => removeSaved(link.kind, link.key)}
          title={`Remove from saved ${noun}s`}
          aria-label={`Remove from saved ${noun}s`}
          className={`${ICON_BUTTON} hover:text-red-400`}
        >
          {BIN}
        </button>
      </div>
    </div>
  );
}

/** A saved closed position's tag, as its card's C6 draws it. */
export function SavedEndedTag({ ended }: { ended: NonNullable<SavedLink["ended"]> }) {
  const tone = POSITION_TAG_TONE[ended.tone as keyof typeof POSITION_TAG_TONE] ?? POSITION_TAG_TONE.muted;
  return (
    <span className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[11px] font-semibold ${tone}`} data-saved-ended="">
      {ended.word}
    </span>
  );
}
