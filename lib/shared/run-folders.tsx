"use client";

// The folder grammar for a collapsed timeline run — one renderer, every spec.
// ----------------------------------------------------------------------------
// A collapsed run row that expands in place IS a folder, and it draws as a
// group (TimelineRunCard in its bracket frame, group-frame.tsx). What THIS
// module holds is the run→folders step every spec shares: a run longer than
// ~CHUNK_TARGET splits into chronological folders of ~100 consecutive events
// (`chunkByTransaction` — a transaction never splits across folders), each a
// top-level sibling on the timeline with its own tight date range and
// chunk-scoped aggregates; a shorter run is simply one folder — same grammar,
// no special case. First built for Moonwell's churn (design note: rails-ops
// reference/timeline-attention-budget.md, revision 2026-09-01), rolled out to
// every protocol's run spec 2026-09-02.
//
// GROUPING IS MOVING INTO THE INDEX, ONE FAMILY AT A TIME. Decision 0019's
// evening amendment makes the timeline's cut count ROWS rather than events,
// which only pays if the folders exist before the response is written — so
// SparkLend and Aave V3 now read their folders off the wire
// (`lib/shared/timeline-folder.ts`), and a family joins them once the index
// carries each event's running state rather than the client reconstructing it.
// Everything in THIS file stays until the last family is across: fifteen specs
// still call `renderRunFolders`, and the corner marks below are display, which
// never moved at all. The two paths draw the same card.

import type { ReactNode } from "react";
import { CHUNK_TARGET, chunkByTransaction } from "@/lib/shared/timeline-chunks";
import { RunLandingContext } from "@/components/shared/timeline-run-card";
import { GroupNumbersContext } from "@/components/shared/group-frame";

/** The lowest and highest of a folder's event numbers, where all are known. */
function numberRange(ns: (number | null | undefined)[]): [number, number] | null {
  const known = ns.filter((n): n is number => typeof n === "number");
  if (known.length === 0 || known.length < ns.length) return null;
  return [Math.min(...known), Math.max(...known)];
}

/** What one folder knows about its place in the run: a stable key, the run's
 *  spine-terminus flag scoped to the LAST folder, and the members'
 *  already-rendered cards for the in-place expand. */
export interface RunFolderMeta {
  key: string;
  isLast: boolean;
  children: ReactNode[];
}

/**
 * Render a run as its chronological folders. `folderOf` builds one folder's
 * card from its slice of events — aggregates, counts and date range all
 * scoped to the slice — and must put `folder.key` on the element it returns.
 * `minRun` doubles as the chunker's tail floor: a trailing remnant shorter
 * than the spec's own run floor joins the previous folder instead of standing
 * as a folder of two.
 */
export function renderRunFolders<E extends { id: string; txHash: string }>(
  run: E[],
  meta: {
    isLast: boolean;
    children: ReactNode[];
    landingId?: string;
    /** Each member's event number, in run order: the folder's node states
     *  its range. */
    eventNumbers?: (number | null | undefined)[];
  },
  minRun: number,
  folderOf: (events: E[], folder: RunFolderMeta) => ReactNode,
): ReactNode {
  const zipped = run.map((event, i) => ({ event, child: meta.children[i], n: meta.eventNumbers?.[i] }));
  const chunks = chunkByTransaction(zipped, (m) => m.event.txHash, CHUNK_TARGET, minRun);
  // The folders ARE the run's presentation — siblings on the timeline, no
  // wrapper row. The run's spine-terminus flag lands on its last folder.
  return (
    <>
      {chunks.map((chunk, i) => (
        <RunLandingContext.Provider
          key={`chunk_${chunk[0].event.id}`}
          value={meta.landingId != null && chunk.some((m) => m.event.id === meta.landingId)}
        >
          <GroupNumbersContext.Provider value={numberRange(chunk.map((m) => m.n))}>
            {folderOf(
              chunk.map((m) => m.event),
              {
                key: `chunk_${chunk[0].event.id}`,
                isLast: meta.isLast && i === chunks.length - 1,
                children: chunk.map((m) => m.child),
              },
            )}
          </GroupNumbersContext.Provider>
        </RunLandingContext.Provider>
      ))}
    </>
  );
}

/**
 * The spine-terminus flag for a row at position `i` of a list of `length`
 * rows: where the line ends.
 *
 * A render-order fact, computed from position in the DISPLAYED list, which is
 * why it survived grouping moving into the index: a served folder has no run
 * around it to scope its termini to, so the row's own place in the list is the
 * whole answer. `renderRunFolders` above scopes the RUN's flag to its
 * last folder instead, because there the run is the thing with ends.
 *
 * Kept beside that helper rather than in the timeline component, so the two
 * grouping paths state the same fact in the same file for as long as both
 * exist (decision 0019's rollout is one family at a time).
 */
export function folderTerminus(i: number, length: number): { isLast: boolean } {
  return { isLast: i === length - 1 };
}
