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
  /** On /progress only. */
  requests?: number;
  bytesRead?: number;
  pace: { blocksPerHour: number; headBlocksPerHour: number; since: Secs } | null;
  eta: string | null;
  check: IndexCheck | null;
  sources?: IndexSource[];
  sieve?: { tables: { table: string; fromBlock: number }[]; checkpoint: number };
  /** Wall time (ISO) of the fill's last hourly sample for this index. */
  heartbeatAt?: string | null;
  /** Why the fill is holding this index, where it is. */
  held?: FillHold | null;
}

/** A fill's hold on an index: the free gateway's allowance under the floor
 *  kept in reserve, or one of the fill's other holds. */
export type FillHold =
  | { reason: "egress-floor"; floorBytes: number; remainingBytes: number; resetsAt: string }
  | { reason: "paused" | "fill-error" | "check-running" | "job-failed"; detail: string | null; since: string | null };

/** The free gateway's daily allowance: one counter for every network. */
export interface Allowance {
  host: string;
  allowanceToday: number | null;
  usedToday: number | null;
  remaining: number | null;
  floorBytes: number | null;
  resetsAt: string | null;
  seenAt: string | null;
}

export interface IndexProgress {
  asOf: string;
  indexes: IndexProgressEntry[];
}

/** The fill plans each index every 10 min against the chain's finalized
 *  block, which trails the wall clock by up to about half an hour on the
 *  rollups. Past an hour the heartbeat is late; past three it has stalled. */
export const HEARTBEAT_LATE = 60 * 60;
export const HEARTBEAT_STALLED = 3 * 60 * 60;

export type Heartbeat = "fresh" | "late" | "stalled" | "paused" | "none";

const isoSecs = (iso: string | null | undefined): Secs | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t / 1000 : null;
};

/** The time of the index's last heartbeat: the wall time of the fill's last
 *  sample where the server sends it, else the finalized head the fill last
 *  planned against. Null when the fill has not planned it yet. */
export const heartbeatTime = (e: IndexProgressEntry): Secs | null => isoSecs(e.heartbeatAt) ?? e.head?.time ?? null;

/** Whether `heartbeatTime` is a wall time (true) or a block's time. */
export const heartbeatIsWallTime = (e: IndexProgressEntry): boolean => isoSecs(e.heartbeatAt) != null;

export function heartbeatAge(t: Secs | null, now: Secs): Heartbeat {
  if (t == null) return "none";
  const age = now - t;
  return age > HEARTBEAT_STALLED ? "stalled" : age > HEARTBEAT_LATE ? "late" : "fresh";
}

export const heartbeatState = (e: IndexProgressEntry, now: Secs): Heartbeat => heartbeatAge(heartbeatTime(e), now);

/** Whether a fill is moving. The fill writes its sample every 10 min even
 *  while it holds an index, so a fresh heartbeat alone does not mean blocks
 *  are being read. "not-gaining": no blocks read over the pace window (an
 *  hour or more of samples); "behind": read to within rounding of the head,
 *  then fell more than 30 min of blocks behind it. Null when neither holds. */
export function fillStall(e: IndexProgressEntry): "not-gaining" | "behind" | null {
  if (e.atHead) return null;
  if (e.percent != null && e.percent >= 99.95) return "behind";
  if (e.pace && e.pace.blocksPerHour === 0) return "not-gaining";
  return null;
}

/** A fill's state: its heartbeat's age, and never better than late while it
 *  is not moving. */
export function fillState(e: IndexProgressEntry, now: Secs): Heartbeat {
  // Held on purpose: the allowance, or the fill's switch. A check runs in
  // seconds and reads as the heartbeat; an error or a failed job is late.
  const r = e.held?.reason;
  if (r === "egress-floor" || r === "paused") return "paused";
  if (r === "fill-error" || r === "job-failed") return "late";
  const hb = heartbeatState(e, now);
  return fillStall(e) && (hb === "fresh" || hb === "none") ? "late" : hb;
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

// ── GET /api/index/status: every explorer's backfill and live lane ──────────

export interface StatusWriter {
  name: string;
  kind: "processor" | "copy-worker" | "mv-refresh";
  lastWriteAt: string | null;
  newest: { block: number; time: Secs | null } | null;
  /** How often the writer runs, from its schedule; null where none is stored. */
  expectEverySec?: number | null;
}

/** The last hour of reads made when a page opens (the tier-request tally). */
export interface VisitReads {
  gateway: string;
  lastHourVisits?: number;
  failedShare?: number | null;
  byCause?: Record<string, number>;
  p95Ms?: number | null;
  bytes?: number;
  lastVisitAt?: string | null;
}

export interface StatusBackfill
  extends Omit<IndexProgressEntry, "protocol" | "chain" | "label" | "rows" | "atHead" | "requests" | "bytesRead"> {
  pipeline: string;
  rows: number | null;
  atHead: boolean | null;
}

export interface StatusLive {
  lane: string;
  checkpoint: { block: number; time: Secs | null; updatedAt?: string | null } | null;
  head: { block: number; time: Secs | null } | null;
  writers: StatusWriter[];
  visitReads: VisitReads | null;
  unreachable?: { error: string };
}

export interface StatusEntry {
  protocol: string;
  chain: number;
  /** The web roster's key where it differs from the server's. */
  web?: string | null;
  backfill: StatusBackfill | null;
  live: StatusLive | null;
}

export interface IndexStatus {
  asOf: string;
  entries: StatusEntry[];
  lanes?: { lane: string; chain: number; checkpoint: StatusLive["checkpoint"]; unreachable?: { error: string } }[];
  gateways?: unknown[];
  allowance?: Allowance | null;
}

/** One cell of the status table, from either route. */
export interface StatusCell {
  protocol: string;
  /** The roster's protocol key (`protocolKey ?? id`). */
  key: string;
  chain: number;
  /** "fill": the full-history fill, with every figure; "pipeline": Sieve or a
   *  processor, with its marks; "not-started": no index yet. */
  kind: "fill" | "pipeline" | "not-started";
  fill: IndexProgressEntry | null;
  entry: StatusEntry | null;
}

/** The cells from /progress (the fill only). */
export const cellsFromProgress = (p: IndexProgress): StatusCell[] =>
  p.indexes.map((e) => ({ protocol: e.protocol, key: e.protocol, chain: e.chain, kind: "fill", fill: e, entry: null }));

/** The cells from /status. A fill entry keeps /progress's figures. */
export function cellsFromStatus(s: IndexStatus, name: (key: string, chain: number) => string): StatusCell[] {
  return s.entries.map((entry) => {
    const key = entry.web ?? entry.protocol;
    const b = entry.backfill;
    if (b?.pipeline === "fill") {
      const { pipeline: _pipeline, ...figures } = b;
      void _pipeline;
      const fill: IndexProgressEntry = {
        ...figures,
        protocol: entry.protocol,
        chain: entry.chain,
        label: name(key, entry.chain),
        rows: b.rows ?? 0,
        atHead: b.atHead ?? false,
      };
      return { protocol: entry.protocol, key, chain: entry.chain, kind: "fill", fill, entry };
    }
    return {
      protocol: entry.protocol,
      key,
      chain: entry.chain,
      kind: b ? "pipeline" : "not-started",
      fill: null,
      entry,
    };
  });
}

/** Visit reads: amber from a 10% failure share in the last hour, red from 50%;
 *  none with no visit in the hour. */
export const VISIT_FAIL_LATE = 0.1;
export const VISIT_FAIL_STALLED = 0.5;

export function visitState(v: VisitReads | null | undefined): Heartbeat {
  if (!v || !v.lastHourVisits || v.failedShare == null) return "none";
  return v.failedShare >= VISIT_FAIL_STALLED ? "stalled" : v.failedShare >= VISIT_FAIL_LATE ? "late" : "fresh";
}

/** A writer's state against its schedule: late past 1.5 times its cadence,
 *  stalled past 3 times. */
export function writerState(w: StatusWriter, now: Secs): Heartbeat {
  const t = isoSecs(w.lastWriteAt);
  const every = w.expectEverySec;
  // An event-driven writer has no schedule to be late against.
  if (t == null || !every) return "none";
  const age = now - t;
  return age > 3 * every ? "stalled" : age > 1.5 * every ? "late" : "fresh";
}

const RANK: Record<Heartbeat, number> = { none: 0, fresh: 1, paused: 2, late: 3, stalled: 4 };

/** A pipeline's state: the worst of its scheduled writers. A writer that
 *  runs on events (no `expectEverySec`) only shows how long the protocol has
 *  been quiet, so with none scheduled the lane's checkpoint decides (Sieve
 *  moving means data is arriving), else the backfill's heartbeat. */
export function pipelineState(e: StatusEntry, now: Secs): Heartbeat {
  const states = (e.live?.writers ?? [])
    .filter((w) => w.expectEverySec)
    .map((w) => writerState(w, now))
    .filter((h) => h !== "none");
  if (states.length) return states.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  const moved = isoSecs(e.live?.checkpoint?.updatedAt);
  if (moved != null) return heartbeatAge(moved, now);
  return heartbeatAge(isoSecs(e.backfill?.heartbeatAt), now);
}

/** A pipeline's heartbeat: the backfill's wall time, else the newest write any
 *  writer stamped. Null when none stamps a wall time. */
export function pipelineHeartbeat(e: StatusEntry): Secs | null {
  const times = [e.backfill?.heartbeatAt, ...(e.live?.writers ?? []).map((w) => w.lastWriteAt)]
    .map(isoSecs)
    .filter((t): t is Secs => t != null);
  return times.length ? Math.max(...times) : null;
}

/** The time of a pipeline's newest stored row, for one that stamps no write time. */
export function pipelineNewestBlockTime(e: StatusEntry): Secs | null {
  const times = [e.backfill?.through?.time, ...(e.live?.writers ?? []).map((w) => w.newest?.time)].filter(
    (t): t is Secs => t != null,
  );
  return times.length ? Math.max(...times) : null;
}
