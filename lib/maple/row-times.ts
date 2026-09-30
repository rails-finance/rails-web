// Times a Maple row states about its neighbours: when the previous row in the
// same pool happened (the period the row's "interest since" covers) and, for a
// queue fill, when its request was made (how long the fill waited). Read from
// the rows loaded on the page and the folders the index served: a folder's
// last member dates the row after it, even before the folder is opened.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";

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

/** The pools a served folder's members sit in: its legs' pool keys, or the
 *  pools its boundary state names. */
export function folderPools(f: ServedFolder): Set<string> {
  const pools = new Set(f.legs.map((l) => l.asset.toLowerCase()));
  for (const key of Object.keys(f.stateAfter ?? {})) {
    const pool = key.split(":")[1];
    if (pool) pools.add(pool.toLowerCase());
  }
  return pools;
}

/** Folders whose members are not on the page, with the pools they cover. */
function unreadFolders(folders: readonly ServedFolder[] | null | undefined, read: ReadonlySet<string>) {
  return (folders ?? []).filter((f) => !read.has(f.responseId)).map((f) => ({ f, pools: folderPools(f) }));
}

export function mapleRowTimes(
  events: readonly BaseActivityEvent[],
  folders?: readonly ServedFolder[] | null,
  read: ReadonlySet<string> = new Set(),
): Map<string, MapleRowTimes> {
  // An unopened folder stands in the sequence at its last member: the row
  // after it dates its interest from that member. A folder over several pools
  // cannot say which pool its last member was in, so the rows after it in
  // those pools state no period rather than a wrong one.
  type Mark = { block: number; log: number; folder?: { at: number; pools: Set<string> }; event?: BaseActivityEvent };
  const marks: Mark[] = [
    ...events.filter(isMapleEvent).map((e) => ({ block: e.blockNumber ?? 0, log: logIndexOf(e.id), event: e })),
    ...unreadFolders(folders, read).map(({ f, pools }) => ({
      block: f.lastBlock,
      log: Number.MAX_SAFE_INTEGER,
      folder: { at: f.lastAt, pools },
    })),
  ].sort((a, b) => a.block - b.block || a.log - b.log);
  const out = new Map<string, MapleRowTimes>();
  const lastInPool = new Map<string, number>();
  const requestAt = new Map<string, number>();
  for (const m of marks) {
    if (m.folder) {
      for (const pool of m.folder.pools) {
        if (m.folder.pools.size === 1) lastInPool.set(pool, m.folder.at);
        else lastInPool.delete(pool);
      }
      continue;
    }
    const e = m.event!;
    if (!isMapleEvent(e)) continue;
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
 *  wallet's first and last rows per pool: the window a yield figure derived
 *  from them covers. A pool whose first or last row sits in a folder the page
 *  has not read gets no window: its ends are not on the page. */
export function mapleRateWindows(
  events: readonly BaseActivityEvent[],
  folders?: readonly ServedFolder[] | null,
  read: ReadonlySet<string> = new Set(),
): Map<string, MapleRateWindow> {
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
  for (const { f, pools } of unreadFolders(folders, read)) {
    for (const pool of pools) {
      const w = out.get(pool);
      if (w && (f.firstAt < w.fromAt || f.lastAt > w.toAt)) out.delete(pool);
    }
  }
  return out;
}

/** The folders that hold a pool's first or last row, where the page has not
 *  read them: the reads the yield window and the since-last-event line need. */
export function mapleBoundaryFolders(
  events: readonly BaseActivityEvent[],
  folders: readonly ServedFolder[] | null | undefined,
  read: ReadonlySet<string>,
): ServedFolder[] {
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const e of events) {
    if (!isMapleEvent(e)) continue;
    const pool = e.context.data.pool;
    first.set(pool, Math.min(first.get(pool) ?? Infinity, e.timestamp));
    last.set(pool, Math.max(last.get(pool) ?? -Infinity, e.timestamp));
  }
  const need = new Map<string, ServedFolder>();
  const oldest = new Map<string, ServedFolder>();
  const newest = new Map<string, ServedFolder>();
  for (const f of folders ?? []) {
    for (const pool of folderPools(f)) {
      if (!oldest.has(pool) || f.firstAt < oldest.get(pool)!.firstAt) oldest.set(pool, f);
      if (!newest.has(pool) || f.lastAt > newest.get(pool)!.lastAt) newest.set(pool, f);
    }
  }
  for (const [pool, f] of oldest) if (f.firstAt < (first.get(pool) ?? Infinity)) need.set(f.responseId, f);
  for (const [pool, f] of newest) if (f.lastAt > (last.get(pool) ?? -Infinity)) need.set(f.responseId, f);
  return [...need.values()].filter((f) => !read.has(f.responseId));
}

/** One pool's stretch from the wallet's newest row to now. */
export interface MapleSinceLastEvent {
  pool: string;
  poolSymbol: string;
  assetSymbol: string;
  /** Unix seconds and block of the newest row in the pool. */
  lastAt: number;
  lastBlock: number;
  /** The claim just after that row, at its block rate (the row's own figure). */
  claimThen: number;
  claimThenExact: string;
  /** The claim now: (shares + escrowed) × the exit rate at `blockNow`. */
  claimNow: number;
  blockNow: number;
  /** claimNow − claimThen: the interest no row states. */
  interest: number;
}

/** Per live pool, the interest since the wallet's newest row: the claim now
 *  less the claim that row left. Nothing moved the holding in between (every
 *  share movement is a row), so the difference is the pool's rate rising on
 *  it. A pool whose newest row sits in an unread folder gets nothing. */
export function mapleSinceLastEvent(
  events: readonly BaseActivityEvent[],
  folders: readonly ServedFolder[] | null | undefined,
  read: ReadonlySet<string>,
  pools: readonly {
    pool: string;
    symbol: string;
    assetSymbol: string;
    currentValue: number | null;
    shares: number;
    escrowedShares: number;
  }[],
  blockOf: (pool: string) => number | undefined,
): MapleSinceLastEvent[] {
  const unread = unreadFolders(folders, read);
  const out: MapleSinceLastEvent[] = [];
  for (const p of pools) {
    const blockNow = blockOf(p.pool);
    if (p.currentValue == null || blockNow == null || p.shares + p.escrowedShares <= 0) continue;
    let newest: BaseActivityEvent | undefined;
    for (const e of events) {
      if (!isMapleEvent(e) || e.context.data.pool !== p.pool) continue;
      if (
        !newest ||
        (e.blockNumber ?? 0) - (newest.blockNumber ?? 0) > 0 ||
        ((e.blockNumber ?? 0) === (newest.blockNumber ?? 0) && logIndexOf(e.id) > logIndexOf(newest.id))
      )
        newest = e;
    }
    if (!newest || !isMapleEvent(newest)) continue;
    const lastBlock = newest.blockNumber ?? 0;
    if (unread.some(({ f, pools }) => pools.has(p.pool) && f.lastBlock >= lastBlock)) continue;
    const then = newest.context.data.valueAfter;
    if (then == null || !Number.isFinite(Number(then))) continue;
    const claimThen = Number(then);
    out.push({
      pool: p.pool,
      poolSymbol: p.symbol,
      assetSymbol: p.assetSymbol,
      lastAt: newest.timestamp,
      lastBlock,
      claimThen,
      claimThenExact: then,
      claimNow: p.currentValue,
      blockNow,
      interest: p.currentValue - claimThen,
    });
  }
  return out;
}
