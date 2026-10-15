"use client";

// The folder grammar for a collapsed timeline run — one renderer, every spec.
// ----------------------------------------------------------------------------
// A collapsed run row that expands in place IS a folder, and it draws as a
// group (TimelineRunCard in its bracket frame, group-frame.tsx). A run is one
// folder whatever its length (rails-ops decision 0039); the spec's `folderOf`
// builds its card from the members. The families the index or the web's route
// pass groups read their folders off the wire (`lib/shared/timeline-folder.ts`)
// and draw the same card.

import type { ReactNode } from "react";
import { RunLandingContext } from "@/components/shared/timeline-run-card";
import { GroupNumbersContext } from "@/components/shared/group-frame";

/** The lowest and highest of a folder's event numbers, where all are known. */
function numberRange(ns: (number | null | undefined)[]): [number, number] | null {
  if (ns.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of ns) {
    if (typeof n !== "number") return null;
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  return [lo, hi];
}

const runMemos = new WeakMap<readonly object[], Map<(events: never) => unknown, unknown>>();

/**
 * A run's header sums, computed once per member list (rails-ops decision 0039,
 * rule 5). `settleRunRows` interns a run's members, so a re-render, or a
 * resettle that leaves the run whole, hands back the same array and the sums
 * are read from here. `summarise` is the key: a module-level function (or one
 * made once per spec factory call), never a closure made during render.
 */
export function runMemo<E, R>(events: readonly E[], summarise: (events: readonly E[]) => R): R {
  const key = events as unknown as readonly object[];
  let byFn = runMemos.get(key);
  if (!byFn) runMemos.set(key, (byFn = new Map()));
  if (byFn.has(summarise)) return byFn.get(summarise) as R;
  const sums = summarise(events);
  byFn.set(summarise, sums);
  return sums;
}

/** What the folder knows about its place on the timeline: a stable key, the
 *  run's spine-terminus flag, and the members' already-rendered cards for the
 *  in-place expand. */
export interface RunFolderMeta {
  key: string;
  isLast: boolean;
  children: ReactNode[];
}

interface RunMeta {
  isLast: boolean;
  children: ReactNode[];
  landingId?: string;
  /** Each member's event number, in run order: the folder's node states
   *  its range. */
  eventNumbers?: (number | null | undefined)[];
}

type FolderOf<E> = (events: E[], folder: RunFolderMeta) => ReactNode;

/**
 * Render a run as its folder. `folderOf` builds the card from the run's
 * events and must put `folder.key` on the element it returns. The numeric
 * argument of the four-argument form is accepted and unused: it was the
 * retired per-kind floor.
 */
export function renderRunFolders<E extends { id: string; txHash: string }>(
  run: E[],
  meta: RunMeta,
  folderOf: FolderOf<E>,
): ReactNode;
export function renderRunFolders<E extends { id: string; txHash: string }>(
  run: E[],
  meta: RunMeta,
  unusedFloor: number,
  folderOf: FolderOf<E>,
): ReactNode;
export function renderRunFolders<E extends { id: string; txHash: string }>(
  run: E[],
  meta: RunMeta,
  a: number | FolderOf<E>,
  b?: FolderOf<E>,
): ReactNode {
  const folderOf = (typeof a === "function" ? a : b) as FolderOf<E>;
  const key = `chunk_${run[0].id}`;
  return (
    <RunLandingContext.Provider key={key} value={meta.landingId != null && run.some((e) => e.id === meta.landingId)}>
      <GroupNumbersContext.Provider value={meta.eventNumbers ? numberRange(meta.eventNumbers) : null}>
        {folderOf(run, { key, isLast: meta.isLast, children: meta.children })}
      </GroupNumbersContext.Provider>
    </RunLandingContext.Provider>
  );
}

/**
 * The spine-terminus flag for a row at position `i` of a list of `length`
 * rows: where the line ends.
 *
 * A render-order fact, computed from position in the DISPLAYED list, which is
 * why it survived grouping moving into the index: a served folder has no run
 * around it to scope its termini to, so the row's own place in the list is the
 * whole answer. `renderRunFolders` above takes the RUN's flag instead,
 * because there the run is the thing with ends.
 *
 * Kept beside that helper rather than in the timeline component, so the two
 * grouping paths state the same fact in the same file for as long as both
 * exist (decision 0019's rollout is one family at a time).
 */
export function folderTerminus(i: number, length: number): { isLast: boolean } {
  return { isLast: i === length - 1 };
}
