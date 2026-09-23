"use client";

// The folder grammar for a collapsed timeline run — one renderer, every spec.
// ----------------------------------------------------------------------------
// A collapsed run row that expands in place IS a folder, and it draws as one:
// the folder glyph in the spine's left flank, a dot on the line, the count in
// a pill, the members indented under a rail on mobile (all of that lives in
// TimelineRunCard's `folder` register / SpineColumn's folder node). What THIS
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
import { ArrowDownLeft, ArrowLeftRight, Send, TriangleAlert } from "lucide-react";
import { CHUNK_TARGET, chunkByTransaction } from "@/lib/shared/timeline-chunks";

/** What one folder knows about its place in the run: a stable key, the run's
 *  spine-terminus flags scoped to the OUTERMOST folders, and the members'
 *  already-rendered cards for the in-place expand. */
export interface RunFolderMeta {
  key: string;
  isFirst: boolean;
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
  meta: { isFirst: boolean; isLast: boolean; children: ReactNode[] },
  minRun: number,
  folderOf: (events: E[], folder: RunFolderMeta) => ReactNode,
): ReactNode {
  const zipped = run.map((event, i) => ({ event, child: meta.children[i] }));
  const chunks = chunkByTransaction(zipped, (m) => m.event.txHash, CHUNK_TARGET, minRun);
  // The folders ARE the run's presentation — siblings on the timeline, no
  // wrapper row. The run's spine-terminus flags land on its outermost folders.
  return (
    <>
      {chunks.map((chunk, i) =>
        folderOf(
          chunk.map((m) => m.event),
          {
            key: `chunk_${chunk[0].event.id}`,
            isFirst: meta.isFirst && i === 0,
            isLast: meta.isLast && i === chunks.length - 1,
            children: chunk.map((m) => m.child),
          },
        ),
      )}
    </>
  );
}

/**
 * The spine-terminus flags for a row at position `i` of a list of `length`
 * rows — where the dotted line begins and ends.
 *
 * A render-order fact, computed from position in the DISPLAYED list, which is
 * why it survived grouping moving into the index: a served folder has no run
 * around it to scope its termini to, so the row's own place in the list is the
 * whole answer. `renderRunFolders` above scopes the RUN's flags to its
 * outermost folders instead, because there the run is the thing with ends.
 *
 * Kept beside that helper rather than in the timeline component, so the two
 * grouping paths state the same fact in the same file for as long as both
 * exist (decision 0019's rollout is one family at a time).
 */
export function folderTerminus(i: number, length: number): { isFirst: boolean; isLast: boolean } {
  return { isFirst: i === 0, isLast: i === length - 1 };
}

// Corner marks a folder wears on its glyph (SpineColumn's `folderMark` /
// TimelineRunCard's `folderBadge`) — the run kind's severity at a glance,
// before anything is expanded. Kind-specific marks (a repay's undo arrow, a
// transfer direction) stay with the spec that owns the kind; these are the
// registers several protocols share.

/** Terminal adverse runs — liquidations, absorptions, auction settlements. */
export const DANGER_FOLDER_BADGE: ReactNode = <TriangleAlert size={10} strokeWidth={2.5} className="text-red-500" />;

/** Routine adverse runs — redemptions, tick rebalances. */
export const CAUTION_FOLDER_BADGE: ReactNode = (
  <TriangleAlert size={10} strokeWidth={2.5} className="text-caution-500" />
);

/** Custody runs — the paper plane, the same mark the single transfer row wears on its token. */
export const TRANSFER_FOLDER_BADGE: ReactNode = <Send size={10} strokeWidth={2.5} className="text-rb-500" />;

/** A folder holding MORE THAN ONE kind of event — the same two-way arrows
 *  the position card meta uses for its event count, so "events, various"
 *  reads the same on the folder as it does there (Miles, 2026-09-02). A
 *  one-kind folder wears its kind's own mark instead. */
export const MIXED_FOLDER_BADGE: ReactNode = <ArrowLeftRight size={10} strokeWidth={2.5} className="text-rb-500" />;

/** Third-party payouts landing in the wallet — queue fills. */
export const PAID_OUT_FOLDER_BADGE: ReactNode = <ArrowDownLeft size={10} strokeWidth={2.5} className="text-rb-500" />;
