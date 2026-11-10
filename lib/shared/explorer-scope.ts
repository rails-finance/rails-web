"use client";

// The asset preference over the explorers (ui-jobs 557): which explorers list
// any of the reader's assets, from the server's index
// (/api/prices/assets/explorers, lib/api/explorer-asset-index.ts), read once
// per page load.
//
// An explorer is "lists" (it lists a key the preference reaches), "none" (its
// list holds none of them) or "unknown" (Rails has no list for it, or the
// preference reaches a token outside the chooser's universe, which the index
// does not ship). Only "lists" shows (Miles, 9 Nov 2026); "unknown" is kept
// apart so each such explorer can be named as wanting an asset list.

import { useEffect, useMemo, useState } from "react";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { SCOPE_KEYS } from "@/lib/shared/asset-scope-tokens";
import type { ScopedRows } from "@/components/shared/asset-scope-note";
import { LAUNCHED_PROTOCOLS, type ProtocolEntry } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";

export type ExplorerStatus = "lists" | "none" | "unknown";

interface Index {
  lists: Map<string, Set<string>>;
  unknown: Set<string>;
}

let pending: Promise<Index | null> | null = null;
let loaded: Index | null | undefined;

function load(): Promise<Index | null> {
  pending ??= fetch("/api/prices/assets/explorers")
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { tokens: string[]; lists: Record<string, number[]>; unknown: string[] } | null) => {
      loaded = b
        ? {
            lists: new Map(Object.entries(b.lists).map(([id, ix]) => [id, new Set(ix.map((i) => b.tokens[i]))])),
            unknown: new Set(b.unknown),
          }
        : null;
      return loaded;
    })
    .catch(() => {
      pending = null;
      loaded = null;
      return null;
    });
  return pending;
}

export interface ExplorerScope {
  /** The preference is on and the index has arrived: the explorers are judged. */
  on: boolean;
  /** Settled: off, or judged, or the index failed (everything shows). */
  ready: boolean;
  statusOf: (id: string) => ExplorerStatus;
}

export function useExplorerScope(): ExplorerScope {
  const scope = useAssetScope();
  const [index, setIndex] = useState<Index | null | undefined>(loaded);
  const wanted = scope.keys != null;
  useEffect(() => {
    if (!wanted || index !== undefined) return;
    let live = true;
    load().then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [wanted, index]);

  return useMemo(() => {
    const keys = scope.keys;
    const on = keys != null && index != null;
    // A key the index cannot speak for leaves every unmatched explorer unknown.
    const outside = keys != null && [...keys].some((k) => !SCOPE_KEYS.has(k));
    const statusOf = (id: string): ExplorerStatus => {
      if (!on || index.unknown.has(id)) return "unknown";
      const list = index.lists.get(id);
      if (!list) return "unknown";
      for (const k of keys) if (list.has(k)) return "lists";
      return outside ? "unknown" : "none";
    };
    return { on, ready: scope.ready && (keys == null || index !== undefined), statusOf };
  }, [scope.keys, scope.ready, index]);
}

export interface ScopedRoster extends ScopedRows<ProtocolEntry> {
  /** Filtering now: the preference is on, judged, and this list is not lifted. */
  filtering: boolean;
  /** An explorer shows: it lists one of the reader's assets, or nothing is filtered. */
  shows: (id: string) => boolean;
  /** A chain shows: some explorer on it lists one of the reader's assets. */
  chainShows: (chainId: ChainId) => boolean;
  /** The launched explorers Rails cannot judge (hidden while filtering). */
  unknown: ProtocolEntry[];
}

/** The explorer roster under Focus (Miles, 9 Nov 2026: strict). An explorer
 *  shows only on a focused chain (every chain when none is focused) and, with
 *  assets picked, only where it lists a key the focus reaches; a chain only
 *  where one of its explorers shows. Chain focus alone needs no asset list, so
 *  the explorers Rails has none for show on their chain. `rows` and `total`
 *  count explorers across every chain, for ScopeNote. */
export function useScopedRoster(): ScopedRoster {
  const scope = useAssetScope();
  const ex = useExplorerScope();
  const [peek, setPeek] = useState(false);
  const assets = scope.keys != null;
  // Judged: chains alone are known at once; assets wait for the index.
  const judged = scope.on && (!assets || ex.on);
  const filtering = judged && !peek;
  return useMemo(() => {
    const listing = new Set(
      LAUNCHED_PROTOCOLS.filter((p) => scope.chainOk(p.chainId) && (!assets || ex.statusOf(p.id) === "lists")).map(
        (p) => p.id,
      ),
    );
    const chains = new Set(LAUNCHED_PROTOCOLS.filter((p) => listing.has(p.id)).map((p) => p.chainId));
    return {
      filtering,
      shows: (id) => !filtering || listing.has(id),
      chainShows: (c) => !filtering || chains.has(c),
      unknown:
        assets && ex.on
          ? LAUNCHED_PROTOCOLS.filter((p) => scope.chainOk(p.chainId) && ex.statusOf(p.id) === "unknown")
          : [],
      rows: filtering ? LAUNCHED_PROTOCOLS.filter((p) => listing.has(p.id)) : LAUNCHED_PROTOCOLS,
      total: LAUNCHED_PROTOCOLS.length,
      on: judged,
      peek,
      setPeek,
      listProps: { "data-scope-list": "", ...(ex.ready ? { "data-scope-ready": "" as const } : {}) },
    };
  }, [ex, scope, assets, judged, filtering, peek]);
}

/** Whether any explorer on `chain` lists one of `keys`; null until the index has arrived. */
export function useListedOn(): ((keys: Set<string>, chain: number) => boolean) | null {
  const [index, setIndex] = useState<Index | null | undefined>(loaded);
  useEffect(() => {
    if (index !== undefined) return;
    let live = true;
    load().then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [index]);
  return useMemo(() => {
    if (!index) return null;
    return (keys, chain) =>
      LAUNCHED_PROTOCOLS.some((p) => {
        if (p.chainId !== chain) return false;
        const list = index.lists.get(p.id);
        return !!list && [...keys].some((k) => list.has(k));
      });
  }, [index]);
}
