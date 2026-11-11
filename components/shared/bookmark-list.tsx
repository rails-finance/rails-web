"use client";

// The bookmarks list and its backup controls, drawn by the bookmarks page
// (/bookmarks, rails-ops ui-jobs 480), and `useBookmarks`, which the profile
// control (H20) reads for its face and its menu. The list lives in this
// origin's localStorage under `rails-bookmarks` (lib/shared/sessions.ts), in
// the reader's order: with `reorder`, rows move by drag and drop (from sm) and
// by Move up and Move down in their ⋮ (ui-jobs 504). Each list is the house
// table (components/shared/data-table), stacked below sm, every action in the
// row's ⋮ (D7).

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Upload } from "lucide-react";
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
import { focusName, ViewIcons, viewName } from "@/components/shared/asset-scope-strip";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { launchedChains } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import { chainNameOf, focusViews, openFocusPanel, scopeLink, type FocusView } from "@/lib/shared/asset-scope";
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
    <DataTable caption="Saved wallets" stacked rowHeight="one" tableClassName="text-sm" data-bookmark-list="">
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
      rowHeight="one"
      tableClassName="text-sm"
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

const BACKUP_BUTTON =
  "cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rb-500 transition-colors hover:bg-rb-200 hover:text-foreground focus-ring dark:hover:bg-rb-800";

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
    const what = [count ? plural(count, "saved item") : "", views.length ? plural(views.length, "focus view") : ""]
      .filter(Boolean)
      .join(" and ");
    setNotice(`${what} written to ${name}.`);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const result = importBookmarks(text);
      let fileViews: unknown;
      try {
        fileViews = (JSON.parse(text) as { focusViews?: unknown }).focusViews;
      } catch {}
      const v = fileViews === undefined ? null : focusViews.importList(fileViews);
      const parts = [
        result.read ? `${plural(result.read, "saved item")}, ${result.added} new` : "",
        v && v.read ? `${plural(v.read, "focus view")}, ${v.added} new` : "",
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
const MENU_CELL = "dt-row-menu w-px whitespace-nowrap";
const ACTIONS_HEADER = <DataTableHeader label={<span className="sr-only">Actions</span>} />;

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** A saved wallet (D4): the facehash and name open its page; its positions,
 *  its address and the ⋮ follow. */
function BookmarkRow({ session, summary, move }: { session: WalletSession; summary?: boolean; move?: RowMove }) {
  const [editing, setEditing] = useState(false);
  const [copied, copy] = useCopy();

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
          {editing ? (
            <span className="flex min-w-0 flex-1 items-center gap-3">
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
              className="flex min-w-0 items-center gap-3"
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
          {editing ? (
            <span className="flex min-w-0 flex-1 items-center gap-3">
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
              className="flex min-w-0 items-center gap-3"
              data-bookmark-open={link.key}
            >
              {glyph}
              <span className="truncate text-sm font-bold">{label}</span>
            </DataTableRowLink>
          )}
        </span>
      </DataTableCell>
      {/* A stacked card draws no cell for what the entry lacks. */}
      {(!phone || link.protocol) && (
        <DataTableCell label="Explorer" valign="middle" className="whitespace-nowrap text-foreground/80">
          {link.protocol?.name}
        </DataTableCell>
      )}
      {(!phone || link.chain) && (
        <DataTableCell label="Chain" valign="middle" className="whitespace-nowrap text-foreground/80">
          {link.chain?.name}
        </DataTableCell>
      )}
      {link.kind === "position" && (!phone || link.ended) && (
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

/** The saved Focus views (ui-jobs 557), or `empty` when there are none: a
 *  table moved, renamed and removed as the saved links are, with the link
 *  copied (`&view=` carrying the name) and Use putting a view in use. A
 *  removed view can be put back for a few seconds (Undo). */
export function FocusViewList({
  views,
  active,
  empty,
}: {
  views: FocusView[];
  active: string | null;
  empty: ReactNode;
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
  if (views.length === 0)
    return (
      <>
        {undo}
        {empty}
      </>
    );
  return (
    <>
      {undo}
      <DataTable caption="Focus views" stacked rowHeight="one" tableClassName="text-sm" data-bookmark-list="focus">
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
        </DataTableBody>
      </DataTable>
    </>
  );
}

const UNDO_MS = 8000;

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
      <span className="text-xs font-semibold text-foreground" data-focus-view-in-use="">
        In use
      </span>
    ) : (
      <button
        type="button"
        onClick={() => focusViews.use(null)}
        aria-label={`${label} is in use. Turn off`}
        className="group/use min-w-12 cursor-pointer text-left text-xs font-semibold text-foreground"
        data-focus-view-in-use=""
      >
        <span className="group-hover/use:hidden group-focus-visible/use:hidden">In use</span>
        <span className={`hidden group-hover/use:inline group-focus-visible/use:inline ${INPLACE_TEXT}`}>Turn off</span>
      </button>
    )
  ) : (
    <button
      type="button"
      onClick={() => focusViews.use(view.id)}
      aria-label={`Use ${label}`}
      className={`cursor-pointer text-xs font-semibold ${INPLACE_TEXT} min-h-11 min-w-11 text-left sm:min-h-0 sm:min-w-0`}
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
      <DataTableCell rowHeader valign="middle" className="sm:w-[34%] sm:max-w-0 sm:min-w-[200px]">
        <span className="flex min-w-0 items-center gap-2">
          <Grip />
          {editing ? (
            <RenameField
              label="Focus view name"
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
          <span className="flex min-w-0 items-center gap-1 text-foreground/80">
            <ViewIcons picks={view.assets} chains={[]} />
            <span className="truncate">{focusName(view.assets, [])}</span>
          </span>
        ) : (
          <span className="text-rb-500">All assets</span>
        )}
      </DataTableCell>
      <DataTableCell label="Chains" valign="middle" className="whitespace-nowrap">
        <ViewChainToggles view={view} />
      </DataTableCell>
      <DataTableCell valign="middle" className="whitespace-nowrap">
        {use}
      </DataTableCell>
      <DataTableCell valign="middle" className={MENU_CELL}>
        {copied}
        <DataTableRowMenu label={`Actions for ${label}`} items={items} />
      </DataTableCell>
    </DataTableRow>
  );
}

/** A view's chains as one toggle per launched chain (Miles, 10 Nov 2026):
 *  in focus in text ink, the rest dimmed; a press adds or drops the chain, as
 *  the panel's Chains part does. None pressed is every chain. A view of
 *  chains alone keeps its last chain, since an emptied view is removed. */
function ViewChainToggles({ view }: { view: FocusView }) {
  const all = launchedChains().map((c) => c.id);
  const toggle = (id: number) =>
    focusViews.edit(view.id, {
      assets: view.assets,
      chains: view.chains.includes(id)
        ? view.chains.filter((c) => c !== id)
        : all.filter((c) => c === id || view.chains.includes(c)),
    });
  return (
    <span className="relative z-[2] flex items-center gap-0.5" role="group" aria-label={`Chains in ${viewName(view)}`}>
      {all.map((id) => {
        const on = view.chains.includes(id);
        const last = on && view.chains.length === 1 && view.assets.length === 0;
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
              on ? "text-foreground" : "text-rb-400/80 hover:text-rb-500 dark:text-rb-600 dark:hover:text-rb-400"
            } ${last ? "cursor-default" : "cursor-pointer hover:bg-rb-200/60 dark:hover:bg-rb-800"}`}
            data-focus-view-chain={id}
          >
            <ChainGlyph id={id as ChainId} className="h-3.5 w-3.5" />
            <span className="sr-only">{name}</span>
          </button>
        );
      })}
      {view.chains.length === 0 && <span className="ml-1.5 text-xs text-rb-500">All</span>}
    </span>
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
