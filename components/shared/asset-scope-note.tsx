"use client";

// A list under the asset preference (ui-jobs 557): `useScopedRows` keeps the
// rows that touch the reader's assets, and `ScopeNote` says what it hid,
// "Showing 14 of 312 vaults · Show all". Show all lifts the filter on this
// list until the page is left; the strip's "Turn off" ends AIM (components/shared/asset-scope-strip.tsx).

import { useMemo, useState } from "react";
import { useAssetScope } from "@/lib/shared/asset-scope";
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
