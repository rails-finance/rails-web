"use client";

// The bookmarks list and its backup controls, drawn by the bookmarks page
// (/saved-views, rails-ops ui-jobs 480), and `useBookmarks`, which the profile
// control (H20) reads for its face and its menu. The list lives in this
// origin's localStorage under `rails-bookmarks` (lib/shared/sessions.ts), in
// the reader's order: with `reorder`, rows move by drag and drop (from sm) and
// by Move up and Move down in their ⋮ (ui-jobs 504). Each list is the house
// table (components/shared/data-table), stacked below sm as compact rows (the
// name's line, then one line of what the row holds), every action in the
// row's ⋮ (D7).

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Check, Download, GripVertical, Plus, Star, Upload, X } from "lucide-react";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { INPLACE_TEXT, NAV_BUTTON, POSITION_TAG_TONE } from "@/lib/shared/ui-grammar";

import { BookmarkSummary } from "@/components/bookmarks/bookmark-summary";
import { Facehash } from "@/components/shared/facehash";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
  DataTableRowMenu,
  type DataTableRowMenuItem,
} from "@/components/shared/data-table/data-table";

import { walletHref } from "@/components/shared/front-door-search";
import {
  chainName,
  FOCUS_OPTIONS,
  focusName,
  useFocusMisses,
  ViewIcons,
  viewName,
} from "@/components/shared/asset-scope-strip";
import { AssetChooser, optionKey } from "@/components/shared/asset-chooser";
import { otherLayerOpen } from "@/components/shared/use-escape-close";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { launchedChains } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import {
  chainNameOf,
  focusViews,
  openFocusPanel,
  scopeLink,
  withRecord,
  type AssetPick,
  type FocusView,
} from "@/lib/shared/asset-scope";
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
  STARS_SEEDED_FROM,
  toggleStar,
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

/** Drag and drop within one kind's list (ui-jobs 504): the row being dragged
 *  and the index it would land at. Not on a phone, where a drag is a scroll. */
function useRowDrag(kind: SavedKind, onMove?: (id: string, to: number) => void) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drag = (i: number, id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      // A press on a cell's cover link drags the link; the picture is the row.
      e.dataTransfer.setDragImage(e.currentTarget as Element, 24, 24);
      setDragging(id);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(i);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragging) (onMove ?? ((id: string, to: number) => moveSaved(kind, id, to)))(dragging, i);
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
    drag: phone ? {} : drag(i, id),
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
    <DataTable
      caption="Saved wallets"
      stacked
      compact
      rowHeight="one"
      tableClassName={`text-sm ${MARK_INDENT}`}
      data-bookmark-list=""
    >
      <DataTableHead>
        <DataTableHeader label="Wallet" />
        {summary && <DataTableHeader label="Positions" />}
        <DataTableHeader label="Address" />
        {ACTIONS_HEADER}
      </DataTableHead>
      <DataTableBody>
        {bookmarks.map((s, i) => (
          <BookmarkRow
            key={s.key}
            session={s}
            summary={summary}
            move={reorder ? moveOf(i, bookmarks.length, s.addresses[0]) : undefined}
          />
        ))}
      </DataTableBody>
    </DataTable>
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
    <DataTable
      caption={kind === "position" ? "Saved positions" : "Saved listings"}
      stacked
      compact
      rowHeight="one"
      tableClassName={`text-sm ${MARK_INDENT}`}
      data-bookmark-list={kind}
    >
      <DataTableHead>
        <DataTableHeader label="Name" />
        <DataTableHeader label="Explorer" />
        <DataTableHeader label="Chain" />
        {kind === "position" && <DataTableHeader label="Status" />}
        {ACTIONS_HEADER}
      </DataTableHead>
      <DataTableBody>
        {links.map((l, i) => (
          <SavedLinkRow key={l.key} link={l} move={moveOf(i, links.length, l.key)} />
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Export and Import on the page's background (the Backup section has no
 *  card; Miles 13 Nov 2026): a resting tile, NAV_BUTTON's ground, so they
 *  read as buttons there, each with its icon (a download, an upload) where
 *  the section heading's icon was. */
const BACKUP_BUTTON =
  "inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-rb-100 px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground focus-ring dark:bg-rb-800 dark:hover:bg-rb-700";

/** Export to file and Import from file, with the line that reports what
 *  either did. The file is a JSON backup of every saved item (version 3, one
 *  list of wallets, positions and views, and the saved Focus views beside it
 *  in `focusViews`); an import also takes a version 2
 *  file (wallets) and a version 1 file (per-explorer lists).
 *  With nothing saved (`empty`) there is nothing to export: Import stands
 *  alone, after a line asking for the file (Miles, 6 Nov 2026). */
export function BookmarkBackup({ className = "", empty = false }: { className?: string; empty?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The list as a JSON file the reader keeps: bookmarks live in this
  // origin's localStorage, so the file is what carries them elsewhere.
  const handleExport = () => {
    const views = focusViews.list();
    const backup = { ...exportBookmarks(), ...(views.length ? { focusViews: views } : {}) };
    const count = backup.bookmarks.length;
    if (count + views.length === 0) {
      setNotice("No saved views to export yet.");
      return;
    }
    const name = bookmarksBackupFilename();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    const what = [count ? plural(count, "saved item") : "", views.length ? `Focus (${views.length})` : ""]
      .filter(Boolean)
      .join(" and ");
    setNotice(`${what} written to ${name}.`);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const result = importBookmarks(text);
      let held: { focusViews?: unknown; version?: unknown } = {};
      try {
        held = JSON.parse(text);
      } catch {}
      // A file from before ui-jobs 652 carries no stars: its views start starred.
      const v =
        held.focusViews === undefined
          ? null
          : focusViews.importList(held.focusViews, Number(held.version) < STARS_SEEDED_FROM);
      const parts = [
        result.read ? `${plural(result.read, "saved item")}, ${result.added} new` : "",
        v && v.read ? `Focus (${v.read}), ${v.added} new` : "",
      ].filter(Boolean);
      setNotice(parts.length ? `Read ${parts.join("; ")}.` : "That backup carries nothing saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

  return (
    <div className={className} data-bookmark-backup="">
      {empty && (
        <p className="text-sm text-rb-500">
          Saved views in another browser? Export them there, then import the file here.
        </p>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${empty ? "mt-3" : ""}`}>
        {!empty && (
          <button type="button" onClick={handleExport} className={BACKUP_BUTTON}>
            <Download className="size-3.5 shrink-0" aria-hidden="true" />
            Export to file
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className={empty ? NAV_BUTTON : BACKUP_BUTTON}
          data-bookmark-import-button=""
        >
          <Upload className={`${empty ? "size-4" : "size-3.5"} shrink-0`} aria-hidden="true" />
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
  "inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-rb-500 transition-colors hover:bg-rb-200 focus-ring dark:hover:bg-rb-800 [@media(hover:none)]:size-11";

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

const CROSS = (
  <Glyph>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);

interface RowMove {
  index: number;
  count: number;
  /** The row's drag handlers; empty on a phone, where the ⋮ moves it. */
  drag: Record<string, unknown>;
  dragging: boolean;
  target: boolean;
}

/** The teal line over the row a dragged row would land on, drawn on the
 *  cells (a table row draws no shadow of its own). */
const DROP_LINE = "[&>*]:shadow-[inset_0_2px_0_var(--color-teal-500)]";

/** A row's drag handlers and its dragging or drop-target look. */
function rowDrag(move: RowMove | undefined, editing: boolean): { props: Record<string, unknown>; className: string } {
  if (!move || editing) return { props: {}, className: "" };
  return {
    props: move.drag,
    className: `${move.dragging ? "opacity-50" : ""} ${move.target ? DROP_LINE : ""}`,
  };
}

/** The drag cue at the start of a reorderable row's name, from sm. */
function Grip() {
  return (
    <GripVertical
      className="hidden size-4 shrink-0 cursor-grab text-rb-400 opacity-0 transition-opacity group-hover/dt-row:opacity-100 active:cursor-grabbing sm:block"
      aria-hidden="true"
      data-bookmark-grip=""
    />
  );
}

/** Move up and Move down for a row's ⋮, each where the row can go. */
function moveItems(move: RowMove | undefined, onMove: (to: number) => void, focus = false): DataTableRowMenuItem[] {
  if (!move) return [];
  const items: DataTableRowMenuItem[] = [];
  if (move.index > 0)
    items.push({
      key: "up",
      label: "Move up",
      onSelect: () => onMove(move.index - 1),
      hooks: { "data-bookmark-move": "up", "data-focus-view-menu": focus ? "up" : undefined },
    });
  if (move.index < move.count - 1)
    items.push({
      key: "down",
      label: "Move down",
      onSelect: () => onMove(move.index + 1),
      hooks: { "data-bookmark-move": "down", "data-focus-view-menu": focus ? "down" : undefined },
    });
  return items;
}

/** Copy to the clipboard, with "Copied" beside the ⋮ for ~1.2s. */
function useCopy(): [ReactNode, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);
  const note = (
    <span role="status" className="mr-1 align-middle text-xs text-rb-500">
      {copied ? "Copied" : ""}
    </span>
  );
  return [
    note,
    (text: string) => {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
    },
  ];
}

/** The name, edited in place: Enter or the tick saves, Escape or the cross
 *  cancels. An empty name returns the row to its default. */
function RenameField({
  label,
  initial,
  placeholder,
  maxLength,
  onSave,
  onCancel,
}: {
  label: string;
  initial: string;
  placeholder: string;
  maxLength?: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <input
        autoFocus
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-w-0 flex-1 rounded border border-rb-300 bg-raised px-1.5 py-0.5 text-base font-bold outline-none sm:text-sm dark:border-rb-700"
      />
      <button
        type="button"
        onClick={() => onSave(draft)}
        title="Save name"
        aria-label="Save name"
        className={`${ICON_BUTTON} hover:text-teal-600 dark:hover:text-teal-400`}
      >
        {TICK}
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Cancel"
        aria-label="Cancel rename"
        className={`${ICON_BUTTON} hover:text-foreground`}
      >
        {CROSS}
      </button>
    </span>
  );
}

const NAME_CELL = "sm:w-full sm:max-w-0 sm:min-w-[200px]";
/** Where a compact row's name starts below sm, after the star (`STAR_EDGE`,
 *  20px), a gap of 8, a 24px mark and a gap of 8: the second line's indent. */
const MARK_INDENT = "[--dt-indent:60px]";
/** Below sm the star's 44px press reaches into the gutter, its glyph on the
 *  column's edge, and the next item 8px after the glyph. */
const STAR_EDGE = "max-sm:-ml-3.5 max-sm:-mr-2.5";
/** A compact row's second line below sm: small and muted. */
const PHONE_LINE = "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rb-500";
const MENU_CELL = "dt-row-menu w-px whitespace-nowrap";

/** A saved entry's star (ui-jobs 586, 652), filled in the foreground colour
 *  when starred and a muted outline when not (rb-400 / rb-500; dark's
 *  outline rb-500, Miles 13 Nov 2026): the starred entries of a kind,
 *  focus views included, are the ones the profile menu shows. */
function StarToggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={on ? `Unstar ${label}` : `Star ${label}`}
      title={on ? "Shown in the profile menu" : "Show in the profile menu"}
      className={`-my-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors sm:size-7 ${STAR_EDGE} ${
        on ? "text-foreground" : "text-rb-400 hover:text-foreground dark:text-rb-500 dark:hover:text-foreground"
      }`}
      data-bookmark-star={on ? "on" : "off"}
      data-anatomy="B2.3"
    >
      <Star className="size-4" fill={on ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
const ACTIONS_HEADER = <DataTableHeader label={<span className="sr-only">Actions</span>} />;

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** A saved wallet (D4): the facehash and name open its page; its positions,
 *  its address and the ⋮ follow. */
function BookmarkRow({ session, summary, move }: { session: WalletSession; summary?: boolean; move?: RowMove }) {
  const [editing, setEditing] = useState(false);
  const [copied, copy] = useCopy();
  const phone = useMediaQuery(PHONE_QUERY);

  const primary = session.addresses[0];
  const ens = session.ensNames[primary] || null;
  const fallback = ens || shortAddress(primary);
  const label = session.customName || fallback;
  const href = walletHref(primary);
  const d = rowDrag(move, editing);

  const avatar = (
    <div style={{ borderRadius: 6, boxShadow: "0 0 0 2px var(--facehash-ring)" }} className="shrink-0">
      <Facehash address={primary} size={24} />
    </div>
  );

  return (
    <DataTableRow
      href={editing ? undefined : href}
      className={d.className}
      data-bookmark-row=""
      data-editing={editing ? "" : undefined}
      {...d.props}
    >
      <DataTableCell rowHeader valign="middle" className="sm:w-[38%] sm:max-w-0 sm:min-w-[200px]">
        <span className="flex min-w-0 items-center gap-2">
          {move && <Grip />}
          <StarToggle on={!!session.starred} label={label} onToggle={() => toggleStar("wallet", primary)} />
          {editing ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {avatar}
              <RenameField
                label="Wallet name"
                initial={session.customName ?? ""}
                placeholder={fallback}
                onSave={(name) => {
                  // renameSession persists and dispatches SESSIONS_CHANGED_EVENT,
                  // so the list's sync reads this row's new label.
                  renameSession(session.key, name);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </span>
          ) : (
            <DataTableRowLink
              href={href}
              draggable={false}
              className="flex min-w-0 items-center gap-2 sm:gap-3"
              data-bookmark-open=""
            >
              {avatar}
              <span className="truncate text-sm font-bold" title={primary}>
                {label}
              </span>
            </DataTableRowLink>
          )}
        </span>
      </DataTableCell>
      {phone ? (
        // One line under the name: the protocols, and the address where a
        // name stands in its place.
        (summary || label !== shortAddress(primary)) && (
          <DataTableCell label="Positions" valign="middle">
            <span className={PHONE_LINE}>
              {summary && <BookmarkSummary address={primary} />}
              {label !== shortAddress(primary) && (
                <span className="font-mono" title={primary}>
                  {shortAddress(primary)}
                </span>
              )}
            </span>
          </DataTableCell>
        )
      ) : (
        <>
          {summary && (
            <DataTableCell label="Positions" valign="middle" wide className="sm:min-w-[220px]">
              <BookmarkSummary address={primary} />
            </DataTableCell>
          )}
          <DataTableCell label="Address" valign="middle" className="whitespace-nowrap">
            <span className="font-mono text-xs text-rb-500" title={primary}>
              {shortAddress(primary)}
            </span>
          </DataTableCell>
        </>
      )}
      <DataTableCell valign="middle" className={MENU_CELL}>
        {copied}
        <DataTableRowMenu
          label={`Actions for ${label}`}
          items={[
            ...moveItems(move, (to) => moveSaved("wallet", primary, to)),
            {
              key: "copy",
              label: "Copy address",
              onSelect: () => copy(primary),
              hooks: { "data-bookmark-action": "copy" },
            },
            {
              key: "rename",
              label: "Rename",
              onSelect: () => setEditing(true),
              hooks: { "data-bookmark-action": "rename" },
            },
            {
              key: "remove",
              label: "Remove",
              onSelect: () => removeBookmark(primary),
              hooks: { "data-bookmark-action": "remove" },
            },
          ]}
        />
      </DataTableCell>
    </DataTableRow>
  );
}

const KIND_NOUN = { position: "position", view: "listing" } as const;

/** A saved position or listing (D4): the explorer's mark and the name open
 *  the page; its explorer, chain, a closed position's tag and the ⋮ follow. */
function SavedLinkRow({ link, move }: { link: SavedLink; move: RowMove }) {
  const [editing, setEditing] = useState(false);
  const [copied, copy] = useCopy();
  const label = link.customName || link.name;
  const noun = KIND_NOUN[link.kind];
  const phone = useMediaQuery(PHONE_QUERY);
  const d = rowDrag(move, editing);
  const glyph = (
    <span className="flex size-6 shrink-0 items-center justify-center text-rb-500">
      {link.protocol ? <ProtocolIcon id={link.protocol.id} className="size-5" /> : null}
    </span>
  );

  return (
    <DataTableRow
      href={editing ? undefined : link.key}
      className={d.className}
      data-bookmark-row={link.kind}
      data-editing={editing ? "" : undefined}
      {...d.props}
    >
      <DataTableCell rowHeader valign="middle" className={NAME_CELL}>
        <span className="flex min-w-0 items-center gap-2">
          <Grip />
          <StarToggle on={!!link.starred} label={label} onToggle={() => toggleStar(link.kind, link.key)} />
          {editing ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {glyph}
              <RenameField
                label={`Saved ${noun} name`}
                initial={link.customName ?? ""}
                placeholder={link.name}
                onSave={(name) => {
                  renameSaved(link.kind, link.key, name);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </span>
          ) : (
            <DataTableRowLink
              href={link.key}
              draggable={false}
              className="flex min-w-0 items-center gap-2 sm:gap-3"
              data-bookmark-open={link.key}
            >
              {glyph}
              <span className="truncate text-sm font-bold">{label}</span>
            </DataTableRowLink>
          )}
        </span>
      </DataTableCell>
      {/* Below sm one line under the name: explorer · chain, and a closed
          position's tag. */}
      {phone && (link.protocol || link.chain || link.ended) && (
        <DataTableCell label="Explorer" valign="middle">
          <span className={PHONE_LINE}>
            {(link.protocol || link.chain) && (
              <span className="truncate">{[link.protocol?.name, link.chain?.name].filter(Boolean).join(" · ")}</span>
            )}
            {link.kind === "position" && link.ended && <SavedEndedTag ended={link.ended} />}
          </span>
        </DataTableCell>
      )}
      {!phone && (
        <DataTableCell label="Explorer" valign="middle" className="whitespace-nowrap text-foreground/80">
          {link.protocol?.name}
        </DataTableCell>
      )}
      {!phone && (
        <DataTableCell label="Chain" valign="middle" className="whitespace-nowrap text-foreground/80">
          {link.chain?.name}
        </DataTableCell>
      )}
      {link.kind === "position" && !phone && (
        <DataTableCell label="Status" valign="middle" className="whitespace-nowrap">
          {link.ended && <SavedEndedTag ended={link.ended} />}
        </DataTableCell>
      )}
      <DataTableCell valign="middle" className={MENU_CELL}>
        {copied}
        <DataTableRowMenu
          label={`Actions for ${label}`}
          items={[
            ...moveItems(move, (to) => moveSaved(link.kind, link.key, to)),
            {
              key: "copy",
              label: "Copy link",
              onSelect: () => copy(`${window.location.origin}${link.key}`),
              hooks: { "data-bookmark-action": "copy" },
            },
            {
              key: "rename",
              label: "Rename",
              onSelect: () => setEditing(true),
              hooks: { "data-bookmark-action": "rename" },
            },
            {
              key: "remove",
              label: "Remove",
              onSelect: () => removeSaved(link.kind, link.key),
              hooks: { "data-bookmark-action": "remove" },
            },
          ]}
        />
      </DataTableCell>
    </DataTableRow>
  );
}

/** The saved Focus views (ui-jobs 557), with `empty` over the table when
 *  there are none: a table moved, renamed and removed as the saved links are,
 *  with the link copied (`&view=` carrying the name) and Use putting a view in
 *  use. A removed view can be put back for a few seconds (Undo). Its last row
 *  makes a new one (`NewFocusRow`; Miles 13 Nov 2026), drawn with no views
 *  too; `start` changing puts the caret in its name. */
export function FocusViewList({
  views,
  active,
  empty,
  start = 0,
}: {
  views: FocusView[];
  active: string | null;
  empty: ReactNode;
  start?: number;
}) {
  const moveOf = useRowDrag("view", focusViews.move);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [removed, setRemoved] = useState<{ view: FocusView; index: number; wasActive: boolean } | null>(null);
  useEffect(() => {
    if (!removed) return;
    const t = window.setTimeout(() => setRemoved(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [removed]);
  const remove = (id: string) => setRemoved(focusViews.remove(id));
  const undo = removed && (
    <p className="mb-2 flex items-center gap-2 text-sm text-rb-500" role="status" data-focus-view-removed="">
      Removed {viewName(removed.view)}
      {removed.wasActive ? ". Focus is off." : "."}
      <button
        type="button"
        onClick={() => {
          focusViews.restore(removed);
          setRemoved(null);
        }}
        className={`font-semibold ${INPLACE_TEXT} min-h-11 sm:min-h-0`}
        data-focus-view-undo=""
      >
        Undo
      </button>
    </p>
  );
  return (
    <>
      {undo}
      {views.length === 0 && empty}
      {/* The frame's sideways scroll would clip the new row's asset list, and
          the table stacks before it could need one. */}
      <DataTable
        caption="Focus"
        stacked
        compact
        rowHeight="one"
        className={views.length === 0 ? "mt-4 !overflow-visible" : "!overflow-visible"}
        tableClassName="text-sm [--dt-indent:28px]"
        data-bookmark-list="focus"
      >
        <DataTableHead>
          <DataTableHeader label="Name" />
          <DataTableHeader label="Assets" />
          <DataTableHeader label="Chains" />
          <DataTableHeader label={<span className="sr-only">In use</span>} />
          {ACTIONS_HEADER}
        </DataTableHead>
        <DataTableBody>
          {views.map((v, i) => (
            <FocusViewRow
              key={v.id}
              view={v}
              inUse={v.id === active}
              phone={isPhone}
              onRemove={() => remove(v.id)}
              move={moveOf(i, views.length, v.id)}
            />
          ))}
          <NewFocusRow at={views.length} start={start} />
        </DataTableBody>
      </DataTable>
    </>
  );
}

const UNDO_MS = 8000;

/** Use and In use (and the new row's Done): a small teal button on a soft
 *  teal fill at the row's text size (Miles 13 Nov 2026): using a view changes
 *  the scope in place, so teal. Below sm an invisible band takes the press to
 *  44px tall. */
const USE_BUTTON =
  "relative cursor-pointer items-center gap-1 rounded-md bg-teal-600/10 px-2 py-0.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-600/20 dark:bg-teal-400/10 dark:text-teal-400 dark:hover:bg-teal-400/20 max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-3 max-sm:before:content-['']";
/** "In use" with its tick. */
const IN_USE = (
  <>
    <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
    In use
  </>
);

/** A focus view (B2.2): not a link, so the plain hover block. Its name, the
 *  assets and chains it holds, Use or In use, and the ⋮. */
function FocusViewRow({
  view,
  inUse,
  phone,
  onRemove,
  move,
}: {
  view: FocusView;
  inUse: boolean;
  phone: boolean;
  onRemove: () => void;
  move: RowMove;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, copy] = useCopy();
  const label = viewName(view);
  const holds = focusName(view.assets, view.chains);
  const d = rowDrag(move, editing);

  const use = inUse ? (
    phone ? (
      <span className={`inline-flex ${USE_BUTTON}`} data-focus-view-in-use="">
        {IN_USE}
      </span>
    ) : (
      // "In use" and "Turn off" share one cell, so the button keeps its width
      // as the label swaps on hover and keyboard focus.
      <button
        type="button"
        onClick={() => focusViews.use(null)}
        aria-label={`${label} is in use. Turn off`}
        className={`group/use inline-grid ${USE_BUTTON}`}
        data-focus-view-in-use=""
      >
        <span className="inline-flex items-center gap-1 [grid-area:1/1] group-hover/use:invisible group-focus-visible/use:invisible">
          {IN_USE}
        </span>
        <span
          className="invisible justify-self-center [grid-area:1/1] group-hover/use:visible group-focus-visible/use:visible"
          data-focus-view-turn-off=""
        >
          Turn off
        </span>
      </button>
    )
  ) : (
    <button
      type="button"
      onClick={() => focusViews.use(view.id)}
      aria-label={`Use ${label}`}
      className={`inline-flex ${USE_BUTTON}`}
      data-focus-view-use={view.id}
    >
      Use
    </button>
  );

  const items: DataTableRowMenuItem[] = [
    {
      key: "edit",
      label: "Edit",
      onSelect: () => openFocusPanel("edit", view.id),
      hooks: { "data-focus-view-menu": "edit" },
    },
    ...(inUse && phone
      ? [
          {
            key: "turn-off",
            label: "Turn off",
            onSelect: () => focusViews.use(null),
            hooks: { "data-focus-view-menu": "turn-off" },
          },
        ]
      : []),
    ...moveItems(move, (to) => focusViews.move(view.id, to), true),
    {
      key: "copy",
      label: "Copy link",
      onSelect: () => copy(scopeLink(view.assets, view.chains, view.name, "/")),
      hooks: { "data-focus-view-menu": "copy" },
    },
    {
      key: "rename",
      label: "Rename",
      onSelect: () => setEditing(true),
      hooks: { "data-focus-view-menu": "rename" },
    },
    { key: "remove", label: "Remove", onSelect: onRemove, hooks: { "data-focus-view-menu": "remove" } },
  ];

  return (
    <DataTableRow
      className={d.className}
      data-bookmark-row="focus"
      data-anatomy="B2.2"
      data-focus-view-row={view.id}
      data-editing={editing ? "" : undefined}
      {...d.props}
    >
      <DataTableCell rowHeader valign="middle" className="max-sm:!pr-32 sm:w-[34%] sm:max-w-0 sm:min-w-[200px]">
        <span className="flex min-w-0 items-center gap-2">
          <Grip />
          <StarToggle on={!!view.starred} label={label} onToggle={() => focusViews.toggleStar(view.id)} />
          {editing ? (
            <RenameField
              label="Focus name"
              initial={view.name ?? ""}
              placeholder={holds}
              maxLength={60}
              onSave={(name) => {
                focusViews.rename(view.id, name);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="truncate text-sm font-bold text-foreground">{label}</span>
          )}
        </span>
      </DataTableCell>
      <DataTableCell label="Assets" valign="middle" className="sm:w-[40%] sm:max-w-0">
        {view.assets.length ? (
          <span className="flex min-w-0 items-center gap-1 text-foreground/80 max-sm:text-xs">
            <ViewIcons picks={view.assets} chains={[]} />
            <span className="truncate">{focusName(view.assets, [])}</span>
          </span>
        ) : (
          <span className="text-rb-500 max-sm:text-xs">All assets</span>
        )}
      </DataTableCell>
      <DataTableCell label="Chains" valign="middle" className="whitespace-nowrap">
        <ViewChainToggles view={view} />
      </DataTableCell>
      {/* Below sm, on the name's line before the ⋮. */}
      <DataTableCell
        valign="middle"
        className="whitespace-nowrap max-sm:!absolute max-sm:top-[18px] max-sm:right-11 max-sm:!p-0"
      >
        {use}
      </DataTableCell>
      <DataTableCell valign="middle" className={MENU_CELL}>
        {copied}
        <DataTableRowMenu label={`Actions for ${label}`} items={items} />
      </DataTableCell>
    </DataTableRow>
  );
}

/** A view's chains as one toggle per launched chain (Miles, 10 Nov 2026),
 *  `ChainMarks` on the saved view: a press adds or drops the chain, as the
 *  panel's Chains part does. A view of chains alone keeps its last chain,
 *  since an emptied view is removed. */
function ViewChainToggles({ view }: { view: FocusView }) {
  return (
    <ChainMarks
      chains={view.chains}
      label={`Chains in ${viewName(view)}`}
      locked={(id) => view.chains.length === 1 && view.chains[0] === id && view.assets.length === 0}
      onChange={(chains) => focusViews.edit(view.id, { assets: view.assets, chains })}
      hook="data-focus-view-chain"
    />
  );
}

/** One toggle per launched chain: in focus in text ink, the rest dimmed
 *  (rb-500 in dark, so a mark that is off still reads; Miles 13 Nov 2026).
 *  None pressed is every chain, "All". */
function ChainMarks({
  chains,
  label,
  locked = () => false,
  onChange,
  hook,
}: {
  chains: number[];
  label: string;
  locked?: (id: number) => boolean;
  onChange: (chains: number[]) => void;
  hook: "data-focus-view-chain" | "data-focus-chain";
}) {
  const all = launchedChains().map((c) => c.id);
  const toggle = (id: number) =>
    onChange(chains.includes(id) ? chains.filter((c) => c !== id) : all.filter((c) => c === id || chains.includes(c)));
  return (
    <span className="relative z-[2] flex items-center gap-0.5" role="group" aria-label={label}>
      {all.map((id) => {
        const on = chains.includes(id);
        const last = on && locked(id);
        const name = chainNameOf(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            disabled={last}
            onClick={() => toggle(id)}
            title={last ? `${name} is this view's only part` : on ? `Drop ${name}` : `Add ${name}`}
            className={`inline-flex size-11 items-center justify-center rounded-md transition-colors sm:size-7 ${
              on ? "text-foreground" : "text-rb-400/80 hover:text-rb-500 dark:text-rb-500 dark:hover:text-rb-400"
            } ${last ? "cursor-default" : "cursor-pointer hover:bg-rb-200/60 dark:hover:bg-rb-800"}`}
            {...{ [hook]: id }}
          >
            <ChainGlyph id={id as ChainId} className="h-3.5 w-3.5" />
            <span className="sr-only">{name}</span>
          </button>
        );
      })}
      {chains.length === 0 && <span className="ml-1.5 text-xs text-rb-500">All</span>}
    </span>
  );
}

const pickKey = (p: Pick<AssetPick, "chain" | "token">) => optionKey({ chain: p.chain, address: p.token });

/** The Focus table's last row, a new focus (Miles 13 Nov 2026): a name, the
 *  assets added through AssetChooser as pills, and the chains as the rows'
 *  marks. Nothing is saved until Done, which saves it at the table's end, put
 *  in use, and empties the row. The × and Escape empty it with nothing saved;
 *  Escape is the row's while focus is inside it or no other layer (a menu,
 *  dialog or listbox) stands open over the page, and an open asset list takes
 *  it first. */
function NewFocusRow({ at, start }: { at: number; start: number }) {
  const [assets, setAssets] = useState<AssetPick[]>([]);
  const [chains, setChains] = useState<number[]>([]);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const holds = assets.length > 0 || chains.length > 0;
  const dirty = holds || name.trim() !== "";
  const judged = useFocusMisses({ assets, chains });
  const reset = () => {
    setAssets([]);
    setChains([]);
    setName("");
  };
  const done = () => {
    if (!holds) return;
    focusViews.add({ assets: assets.map(withRecord), chains }, name.trim() || undefined, at);
    reset();
  };

  useEffect(() => {
    if (!start) return;
    input.current?.focus({ preventScroll: true });
    input.current?.closest("tr")?.scrollIntoView({ block: "nearest" });
  }, [start]);

  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const inside = !!input.current?.closest("tr")?.contains(document.activeElement);
      if (!inside && otherLayerOpen()) return;
      e.preventDefault();
      reset();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty]);

  const choose = (keys: string[]) => {
    const had = new Map(assets.map((p) => [pickKey(p), p]));
    setAssets(
      keys.map((k) => {
        const p = had.get(k);
        if (p) return p;
        const [chain, token] = k.split(":");
        return { chain: Number(chain), token, builtOn: true };
      }),
    );
  };

  return (
    <DataTableRow data-focus-view-editor="" data-focus-view-new-row="" data-anatomy="B2.2">
      <DataTableCell rowHeader valign="middle" className="max-sm:pr-12 sm:w-[34%] sm:max-w-0 sm:min-w-[200px]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
          <span
            className={`-my-2 inline-flex size-11 shrink-0 items-center justify-center text-rb-400 sm:size-7 dark:text-rb-500 ${STAR_EDGE}`}
          >
            <Plus className="size-4" aria-hidden="true" />
          </span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                done();
              }
            }}
            aria-label="New focus name"
            placeholder={holds ? focusName(assets, chains) : "New focus"}
            maxLength={60}
            className="min-w-0 flex-1 rounded border border-rb-300 bg-raised px-1.5 py-0.5 text-base font-bold text-foreground outline-none placeholder:font-normal placeholder:text-rb-500 focus:border-teal-500 sm:text-sm dark:border-rb-700"
          />
        </span>
      </DataTableCell>
      <DataTableCell label="Assets" valign="middle" wide className="sm:w-[40%] sm:py-2">
        <AssetChooser
          options={FOCUS_OPTIONS}
          selected={assets.map(pickKey)}
          onChange={choose}
          label="Add an asset"
          addLabel="Add an asset"
          topLabel="Most built on"
          countNoun={null}
          chainName={chainName}
        />
        {/* Where the focus holds nothing on a chain, and where Rails cannot
            say, as the Focus panel's Chains part lists them; under the assets,
            the row's wide cell at every width. */}
        {judged && judged.misses.length > 0 && (
          <ul className="mt-2 text-[11px] leading-snug text-foreground" data-focus-chain-miss={judged.misses.length}>
            {judged.misses.map((m) => (
              <li key={m.text} data-miss-kind={m.kind}>
                {m.text}
              </li>
            ))}
          </ul>
        )}
      </DataTableCell>
      <DataTableCell label="Chains" valign="middle" className="whitespace-nowrap">
        <ChainMarks chains={chains} label="Chains in the new focus" onChange={setChains} hook="data-focus-chain" />
      </DataTableCell>
      <DataTableCell valign="middle" className="whitespace-nowrap max-sm:mb-3 max-sm:self-end">
        <button
          type="button"
          onClick={done}
          disabled={!holds}
          title={holds ? undefined : "Add an asset or a chain first"}
          className={`inline-flex ${USE_BUTTON} disabled:cursor-default disabled:opacity-50 disabled:hover:bg-teal-600/10 dark:disabled:hover:bg-teal-400/10`}
          data-focus-view-editor-done=""
        >
          Done
        </button>
      </DataTableCell>
      <DataTableCell valign="middle" className={MENU_CELL}>
        {dirty && (
          <button
            type="button"
            onClick={reset}
            aria-label="Cancel the new focus"
            title="Cancel"
            className={`${ICON_BUTTON} hover:text-foreground`}
            data-focus-view-editor-cancel=""
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </DataTableCell>
    </DataTableRow>
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
