"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

import { Facehash } from "@/components/shared/facehash";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { protocolForSession } from "@/lib/shared/protocols";
import {
  loadBookmarks,
  renameSession,
  saveSessions,
  SESSIONS_CHANGED_EVENT,
  type BookmarkScope,
  type WalletSession,
} from "@/lib/shared/sessions";

interface Props {
  /** Open/closed flag controlled by the parent (typically: focused && !value). */
  show: boolean;
  /** Closed when the user clicks outside this container or hits Escape. */
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Called with the session's primary lowercase 0x address. */
  onPick: (address: string) => void;
  /** Which scope's bookmarks to render — a protocol's rail, or a chain's
   *  vault SECTION. Each keeps its own — a wallet bookmarked on /liquity-v2 is
   *  not a bookmark on /aave-v4, and neither is one on /ethereum/aave.
   *  The panel header names the scope so it is explicit. */
  protocol: BookmarkScope;
}

/** Floating panel of a protocol's bookmarked wallets, anchored beneath the
 *  wallet search input. Bookmarks are per-protocol; the header names which
 *  rail these belong to. (Recents were retired — this is bookmarks only.) */
export function WalletHistoryDropdown({ show, containerRef, onClose, onPick, protocol }: Props) {
  const [sessions, setSessions] = useState<WalletSession[]>([]);
  const meta = protocolForSession(protocol);

  useEffect(() => {
    const sync = () => setSessions(loadBookmarks(protocol));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
    };
  }, [protocol]);

  useEffect(() => {
    if (!show) return;
    const onPointer = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [show, containerRef, onClose]);

  // Bookmarking now happens on the position cards themselves (the bookmark on
  // each listing row), not in this dropdown — the dropdown is a destination for
  // browsing bookmarks, not the place you fiddle with them. The Remove (trash)
  // action below still un-lists a wallet entirely, which is how a bookmark gets
  // cleared from here.
  //
  // saveSessions runs *after* setSessions returns — calling it inside the
  // updater would put a side-effecting dispatchEvent in React's render path
  // (and double-fire it in strict mode), which is what produces the "cannot
  // update HeaderBar while rendering WalletHistoryDropdown" warning.
  const removeSessionLocal = useCallback(
    (key: string) => {
      const next = sessions.filter((s) => s.key !== key);
      setSessions(next);
      saveSessions(next, protocol);
    },
    [sessions, protocol],
  );

  const renameSessionLocal = useCallback(
    (key: string, customName: string) => {
      renameSession(key, customName, protocol);
      setSessions(loadBookmarks(protocol));
    },
    [protocol],
  );

  if (!show) return null;

  const hasAny = sessions.length > 0;

  return (
    <div className="absolute left-0 right-0 top-full mt-2 z-30 rounded-xl border border-rb-200 dark:border-rb-800 bg-white dark:bg-rb-900 shadow-lg overflow-hidden">
      <div className="p-3 space-y-2">
        {/* Explicit scope: these bookmarks belong to THIS protocol only. */}
        <div className="flex items-center gap-1.5 px-1 pb-2 border-b border-rb-200 dark:border-rb-800">
          <BookmarkIcon />
          <span className="text-xs font-semibold text-foreground">Bookmarks</span>
          {meta && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-rb-500">
              <ProtocolIcon id={meta.id} className="h-3 w-3 shrink-0" />
              {meta.label}
            </span>
          )}
        </div>
        {hasAny ? (
          <div className="flex flex-col gap-1">
            {sessions.map((s) => (
              <SessionRow
                key={s.key}
                session={s}
                onRemove={removeSessionLocal}
                onRename={renameSessionLocal}
                onPick={onPick}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-rb-500 py-2 px-1">
            No bookmarks yet — tap the bookmark on a position card to add one.
          </p>
        )}
      </div>
    </div>
  );
}

/** Filled bookmark matching BookmarkToggle's bookmarked state — the panel's marker. */
function BookmarkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-foreground"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function VerbButton({
  onClick,
  title,
  icon,
  danger = false,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={`shrink-0 p-1.5 rounded-md cursor-pointer text-rb-500 transition-colors ${
        danger ? "hover:text-red-400" : "hover:text-rb-text-500"
      } hover:bg-rb-200 dark:hover:bg-rb-800`}
    >
      {icon}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Copy address"
      className="shrink-0 p-1 rounded-md cursor-pointer text-rb-500 hover:text-rb-text-500 hover:bg-rb-200 dark:hover:bg-rb-800 transition-colors"
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

function SessionRow({
  session,
  onRemove,
  onRename,
  onPick,
}: {
  session: WalletSession;
  onRemove: (key: string) => void;
  onRename: (key: string, customName: string) => void;
  onPick: (address: string) => void;
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
  const commitEdit = () => {
    onRename(session.key, draftName);
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraftName("");
  };

  const rowClasses =
    "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors border border-transparent hover:border-blue-500 hover:bg-rb-100 dark:hover:bg-rb-900";

  const avatar = (
    <div style={{ borderRadius: 5, boxShadow: "0 0 0 2px var(--facehash-ring)" }} className="shrink-0">
      <Facehash address={primary} size={18} />
    </div>
  );

  const labelEl = editing ? (
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
      className="flex-1 min-w-0 text-xs font-bold px-1.5 py-0.5 rounded bg-raised border border-rb-300 dark:border-rb-700 outline-none"
    />
  ) : (
    <div className="text-xs font-bold truncate flex-1 text-foreground" title={primary}>
      {label}
    </div>
  );

  // Editing swaps the copy/rename/remove trio for an explicit save (✓) / cancel
  // (✕) pair — no blur-to-commit, so clicking away or hitting Escape can't
  // silently write a half-typed (or cleared) name.
  const verbButtons = editing ? (
    <div className="flex items-center gap-0.5 shrink-0">
      <VerbButton
        onClick={commitEdit}
        title="Save name"
        icon={
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
        }
      />
      <VerbButton
        onClick={cancelEdit}
        title="Cancel"
        icon={
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
        }
      />
    </div>
  ) : (
    <div className="flex items-center gap-0.5 shrink-0">
      <CopyButton text={primary} />
      <VerbButton
        onClick={startEdit}
        title="Rename"
        icon={
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
        }
      />
      <VerbButton
        onClick={() => onRemove(session.key)}
        title="Remove"
        danger
        icon={
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
        }
      />
    </div>
  );

  if (editing) {
    return (
      <div className={rowClasses}>
        {avatar}
        {labelEl}
        {verbButtons}
      </div>
    );
  }

  return (
    <div className={rowClasses}>
      <button
        type="button"
        onClick={() => onPick(primary)}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
      >
        {avatar}
        {labelEl}
      </button>
      {verbButtons}
    </div>
  );
}
