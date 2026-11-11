// The status page's reading of rails-server's `GET /api/index/progress`
// (rails-ops ui-jobs 583, decision 0064 point 4; the answer's shape and the
// source of each figure are rails-ops reference/indexing-progress-data.md).
// One row per protocol, one chip per chain. A heartbeat older than
// HEARTBEAT_LATE shows as late and one older than HEARTBEAT_STALLED as
// stalled, so a source that stops reporting never keeps its last green.
//
// Pure: no `@/` imports, so a node:test can read it.

/** Unix seconds. */
type Secs = number;

export interface IndexSource {
  filter: string;
  contracts: string[];
  events: { name: string; topic0: string }[];
  hosts: string[];
  startBlock: number | null;
  throughBlock: number | null;
  endBlock: number | null;
}

export interface IndexCheck {
  ok: boolean;
  block: number;
  ranAt: string;
  atHead: boolean;
  checked: number;
  passed: number;
  summary: string;
}

export interface IndexProgressEntry {
  protocol: string;
  chain: number;
  label: string;
  start: { block: number; time: Secs | null; isDeployment: boolean } | null;
  deployment: { block: number; time: Secs | null } | null;
  through: { block: number; time: Secs | null } | null;
  head: { block: number; time: Secs | null } | null;
  percent: number | null;
  atHead: boolean;
  rows: number;
  requests: number;
  bytesRead: number;
  pace: { blocksPerHour: number; headBlocksPerHour: number; since: Secs } | null;
  eta: string | null;
  check: IndexCheck | null;
  sources?: IndexSource[];
  sieve?: { tables: { table: string; fromBlock: number }[]; checkpoint: number };
}

export interface IndexProgress {
  asOf: string;
  indexes: IndexProgressEntry[];
}

/** One protocol's row: its name and its indexes in the server's order. */
export interface ProtocolRow {
  protocol: string;
  name: string;
  indexes: IndexProgressEntry[];
}

/** The protocol's name from the server's label ("CoW Protocol · Base"). */
export const protocolName = (e: IndexProgressEntry): string => e.label.split(" · ")[0] ?? e.protocol;

/** The indexes grouped by protocol, in the order each protocol first appears
 *  (the server puts CoW first, decision 0064 point 5). */
export function protocolRows(indexes: IndexProgressEntry[]): ProtocolRow[] {
  const rows = new Map<string, ProtocolRow>();
  for (const e of indexes) {
    const row = rows.get(e.protocol) ?? { protocol: e.protocol, name: protocolName(e), indexes: [] };
    row.indexes.push(e);
    rows.set(e.protocol, row);
  }
  return [...rows.values()];
}

/** The fill plans each index every 10 min against the chain's finalized
 *  block, which trails the wall clock by up to about half an hour on the
 *  rollups. Past an hour the heartbeat is late; past three it has stalled. */
export const HEARTBEAT_LATE = 60 * 60;
export const HEARTBEAT_STALLED = 3 * 60 * 60;

export type Heartbeat = "fresh" | "late" | "stalled" | "none";

/** The time of the index's last heartbeat: the finalized head the fill last
 *  planned it against. Null when the fill has not planned it yet. */
export const heartbeatTime = (e: IndexProgressEntry): Secs | null => e.head?.time ?? null;

export function heartbeatState(e: IndexProgressEntry, now: Secs): Heartbeat {
  const t = heartbeatTime(e);
  if (t == null) return "none";
  const age = now - t;
  return age > HEARTBEAT_STALLED ? "stalled" : age > HEARTBEAT_LATE ? "late" : "fresh";
}

/** "4 min", "2 h 10 min", "3 days": the age of a time, for a heartbeat. */
export function ageWords(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return "1 min";
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/** The chip's figure: the percent read, "at head" once reached, or a dash
 *  when the server has no head to measure against. */
export function percentWords(e: IndexProgressEntry): string {
  if (e.atHead) return "100%";
  if (e.percent == null) return "–";
  if (e.percent >= 99.95) return "99.9%";
  return `${e.percent >= 10 ? e.percent.toFixed(0) : e.percent.toFixed(1)}%`;
}

/** Bytes as MB or GB, one decimal. */
export function bytesWords(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}
