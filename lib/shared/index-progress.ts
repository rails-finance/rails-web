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
  /** Web-side: why the fill's last heartbeat wrote no sample on this chain
   *  (the answer's `headMisses`, set by `withHeadMisses`). */
  headMiss?: HeadMiss | null;
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

/** One gateway's counter as the server last saw it. */
export interface GatewayCounter extends Allowance {
  chain: number;
}

/** Which chains share the allowance's counter and which count on their own.
 *  Each counter runs a 24 h window, so chains with the same reset time
 *  (within a minute) draw on one counter. */
export function counterChains(
  allowance: Allowance,
  gateways: readonly GatewayCounter[],
): { shared: number[]; own: number[] } {
  const at = isoSecs(allowance.resetsAt);
  const shared: number[] = [];
  const own: number[] = [];
  for (const g of gateways) {
    // A gateway with no reading yet says nothing about its counter.
    const t = isoSecs(g.resetsAt);
    if (t == null) continue;
    (at != null && Math.abs(t - at) < 60 ? shared : own).push(g.chain);
  }
  return { shared, own };
}

/** A chain the fill's last heartbeat could not sample: the gateway refused
 *  its finalized-block read (`until` the host's reset), or the read failed.
 *  Held in the api's memory and replaced at each heartbeat. */
export interface HeadMiss {
  chain: number;
  reason: "gateway-refused" | "read-failed";
  until: string | null;
  at: string;
  error?: string;
}

export interface IndexProgress {
  asOf: string;
  indexes: IndexProgressEntry[];
  /** Absent from an api that predates it. */
  headMisses?: HeadMiss[];
}

const missOn = (misses: HeadMiss[] | undefined, chain: number) => misses?.find((m) => m.chain === chain) ?? null;

/** Each fill index with its chain's head miss, where the answer has one. */
export function withHeadMisses<T extends IndexProgress | IndexStatus>(s: T): T {
  const misses = s.headMisses;
  if (!misses?.length) return s;
  if ("indexes" in s) return { ...s, indexes: s.indexes.map((e) => ({ ...e, headMiss: missOn(misses, e.chain) })) };
  return {
    ...s,
    entries: s.entries.map((e) =>
      e.backfill?.pipeline === "fill" ? { ...e, backfill: { ...e.backfill, headMiss: missOn(misses, e.chain) } } : e,
    ),
  };
}

/** The fill plans each index every 10 min and writes its sample
 *  (pidx_progress.sampled_at) at each plan, but none while the gateways refuse
 *  its finalized-block reads. Past 90 min the heartbeat is late, which leaves
 *  room for a plan slowed by retries; past three hours it has stalled. */
export const HEARTBEAT_LATE = 90 * 60;
export const HEARTBEAT_STALLED = 3 * 60 * 60;

export type Heartbeat = "fresh" | "late" | "stalled" | "paused" | "none";

const isoSecs = (iso: string | null | undefined): Secs | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t / 1000 : null;
};

/** The fields a fill's state reads: a progress entry, or a status entry's backfill. */
export type FillReading = Pick<
  IndexProgressEntry,
  "heartbeatAt" | "head" | "percent" | "pace" | "held" | "headMiss"
> & {
  atHead: boolean | null;
};

/** The time of the index's last heartbeat: the wall time of the fill's last
 *  sample where the server sends it, else the finalized head the fill last
 *  planned against. Null when the fill has not planned it yet. */

export const heartbeatTime = (e: FillReading): Secs | null => isoSecs(e.heartbeatAt) ?? e.head?.time ?? null;

/** Whether `heartbeatTime` is a wall time (true) or a block's time. */
export const heartbeatIsWallTime = (e: IndexProgressEntry): boolean => isoSecs(e.heartbeatAt) != null;

export function heartbeatAge(t: Secs | null, now: Secs): Heartbeat {
  if (t == null) return "none";
  const age = now - t;
  return age > HEARTBEAT_STALLED ? "stalled" : age > HEARTBEAT_LATE ? "late" : "fresh";
}

export const heartbeatState = (e: FillReading, now: Secs): Heartbeat => heartbeatAge(heartbeatTime(e), now);

/** Whether a fill is moving. The fill writes its sample even while it
 *  holds an index, so a fresh heartbeat alone does not mean blocks
 *  are being read. "not-gaining": no blocks read over the pace window (an
 *  hour or more of samples); "behind": read to within rounding of the head,
 *  then fell more than 30 min of blocks behind it. Null when neither holds. */
export function fillStall(e: FillReading): "not-gaining" | "behind" | null {
  if (e.atHead) return null;
  if (e.percent != null && e.percent >= 99.95) return "behind";
  if (e.pace && e.pace.blocksPerHour === 0) return "not-gaining";
  return null;
}

/** The fill's head miss on this chain while it is current: recorded within
 *  HEARTBEAT_LATE, so a miss an api stopped replacing does not stand. */
export function liveMiss(e: FillReading, now: Secs): HeadMiss | null {
  const at = isoSecs(e.headMiss?.at);
  return e.headMiss && at != null && now - at <= HEARTBEAT_LATE ? e.headMiss : null;
}

/** A fill's state: its heartbeat's age, and never better than late while it
 *  is not moving. A hold shows only while the heartbeat is fresh: the server
 *  restores holds from storage, so a hold alone does not show the loop is
 *  running, and a late or stalled heartbeat wins over it. */
export function fillState(e: FillReading, now: Secs): Heartbeat {
  const hb = heartbeatState(e, now);
  // A miss the last heartbeat recorded shows the loop ran and why it wrote no
  // sample: a gateway's refusal is a pause until its reset; a failed read is
  // late, or stalled once the samples are three hours old.
  const miss = liveMiss(e, now);
  if (miss) return miss.reason === "gateway-refused" ? "paused" : hb === "stalled" ? "stalled" : "late";
  if (hb === "late" || hb === "stalled") return hb;
  // Held on purpose: the allowance, or the fill's switch. A check runs in
  // seconds and reads as the heartbeat; an error or a failed job is late.
  const r = e.held?.reason;
  if (r === "egress-floor" || r === "paused") return "paused";
  if (r === "fill-error" || r === "job-failed") return "late";
  return fillStall(e) ? "late" : hb;
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
  /** The writer's last poll, whether it wrote rows or not, and its outcome. */
  lastRunAt?: string | null;
  lastRunOk?: boolean | null;
  lastRunError?: string | null;
  /** Web-side: the census writer's latest run (the answer's `censusRuns`,
   *  set by `withCensusRuns`). */
  censusRun?: CensusRunStatus | null;
}

/** A vault census's latest run, per chain and family. A run stops by design
 *  at its keyless gateway share or its deadline, writing no rows. */
export interface CensusRunStatus {
  chain: number;
  family: string;
  families: string[];
  outcome: "completed" | "stopped-share" | "stopped-deadline" | "failed";
  startedAt: string;
  endedAt: string;
  vaultsWritten: number | null;
  chunksSaved: number | null;
  stoppedAtVault: string | null;
  gateway: string | null;
  remainingMb: number | null;
  floorMb: number | null;
  resetsAt: string | null;
  error: string | null;
  shareStopsInARow: number;
  stuckStopsInARow: number;
  /** The census's next scheduled run, from its crontab; absent from an api
   *  that predates it. */
  nextRunAt?: string | null;
}

/** rails-server explorer-pipelines' name for the vault census writer. */
export const CENSUS_WRITER = "vault-census";
/** A census family by the status entry it writes for. */
const CENSUS_FAMILY: Record<string, string> = { "aave-vaults": "aave", yearn: "yearn-v3" };
/** Stops in the same vault with nothing written that read as an alarm (the
 *  census wrapper's exit 3). */
export const CENSUS_STUCK_STOPS = 3;

/** How long past its due time a census may take to record its next run
 *  before it reads late: the slots fall up to about 70 min after a gateway
 *  reset, and a run takes up to about 40 min. */
export const CENSUS_DUE_GRACE = 2 * 60 * 60;

/** When a stopped census's next run is due: the first slot after the stop,
 *  from the api's `nextRunAt` (which moves to tomorrow once today's slot has
 *  started, so it is stepped back a schedule at a time to the stop); else
 *  after the gateway's reset for a share stop; else a schedule's length after
 *  the run. `after` marks a time the run follows rather than one it is set
 *  for. Null for a run that did not stop, or with nothing to go on. */
export function censusDue(w: StatusWriter): { at: Secs; after: boolean } | null {
  const r = w.censusRun;
  if (!r || !r.outcome.startsWith("stopped-")) return null;
  let next = isoSecs(r.nextRunAt);
  const ended = isoSecs(r.endedAt);
  const every = w.expectEverySec;
  if (next != null) {
    if (ended != null && every) while (next - every > ended) next -= every;
    return { at: next, after: false };
  }
  const reset = isoSecs(r.resetsAt);
  if (r.outcome === "stopped-share" && reset != null) return { at: reset, after: true };
  const ran = isoSecs(w.lastRunAt) ?? isoSecs(r.startedAt);
  return ran != null && w.expectEverySec ? { at: ran + w.expectEverySec, after: false } : null;
}

/** Each census writer with its latest run, where the answer has one. */
export function withCensusRuns(s: IndexStatus): IndexStatus {
  const runs = s.censusRuns;
  if (!runs?.length) return s;
  return {
    ...s,
    entries: s.entries.map((e) => {
      const family = CENSUS_FAMILY[e.protocol];
      if (!family || !e.live?.writers.some((w) => w.name === CENSUS_WRITER)) return e;
      const run = runs.find((r) => r.chain === e.chain && r.family === family) ?? null;
      return {
        ...e,
        live: {
          ...e.live,
          writers: e.live.writers.map((w) => (w.name === CENSUS_WRITER ? { ...w, censusRun: run } : w)),
        },
      };
    }),
  };
}

/** The last hour of reads made when a page opens (the tier-request tally). */
export interface VisitReads {
  gateway: string;
  lastHourVisits?: number;
  answered?: number;
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
  gateways?: GatewayCounter[];
  allowance?: Allowance | null;
  prices?: PricesSection;
  /** Absent from an api that predates it. */
  headMisses?: HeadMiss[];
  /** Absent from an api that predates it. */
  censusRuns?: CensusRunStatus[];
}

// ── Prices: the oracle lane's feeds and rates, and the price fillers ───────

export interface PriceFeed {
  feed: string;
  pair: string;
  proxy: string;
  decimals: number;
  /** Chainlink's heartbeat: the longest the feed goes without a round. */
  heartbeatSec: number | null;
  deviationPct: number | null;
  source: string | null;
  lastRound: { block: number; time: Secs | null; answer: string } | null;
}

export interface RateUpdate {
  name: string;
  label: string;
  contract: string;
  expectEverySec: number | null;
  source: string | null;
  lastEvent: { block: number; time: Secs | null } | null;
}

export interface PriceFiller {
  lane: string;
  mode: string | null;
  lastOkAt: string | null;
  staleAfterMinutes: number | null;
  watermarkLagBlocks: number | null;
  unpricedLiq: number | null;
  retryDepth: number | null;
  lastError: string | null;
}

export interface PricesSection {
  lane: {
    checkpoint: { block: number; time: Secs | null; updatedAt?: string | null } | null;
    unreachable?: { error: string };
  };
  feeds: PriceFeed[];
  rates: RateUpdate[];
  fillers: PriceFiller[];
  alarms: string[];
}

/** A feed or rate against its interval: late past 1.5 times, stalled past 3
 *  times (the rule the stored Liquity V2 oracle uses to refuse a round). */
export function intervalState(t: Secs | null | undefined, every: number | null, now: Secs): Heartbeat {
  if (t == null || !every) return "none";
  const age = now - t;
  return age > 3 * every ? "stalled" : age > 1.5 * every ? "late" : "fresh";
}

/** A filler against its stale mark: late past it, stalled past twice it. */
export function fillerState(f: PriceFiller, now: Secs): Heartbeat {
  const t = isoSecs(f.lastOkAt);
  if (t == null || !f.staleAfterMinutes) return "none";
  const mins = (now - t) / 60;
  return mins > 2 * f.staleAfterMinutes ? "stalled" : mins > f.staleAfterMinutes ? "late" : "fresh";
}

/** A filler's error as a kind of failure. The raw text can carry hosts and
 *  addresses, so a public page shows the kind only. */
export function errorKind(e: string | null): string | null {
  if (!e) return null;
  if (/whitelist|allowlist|forbidden|unauthori[sz]ed|\b40[13]\b|refus/i.test(e)) return "Upstream refused";
  if (/time(d)? ?out/i.test(e)) return "Timeout";
  return "Error";
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

/** Visit reads: amber from a 10% failure share in the last hour, red from
 *  50%, each only from 2 failed reads; none with no visit in the hour. */
export const VISIT_FAIL_LATE = 0.1;
export const VISIT_FAIL_STALLED = 0.5;
/** Fewer failed reads than this in the hour are too few to judge: green when
 *  a read answered, not measured when none did. */
export const VISIT_FAIL_MIN = 2;

/** Visit reads too few to judge: under VISIT_FAIL_MIN failures, none answered. */
export function visitTooFew(v: VisitReads | null | undefined): boolean {
  if (!v?.lastHourVisits || v.failedShare == null) return false;
  const failed = Math.round(v.failedShare * v.lastHourVisits);
  return failed < VISIT_FAIL_MIN && (v.answered ?? v.lastHourVisits - failed) === 0;
}

export function visitState(v: VisitReads | null | undefined): Heartbeat {
  if (!v || !v.lastHourVisits || v.failedShare == null || visitTooFew(v)) return "none";
  // One failure in a quiet hour is a blip, whatever share of the hour it is.
  if (Math.round(v.failedShare * v.lastHourVisits) < VISIT_FAIL_MIN) return "fresh";
  return v.failedShare >= VISIT_FAIL_STALLED ? "stalled" : v.failedShare >= VISIT_FAIL_LATE ? "late" : "fresh";
}

/** rails-server explorer-pipelines' name for the at-block fill's writer. */
export const AT_BLOCK_FILL_WRITER = "at-block-fill";

/** A writer's state against its schedule: late past 1.5 times its cadence,
 *  stalled past 3 times. */

export function writerState(w: StatusWriter, now: Secs, e?: StatusEntry): Heartbeat {
  // The at-block fill's writer stamps the fill's sample (lastWriteAt is the
  // backfill's heartbeatAt), so it reads as the fill does: paused while held,
  // late past the fill's limit rather than its plan interval.
  if (w.name === AT_BLOCK_FILL_WRITER && e?.backfill) return fillState(e.backfill, now);
  // Its last poll where the writer records one (a quiet protocol writes no
  // rows), else its newest write.
  const ran = isoSecs(w.lastRunAt);
  const t = ran ?? isoSecs(w.lastWriteAt);
  const every = w.expectEverySec;
  // An event-driven writer has no schedule to be late against.
  if (t == null || !every) return "none";
  // A census stops by design at its gateway share or its deadline: held
  // until its next run is due (with CENSUS_DUE_GRACE), late after, stalled
  // three schedules past it; an alarm
  // once it has stopped in the same vault with nothing written
  // CENSUS_STUCK_STOPS times.
  const run = w.censusRun;
  if (run) {
    if (run.stuckStopsInARow >= CENSUS_STUCK_STOPS) return "stalled";
    const due = censusDue(w);
    if (due) return now <= due.at + CENSUS_DUE_GRACE ? "paused" : now - due.at > 3 * every ? "stalled" : "late";
  }
  if (ran != null && w.lastRunOk === false) return "late";
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
    .map((w) => writerState(w, now, e))
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
