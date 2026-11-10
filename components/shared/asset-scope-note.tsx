"use client";

// A list under the asset preference (ui-jobs 557): `useScopedRows` keeps the
// rows that touch the reader's assets, and `ScopeNote` says what it hid,
// "Showing 14 of 312 vaults · Show all". Show all lifts the filter on this
// list until the page is left; Turn off in the profile menu ends Focus.

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { chainNameOf, openFocusPanel, scopeSymbolOf, useAssetScope, type AssetScope } from "@/lib/shared/asset-scope";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

export interface ScopedRows<T> {
  rows: T[];
  total: number;
  /** The preference is on for this view. */
  on: boolean;
  peek: boolean;
  setPeek: (v: boolean) => void;
  /** Spread on the list's wrapper: held hidden until the filter has run. */
  listProps: { "data-scope-list": ""; "data-scope-ready"?: "" };
  /** What the list is filtered by could not be read, so every row shows. */
  failed?: boolean;
}

/** Keeps the rows that pass the focus (AssetScope.matches): one of their keys
 *  (`chain:address`) is in focus, and their chain is focused. `chainOf` names
 *  a row's chain where its keys may not (a wallet card with no asset Rails
 *  knows still passes chain focus on its chain). */
export function useScopedRows<T>(all: T[], keysOf: (row: T) => string[], chainOf?: (row: T) => number): ScopedRows<T> {
  const scope = useAssetScope();
  const [peek, setPeek] = useState(false);
  const on = scope.on;
  const rows = useMemo(
    () => (!on || peek ? all : all.filter((r) => scope.matches(keysOf(r), chainOf?.(r)))),
    // keysOf and chainOf are pure accessors; the caller's rows and the focus decide the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, on, scope.matches, peek],
  );
  return {
    rows,
    total: all.length,
    on,
    peek,
    setPeek,
    listProps: { "data-scope-list": "", ...(scope.ready ? { "data-scope-ready": "" as const } : {}) },
  };
}

const n = (v: number) => v.toLocaleString("en-US");

export function ScopeNote<T>({
  scoped,
  noun,
  className = "",
}: {
  scoped: ScopedRows<T>;
  /** Singular and plural: ["vault", "vaults"]. */
  noun: [string, string];
  className?: string;
}) {
  if (!scoped.on) return null;
  const { rows, total, peek, setPeek } = scoped;
  const word = total === 1 ? noun[0] : noun[1];
  if (scoped.failed)
    return (
      <p className={`text-xs text-rb-500 ${className}`} data-scope-note="failed">
        Rails could not read which {noun[1]} list your assets, so all {n(total)} show.
      </p>
    );
  const press = (label: string, v: boolean) => (
    <button type="button" onClick={() => setPeek(v)} className={`font-semibold ${INPLACE_TEXT}`} data-scope-peek={v}>
      {label}
    </button>
  );
  return (
    <p className={`text-xs text-rb-500 ${className}`} data-scope-note="" data-shown={rows.length} data-total={total}>
      {peek ? (
        <>
          Showing all {n(total)} {word} · {press("Back to your focus", false)}
        </>
      ) : rows.length === 0 ? (
        <>
          None of the {n(total)} {word} is in your focus · {press("Show all", true)}
        </>
      ) : (
        <>
          Showing {n(rows.length)} of {n(total)} {word} · {press("Show all", true)}
        </>
      )}
    </p>
  );
}

/** "BOLD +2", or the chains under a chain-only focus: the locked chip's words. */
export function focusChipLabel(scope: Pick<AssetScope, "picks" | "chains">): string {
  const names = [...new Set(scope.picks.map((p) => scopeSymbolOf(p.chain, p.token) ?? `${p.token.slice(0, 6)}…`))];
  const list = names.length ? names : scope.chains.map(chainNameOf);
  return list.length ? `${list[0]}${list.length > 1 ? ` +${list.length - 1}` : ""}` : "";
}

/** The locked chip a listing draws first in its chip row under Focus (N1.9):
 *  it names the focus and opens the panel to change it. */
export function FocusLockChip() {
  const scope = useAssetScope();
  const label = focusChipLabel(scope);
  return (
    <button
      type="button"
      onClick={() => openFocusPanel()}
      className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2.5 py-1 text-xs text-teal-700 transition-colors hover:bg-teal-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-400"
      aria-label={`Focus: ${label}. Change focus`}
      data-aim-chip=""
      data-anatomy="N1.9"
    >
      <Lock className="size-3" aria-hidden="true" />
      Focus: {label}
    </button>
  );
}

/** The count a listing shows under Focus. `page` where the list is paged on
 *  the server and only the rows of this page could be judged. */
export function FocusCountNote({
  shown,
  total,
  noun,
  peek,
  setPeek,
  page,
}: {
  shown: number;
  total: number;
  noun: [string, string];
  peek: boolean;
  setPeek: (v: boolean) => void;
  page?: boolean;
}) {
  const word = total === 1 ? noun[0] : noun[1];
  const press = (label: string, v: boolean) => (
    <button type="button" onClick={() => setPeek(v)} className={`font-semibold ${INPLACE_TEXT}`} data-scope-peek={v}>
      {label}
    </button>
  );
  const of = page ? `this page's ${n(total)} ${word}` : `${n(total)} ${word}`;
  return (
    <span data-scope-note={page ? "page" : ""} data-shown={shown} data-total={total}>
      {peek ? (
        <>
          Showing all {of} · {press("Back to your focus", false)}
        </>
      ) : shown === 0 ? (
        <>
          None of {of} is in your focus · {press("Show all", true)}
        </>
      ) : (
        <>
          Showing {n(shown)} of {of} · {press("Show all", true)}
        </>
      )}
    </span>
  );
}
