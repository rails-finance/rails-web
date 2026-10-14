"use client";

// The position's event count as the timeline's toolbar states it, handed to
// the Lifetime flows panel so its loading state can name the scale of the
// read ("Loading 44,898 events…", rails-ops TO-DO-ui-jobs 333). The
// timeline publishes it under the page's path and the panel reads it there:
// the two are siblings on every position page, with no shared provider
// between them. A page that draws two timelines (Compound V3 Base, one per
// market) has two counts on one path, and the panel then states none.

import { useEffect, useId, useSyncExternalStore } from "react";

export interface LifeCount {
  n: number;
  /** The arm could bound the count, not read it: "at least". */
  atLeast: boolean;
}

const byPath = new Map<string, Map<string, LifeCount>>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The timeline's side: publish the count (null while it is not known). */
export function usePublishLifeCount(path: string | null, count: LifeCount | null): void {
  const id = useId();
  const n = count?.n ?? null;
  const atLeast = count?.atLeast ?? false;
  useEffect(() => {
    if (!path || n == null) return;
    let here = byPath.get(path);
    if (!here) byPath.set(path, (here = new Map()));
    here.set(id, { n, atLeast });
    emit();
    return () => {
      const now = byPath.get(path);
      if (!now) return;
      now.delete(id);
      if (now.size === 0) byPath.delete(path);
      emit();
    };
  }, [path, id, n, atLeast]);
}

/** The panel's side: the one count published on this path, else null. Read
 *  through the snapshot, so hydration takes the server's null. */
export function useLifeCount(path: string | null): LifeCount | null {
  return useSyncExternalStore(
    subscribe,
    () => lookup(path),
    () => null,
  );
}

function lookup(path: string | null): LifeCount | null {
  const here = path ? byPath.get(path) : undefined;
  if (!here || here.size !== 1) return null;
  return here.values().next().value ?? null;
}
