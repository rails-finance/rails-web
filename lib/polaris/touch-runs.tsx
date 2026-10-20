// Polaris — a run of touches as one row (rails-ops TO-DO-ui-jobs 404). A
// touch is an adjust that moved neither collateral nor debt: the log writes
// the pending legs into the CDP's figures and nothing the holder chose moves.
// Two or more in a row, with no other event between them and one sender, draw
// as one run row, "Touched CDP [9]" with the date range, opening to the
// members, each keeping its page, number and share link (the shared event run,
// `TimelineRunCard`). The node is the touch's fingerprint.
//
// Who sent a touch is the row's own `txFrom`; the holder at that row is read
// off the page: the position's holder at its open, then each NFT transfer's
// recipient (`polarisHoldersAt`).

import { isPolarisEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** An adjust that moved neither collateral nor debt. */
export function isPolarisTouch(e: BaseActivityEvent): boolean {
  if (!isPolarisEvent(e)) return false;
  const d = e.context.data;
  return d.eventType === "adjust" && num(d.collChange) === 0 && num(d.debtChange) === 0;
}

/** The CDP's holder at each event, by event id: `ownerAtOpen` (or the open's
 *  sender where the index has not said) until a transfer, then each
 *  transfer's recipient. */
export function polarisHoldersAt(
  events: readonly BaseActivityEvent[],
  ownerAtOpen?: string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  const asc = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  let holder: string | null = ownerAtOpen?.toLowerCase() ?? null;
  for (const e of asc) {
    if (!isPolarisEvent(e)) continue;
    const d = e.context.data;
    if (holder == null && d.eventType === "open" && d.txFrom) holder = d.txFrom.toLowerCase();
    if (holder) out.set(e.id, holder);
    if (d.eventType === "transfer" && d.toAddr) holder = d.toAddr.toLowerCase();
  }
  return out;
}

const senderOf = (e: BaseActivityEvent) => (isPolarisEvent(e) ? (e.context.data.txFrom ?? "").toLowerCase() : "");

/** The touch run, for a page whose holders are `holderOf`. */
export function polarisTouchRuns(holderOf: (id: string) => string | undefined): TimelineRunSpec[] {
  return [
    {
      match: isPolarisTouch,
      floor: 2,
      // One sender per run: the holder's touches and a keeper's do not join.
      sameRun: (a, b) => senderOf(a) === senderOf(b),
      render: (run, meta) =>
        renderRunFolders(run, meta, (events, folder) => {
          const first = events[0];
          const holder = holderOf(first.id);
          const sender = senderOf(first);
          return (
            <TimelineRunCard
              key={folder.key}
              count={events.length}
              memberNoun="touch"
              kindWord={POLARIS_WORDS.t1_touched}
              tone="neutral"
              spineIcon="touch"
              byOwner={!holder || !sender || holder === sender}
              firstTimestamp={events[0].timestamp}
              lastTimestamp={events[events.length - 1].timestamp}
              isLast={folder.isLast}
            >
              {folder.children}
            </TimelineRunCard>
          );
        }),
    },
  ];
}
