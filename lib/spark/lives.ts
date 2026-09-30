// A SparkLend account's lives: the stretches between the account starting from
// nothing and returning to it, from each row's basket after it.
//
// Client-safe.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import { logOf } from "@/lib/aave-v3/account-switches";

export interface SparkLife {
  from: number;
  /** Unix seconds of the event that left the account empty; null while open. */
  to: number | null;
}

/** A stretch that starts again within this long of the last one ending is the
 *  same life (0x76be…4395 supplied USDS, withdrew it and began its sUSDS loan
 *  within four minutes). */
const SAME_LIFE_GAP = 24 * 60 * 60;

/** Each life starts at the first event after the account held nothing and
 *  ends at the event that left every supply and debt empty. */
export function sparkLives(events: readonly BaseActivityEvent[]): SparkLife[] {
  const rows = events
    .filter(isSparkEvent)
    .filter((e) => e.context.data.eventType !== "emode")
    .sort((a, b) => a.blockNumber - b.blockNumber || logOf(a) - logOf(b));
  const lives: SparkLife[] = [];
  let open: number | null = null;
  for (const e of rows) {
    const d = e.context.data;
    if (open == null) {
      const last = lives[lives.length - 1];
      if (last?.to != null && e.timestamp - last.to < SAME_LIFE_GAP) open = lives.pop()!.from;
      else open = e.timestamp;
    }
    // The basket leaves out dust already (lib/sources/api/spark-timeline.ts).
    const held = (d.allSupplies?.length ?? 0) + (d.allDebts?.length ?? 0) > 0;
    if (!held) {
      lives.push({ from: open, to: e.timestamp });
      open = null;
    }
  }
  if (open != null) lives.push({ from: open, to: null });
  return lives;
}
