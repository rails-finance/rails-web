// Events in the order they happened.
// ----------------------------------------------------------------------------
// An event id ends in its log's index WITHIN ITS TRANSACTION (`0x…_27`,
// `supply:0x…:0x…:4`), not within the block: Liquity V2's `0x2a38…_27` (the
// block's transaction 44) came before `0xaec8…_20` (transaction 143) in block
// 26014764. So the index orders the events of one transaction and nothing
// else. Two transactions in one block take the block's own position where the
// event states it (Liquity V2's `blockGrouping.sameBlockIndex`, which the
// running balances agree with); without it they keep the order they came in.

import type { BaseActivityEvent } from "@/lib/shared/types/activity";

/** The log's index within its transaction, from the id's tail. */
function txLogIndex(id: string): number | null {
  const m = /[_:](\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** The event's 1-based position in its block, where the event states one. */
function blockPosition(e: BaseActivityEvent): number | null {
  const data = (e.context as { data?: { blockGrouping?: { sameBlockIndex?: unknown } } } | undefined)?.data;
  const n = data?.blockGrouping?.sameBlockIndex;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Two events of one block (or one timestamp): the block's position where
 *  both state one, else the log index inside one transaction, else 0. */
export function compareWithinBlock(a: BaseActivityEvent, b: BaseActivityEvent): number {
  if (a.blockNumber === b.blockNumber) {
    const pa = blockPosition(a);
    const pb = blockPosition(b);
    if (pa != null && pb != null && pa !== pb) return pa - pb;
  }
  if (a.txHash && a.txHash === b.txHash) {
    const la = txLogIndex(a.id);
    const lb = txLogIndex(b.id);
    if (la != null && lb != null) return la - lb;
  }
  return 0;
}

/** Oldest first: block, then time, then `compareWithinBlock`. */
export function compareEventsInOrder(a: BaseActivityEvent, b: BaseActivityEvent): number {
  return a.blockNumber - b.blockNumber || a.timestamp - b.timestamp || compareWithinBlock(a, b);
}

/** Each event's previous one on the timeline, keyed by id: the latest earlier
 *  event that `counts` keeps (default, every event). What a card reads its
 *  carry-forward figures and its changes since the previous event from. */
export function previousEventById<E extends BaseActivityEvent>(
  events: readonly E[],
  counts: (e: E) => boolean = () => true,
): Map<string, E> {
  const out = new Map<string, E>();
  let last: E | undefined;
  for (const e of [...events].sort(compareEventsInOrder)) {
    if (last) out.set(e.id, last);
    if (counts(e)) last = e;
  }
  return out;
}
