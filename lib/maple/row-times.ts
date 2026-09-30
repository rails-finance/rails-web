// Times a Maple row states about its neighbours: when the previous row in the
// same pool happened (the period the row's "interest since" covers) and, for a
// queue fill, when its request was made (how long the fill waited). Read from
// the rows loaded on the page; a row whose neighbour is not loaded gets none.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";

export interface MapleRowTimes {
  /** Unix seconds of the previous row in this pool. */
  prevAt?: number;
  /** Queue fills: unix seconds of the request they filled. */
  requestAt?: number;
}

/** The event id ends in the log index: `<action>:<txhash>:<logIndex>`. */
const logIndexOf = (id: string): number => {
  const n = Number(id.slice(id.lastIndexOf(":") + 1));
  return Number.isFinite(n) ? n : 0;
};

export function mapleRowTimes(events: readonly BaseActivityEvent[]): Map<string, MapleRowTimes> {
  const rows = events
    .filter(isMapleEvent)
    .slice()
    .sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0) || logIndexOf(a.id) - logIndexOf(b.id));
  const out = new Map<string, MapleRowTimes>();
  const lastInPool = new Map<string, number>();
  const requestAt = new Map<string, number>();
  for (const e of rows) {
    const ctx = e.context.data;
    const times: MapleRowTimes = { prevAt: lastInPool.get(ctx.pool) };
    const reqKey = ctx.requestId != null ? `${ctx.pool}:${ctx.requestId}` : null;
    if (ctx.eventType === "request" && reqKey) requestAt.set(reqKey, e.timestamp);
    if (ctx.eventType === "request_fill" && reqKey) times.requestAt = requestAt.get(reqKey);
    out.set(e.id, times);
    lastInPool.set(ctx.pool, e.timestamp);
  }
  return out;
}

/** "4 h 36 min", "5 min", "2 d 3 h", from whole seconds. */
export function formatWait(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** A pool's rate at the wallet's first and last loaded rows in it. */
export interface MapleRateWindow {
  pool: string;
  fromAt: number;
  fromRate: number;
  toAt: number;
  toRate: number;
}

/** The pool rate each row carries (assets ÷ shares in the row's block), at the
 *  wallet's first and last loaded rows per pool: the window a yield figure
 *  derived from them covers. */
export function mapleRateWindows(events: readonly BaseActivityEvent[]): Map<string, MapleRateWindow> {
  const out = new Map<string, MapleRateWindow>();
  for (const e of events) {
    if (!isMapleEvent(e)) continue;
    const ctx = e.context.data;
    const a = Number(ctx.raw?.rateAssets);
    const sh = Number(ctx.raw?.rateShares);
    if (!(a > 0 && sh > 0)) continue;
    const rate = a / sh;
    const w = out.get(ctx.pool);
    if (!w) {
      out.set(ctx.pool, { pool: ctx.pool, fromAt: e.timestamp, fromRate: rate, toAt: e.timestamp, toRate: rate });
      continue;
    }
    if (e.timestamp < w.fromAt) Object.assign(w, { fromAt: e.timestamp, fromRate: rate });
    if (e.timestamp > w.toAt) Object.assign(w, { toAt: e.timestamp, toRate: rate });
  }
  return out;
}
