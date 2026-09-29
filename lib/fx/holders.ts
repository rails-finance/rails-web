// Who held an f(x) position when, from its ownership rows (the pool's ERC-721
// Transfer logs). A transfer row names the holder it left and the holder it
// went to; the earlier holder took the position at the previous transfer to it,
// or, when nothing came before, at the position's first row where it is the
// address that opened it.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";

const ZERO = "0x0000000000000000000000000000000000000000";

/** The rows with each transfer carrying when its sending holder took the
 *  position (`transferFromSince`) and its own time (`transferAt`). */
export function withHolderSpans(events: BaseActivityEvent[], openedBy?: string | null): BaseActivityEvent[] {
  const fx = events.filter(isFxEvent);
  const transfers = fx
    .filter((e) => e.context.data.eventType === "transfer")
    .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);
  if (transfers.length === 0) return events;
  const firstTs = Math.min(...fx.map((e) => e.timestamp));
  const since = new Map<string, number | undefined>();
  const spans = new Map<string, { from?: number; at: number }>();
  for (const e of transfers) {
    const d = e.context.data;
    const from = d.transferFrom;
    let fromSince: number | undefined;
    if (from && from !== ZERO) {
      fromSince = since.has(from) ? since.get(from) : from === openedBy?.toLowerCase() ? firstTs : undefined;
    }
    spans.set(e.id, { from: fromSince, at: e.timestamp });
    if (d.transferTo) since.set(d.transferTo, e.timestamp);
  }
  return events.map((e) => {
    const sp = spans.get(e.id);
    if (!sp || !isFxEvent(e)) return e;
    return {
      ...e,
      context: { ...e.context, data: { ...e.context.data, transferFromSince: sp.from, transferAt: sp.at } },
    } as BaseActivityEvent;
  });
}

/** The current holder's line: who holds the position since when, and who
 *  opened it. Null where the position was never transferred. */
export function currentHolder(
  events: BaseActivityEvent[],
  owner: string | null | undefined,
  openedBy?: string | null,
): { owner: string; since: number; openedBy: string | null } | null {
  if (!owner) return null;
  const last = events
    .filter(isFxEvent)
    .filter((e) => e.context.data.eventType === "transfer" && e.context.data.transferTo === owner.toLowerCase())
    .sort((a, b) => b.blockNumber - a.blockNumber)[0];
  if (!last) return null;
  const opener = openedBy && openedBy.toLowerCase() !== owner.toLowerCase() ? openedBy.toLowerCase() : null;
  return { owner: owner.toLowerCase(), since: last.timestamp, openedBy: opener };
}
