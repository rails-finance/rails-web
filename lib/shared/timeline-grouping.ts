// Grouping a history into folder ROWS on the web's own server half.
// ----------------------------------------------------------------------------
// Decision 0019's evening amendment moves the timeline's cut from events to
// ROWS, where a folder is one row carrying its members' aggregate. On SparkLend
// and Aave V3 the index groups (rails-server `api/src/services/
// timeline-folders.ts`) because the index already carries each event's running
// state. A family whose events only EXIST after the web's replay — Moonwell
// Base, whose `/api/chain/moonwell-base/timeline` route turns raw Sieve rows
// into events with `replayMoonwellRows` — cannot be grouped upstream without a
// second implementation of that replay. It can be grouped HERE, in the route,
// after the replay has walked every row: the balances on every event are then
// already right, and grouping is the pure transform the index arms describe.
//
//   rails-ops/decisions/0019-timeline-boundary-card.md
//     — "Implementation note 2026-09-13 — leg C: Moonwell Base groups in the
//        web's route, after its replay".
//
// A PORT, NOT A NEW RULE. The pass, the chunker, rule 6, the row-cap trim and
// the members resolution below are the server module's, line for line where
// the two can be, because a folder must mean the same thing whichever side of
// the wire cut it. `chunkByTransaction` is already shared with the fifteen
// client-grouped families (`lib/shared/timeline-chunks.ts`). Three differences,
// each forced by where this runs:
//
//   • LEGS ARRIVE RESOLVED. The route that groups also holds the market roster,
//     so a leg names its symbol and decimals itself rather than leaving them to
//     a proxy. Amounts stay base units and are scaled once, on the page.
//   • `legsFor` MAY REPLACE THE PER-ROW SUM. Moonwell's "Repaid" is the larger of
//     two sums, never their total (a liquidation's debt leg is also a
//     RepayBorrow), which no per-row Σ can express.
//   • NO FLOWS. A family grouped here reduces its lifetime flows in the replay,
//     over every row, before this pass runs; the page reads those sums and not
//     a merge of folders. So a folder serves `flows: null`: the family declares
//     no flow reduction ON THE FOLDER.
//
// PURE: no I/O, no React. Imported by route handlers only.

import type {
  FolderAssetKeyKind,
  FolderResponseId,
  ServedFolder,
  ServedFolderCell,
  ServedFolderCount,
  ServedFolderLeg,
  ServedFolderOutlier,
  ServedTimelineRow,
} from "@/lib/shared/timeline-folder";
import { CHUNK_TARGET, chunkByTransaction } from "@/lib/shared/timeline-chunks";
import type { OpeningBucket } from "@/lib/shared/timeline-opening-balance";

/** The four coordinates the pass needs from a family's own row shape. */
export interface GroupingAccess<R> {
  /** A durable chain coordinate — what a permalink carries and what the
   *  members route answers by. */
  eventKey: (row: R) => string;
  txHash: (row: R) => string;
  blockNumber: (row: R) => number;
  timestamp: (row: R) => number;
}

/** One member's contribution to a leg, already resolved to a symbol. An entry
 *  with no asset, or an amount the row did not record, is SKIPPED — an unknown
 *  denomination cannot join a sum, and an omission is not a zero. */
export interface GroupingLegEntry {
  verb: string;
  asset: string | null;
  assetKeyKind: FolderAssetKeyKind;
  /** Base units as a decimal string; the magnitude is what is summed. */
  amount: string | null;
  provWhat: string;
  symbol: string | null;
  decimals: number | null;
  displaySymbol?: string | null;
}

/** One family's grouping rule — the server's `TimelineFolderSpec`, minus the
 *  flow reduction (see the header). */
export interface GroupingSpec<R> {
  kind: string;
  match: (row: R) => boolean;
  min: number;
  sameRun?: (prev: R, next: R) => boolean;
  kindOf: (row: R) => string;
  countKinds?: readonly string[];
  /** Per-member leg entries, summed per (verb, asset). */
  legsOf?: (row: R) => GroupingLegEntry[];
  /** The whole folder's legs at once, where a family's header is not a plain
   *  Σ. Wins over `legsOf` when both are given. */
  legsFor?: (members: R[]) => ServedFolderLeg[];
  actorOf?: (row: R) => string | null;
  stateOf?: (members: R[]) => { before: Record<string, string> | null; after: Record<string, string> | null };
  magnitudeOf?: (row: R) => { key: string; amount: bigint } | null;
  nounOf?: (kind: string) => string;
  mixedKind?: string;
  /** One member's place in the folder's cross-tab (`ServedFolder.cells`), in
   *  the page filters' own keys — on a family grouped here the members ARE
   *  the page's events, so this is `getEventActionKey` / `getEventAssetKeys` /
   *  `getEventCounterpartyKeys` over each one. ABSENT serves `cells: null`. */
  cellOf?: (row: R) => { kind: string; assets: string[]; counterparties: string[] };
}

export interface GroupedRows<R> {
  rows: ServedTimelineRow<R>[];
  folders: Map<string, ServedFolder>;
  members: Map<string, R[]>;
  folderByEvent: Map<string, string>;
  /** Every event key the pass covered, folder member or not. */
  served: Set<string>;
}

// ──────────────────────────── the legs ──────────────────────────────────────

/** A base-unit integer's magnitude, or null for a figure that cannot be added
 *  up. A trailing `.0` is tolerated; a real fraction is not. */
export function baseUnitMagnitude(raw: string | null | undefined): bigint | null {
  if (raw == null) return null;
  const m = /^-?(\d+)(?:\.0+)?$/.exec(String(raw).trim());
  return m ? BigInt(m[1]) : null;
}

/** One leg per (verb, asset), first-seen order, Σ of magnitudes. */
export function sumLegEntries(entries: GroupingLegEntry[]): ServedFolderLeg[] {
  const out: ServedFolderLeg[] = [];
  const at = new Map<string, ServedFolderLeg>();
  const total = new Map<string, bigint>();
  for (const e of entries) {
    if (!e.asset) continue;
    const magnitude = baseUnitMagnitude(e.amount);
    if (magnitude == null) continue;
    const id = `${e.verb} ${e.assetKeyKind} ${e.asset}`;
    let leg = at.get(id);
    if (!leg) {
      leg = {
        verb: e.verb,
        asset: e.asset,
        assetKeyKind: e.assetKeyKind,
        amount: "0",
        count: 0,
        provWhat: e.provWhat,
        symbol: e.symbol,
        decimals: e.decimals,
        ...(e.displaySymbol ? { displaySymbol: e.displaySymbol } : {}),
      };
      at.set(id, leg);
      total.set(id, BigInt(0));
      out.push(leg);
    }
    total.set(id, (total.get(id) as bigint) + magnitude);
    leg.count += 1;
  }
  for (const [id, leg] of at) leg.amount = (total.get(id) as bigint).toString();
  return out;
}

/** Who executed the members — the summary's shape minus its `total`. */
function countActors<R>(members: R[], actorOf: (row: R) => string | null): ServedFolder["actors"] {
  const counts = new Map<string, number>();
  let external = 0;
  for (const row of members) {
    const actor = actorOf(row);
    if (!actor) continue;
    external += 1;
    counts.set(actor, (counts.get(actor) ?? 0) + 1);
  }
  return {
    external,
    actors: [...counts]
      .map(([address, count]) => ({ address, count }))
      .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
  };
}

/** The folder's cross-tab: one cell per distinct (kind, day, assets,
 *  counterparties), oldest day first — the server's `countCells`. */
function countCells<R>(
  members: R[],
  cellOf: NonNullable<GroupingSpec<R>["cellOf"]>,
  timestampOf: (row: R) => number,
): ServedFolderCell[] {
  const cells = new Map<string, ServedFolderCell>();
  for (const row of members) {
    const c = cellOf(row);
    const day = String(Math.floor(timestampOf(row) / 86400) * 86400);
    const assets = [...new Set(c.assets)].sort();
    const counterparties = [...new Set(c.counterparties)].sort();
    const key = `${c.kind} ${day} ${assets.join(",")} ${counterparties.join(",")}`;
    const cell = cells.get(key);
    if (cell) cell.count += 1;
    else cells.set(key, { kind: c.kind, day, assets, counterparties, count: 1 });
  }
  return [...cells.values()].sort((a, b) => Number(a.day) - Number(b.day));
}

/** Members per UTC day, oldest first — the heatmap's own day key. */
function countByDay<R>(members: R[], timestampOf: (row: R) => number): OpeningBucket[] {
  const counts = new Map<string, number>();
  for (const row of members) {
    const key = String(Math.floor(timestampOf(row) / 86400) * 86400);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => Number(a.key) - Number(b.key));
}

// ──────────────────────────── rule 6 ────────────────────────────────────────
// "A folder header must be complete about its members." The constants are the
// server's; the argument for each is at its twin in timeline-folders.ts.

const OUTLIER_KIND_SHARE = 0.05;
const OUTLIER_KIND_TIMES = 3;
const OUTLIER_MAGNITUDE_RATIO = BigInt(10);
const OUTLIER_MEDIAN_FLOOR = 5;

function medianOf(sorted: bigint[]): bigint {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / BigInt(2);
}

function outlierOf<R>(
  members: R[],
  spec: GroupingSpec<R>,
  access: GroupingAccess<R>,
): { outlier: ServedFolderOutlier | null; mixed: boolean } {
  const n = members.length;
  const qualified = new Map<string, { row: R; reason: "kind" | "magnitude" }>();

  const kindCount = new Map<string, number>();
  for (const row of members) {
    const k = spec.kindOf(row);
    kindCount.set(k, (kindCount.get(k) ?? 0) + 1);
  }
  for (const row of members) {
    const c = kindCount.get(spec.kindOf(row)) as number;
    if (c < OUTLIER_KIND_TIMES && c / n < OUTLIER_KIND_SHARE) {
      qualified.set(access.eventKey(row), { row, reason: "kind" });
    }
  }

  if (spec.magnitudeOf) {
    const byPartition = new Map<string, bigint[]>();
    for (const row of members) {
      const m = spec.magnitudeOf(row);
      if (!m) continue;
      const list = byPartition.get(m.key) ?? [];
      list.push(m.amount);
      byPartition.set(m.key, list);
    }
    const medians = new Map<string, bigint>();
    for (const [key, list] of byPartition) {
      if (list.length < OUTLIER_MEDIAN_FLOOR) continue;
      const median = medianOf([...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      if (median > BigInt(0)) medians.set(key, median);
    }
    for (const row of members) {
      const key = access.eventKey(row);
      if (qualified.has(key)) continue;
      const m = spec.magnitudeOf(row);
      if (!m) continue;
      const median = medians.get(m.key);
      if (median === undefined) continue;
      if (m.amount >= OUTLIER_MAGNITUDE_RATIO * median || m.amount * OUTLIER_MAGNITUDE_RATIO <= median) {
        qualified.set(key, { row, reason: "magnitude" });
      }
    }
  }

  if (qualified.size === 0) return { outlier: null, mixed: false };
  if (qualified.size > 1) return { outlier: null, mixed: true };
  const [[eventKey, only]] = [...qualified];
  const kind = spec.kindOf(only.row);
  const noun = spec.nounOf ? spec.nounOf(kind) : kind.replace(/_/g, " ");
  return { outlier: { eventKey, reason: only.reason, label: `one ${noun}` }, mixed: false };
}

// ──────────────────────────── the pass ──────────────────────────────────────

function folderOf<R>(
  members: R[],
  firstIndex: number,
  spec: GroupingSpec<R>,
  access: GroupingAccess<R>,
  ordinalBase: number,
): ServedFolder {
  const txs = new Set<string>();
  const kindCount = new Map<string, number>();
  for (const row of members) {
    txs.add(access.txHash(row));
    const k = spec.kindOf(row);
    kindCount.set(k, (kindCount.get(k) ?? 0) + 1);
  }
  const named = spec.countKinds ?? [...kindCount.keys()];
  const counts: ServedFolderCount[] = [];
  let namedTotal = 0;
  for (const key of named) {
    const c = kindCount.get(key) ?? 0;
    if (c === 0) continue;
    counts.push({ key, count: c });
    namedTotal += c;
  }
  const legs = spec.legsFor
    ? spec.legsFor(members)
    : sumLegEntries(spec.legsOf ? members.flatMap((row) => spec.legsOf!(row)) : []);
  const { outlier, mixed } = outlierOf(members, spec, access);
  const state = spec.stateOf ? spec.stateOf(members) : { before: null, after: null };
  const first = members[0];
  const last = members[members.length - 1];
  return {
    responseId: `${spec.kind}:${access.eventKey(first)}` as FolderResponseId,
    kind: mixed ? (spec.mixedKind ?? spec.kind) : spec.kind,
    count: members.length,
    txCount: txs.size,
    ordinalFirst: ordinalBase + firstIndex,
    ordinalLast: ordinalBase + firstIndex + members.length - 1,
    firstAt: access.timestamp(first),
    lastAt: access.timestamp(last),
    firstBlock: access.blockNumber(first),
    lastBlock: access.blockNumber(last),
    legs,
    counts,
    other: members.length - namedTotal,
    stateBefore: state.before,
    stateAfter: state.after,
    outlier,
    flows: null,
    actors: spec.actorOf ? countActors(members, spec.actorOf) : null,
    byDay: countByDay(members, access.timestamp),
    cells: spec.cellOf ? countCells(members, spec.cellOf, access.timestamp) : null,
  };
}

/**
 * One forward pass over `rows` in ASCENDING chain order — the server's
 * `groupIntoRows`: a row joins the first spec that matches it, a matching row
 * opens or extends a stretch, a stretch shorter than the spec's `min` stays as
 * events, and a longer one is chunked by transaction into folders. Ordinals run
 * contiguously from `ordinalBase`, the first row's place in the WHOLE history.
 */
export function groupIntoRows<R>(
  rows: R[],
  specs: readonly GroupingSpec<R>[],
  access: GroupingAccess<R>,
  opts: { ordinalBase: number; chunkTarget?: number },
): GroupedRows<R> {
  const target = opts.chunkTarget ?? CHUNK_TARGET;
  const out: ServedTimelineRow<R>[] = [];
  const folders = new Map<string, ServedFolder>();
  const members = new Map<string, R[]>();
  const folderByEvent = new Map<string, string>();
  const served = new Set<string>();
  for (const row of rows) served.add(access.eventKey(row));

  const specOf = (row: R): number => specs.findIndex((s) => s.match(row));

  let i = 0;
  while (i < rows.length) {
    const si = specOf(rows[i]);
    if (si < 0) {
      out.push({ kind: "event", event: rows[i] });
      i += 1;
      continue;
    }
    const spec = specs[si];
    let j = i + 1;
    while (j < rows.length && specOf(rows[j]) === si && (!spec.sameRun || spec.sameRun(rows[j - 1], rows[j]))) j++;
    const stretch = rows.slice(i, j);
    if (stretch.length < spec.min) {
      for (const row of stretch) out.push({ kind: "event", event: row });
    } else {
      let offset = 0;
      for (const chunk of chunkByTransaction(stretch, access.txHash, target, spec.min)) {
        const folder = folderOf(chunk, i + offset, spec, access, opts.ordinalBase);
        out.push({ kind: "folder", folder });
        folders.set(folder.responseId, folder);
        members.set(folder.responseId, chunk);
        for (const row of chunk) folderByEvent.set(access.eventKey(row), folder.responseId);
        offset += chunk.length;
      }
    }
    i = j;
  }
  return { rows: out, folders, members, folderByEvent, served };
}

// ──────────────────────── the cut, in the new unit ──────────────────────────

export interface TrimmedRows<R> {
  rows: ServedTimelineRow<R>[];
  /** The block the kept rows open at, or null when nothing was cut. */
  cutoffBlock: number | null;
  /** Events the kept rows cover, folder members included. */
  eventsKept: number;
  boundBy: "rows" | "scan" | null;
}

/**
 * Trim a grouped answer to at most `cap` ROWS from the oldest end — the
 * server's `trimToRowCap`. A folder is kept or dropped whole, and the cut is
 * walked back to a BLOCK boundary (testing each dropped row's HIGHEST block), so
 * no event is in neither half of the partition.
 */
export function trimToRowCap<R>(grouped: GroupedRows<R>, access: GroupingAccess<R>, cap: number): TrimmedRows<R> {
  const all = grouped.rows;
  const blockOf = (row: ServedTimelineRow<R>): number =>
    row.kind === "folder" ? row.folder.firstBlock : access.blockNumber(row.event);
  const lastBlockOf = (row: ServedTimelineRow<R>): number =>
    row.kind === "folder" ? row.folder.lastBlock : access.blockNumber(row.event);
  const eventsIn = (row: ServedTimelineRow<R>): number => (row.kind === "folder" ? row.folder.count : 1);

  let start = Math.max(0, all.length - cap);
  if (start > 0) {
    for (;;) {
      const cutoff = blockOf(all[start]);
      let moved = false;
      while (start > 0 && lastBlockOf(all[start - 1]) >= cutoff) {
        start -= 1;
        moved = true;
      }
      if (!moved) break;
    }
  }
  const rows = all.slice(start);
  const trimmed = start > 0;
  return {
    rows,
    cutoffBlock: trimmed ? blockOf(rows[0]) : null,
    eventsKept: rows.reduce((n, row) => n + eventsIn(row), 0),
    boundBy: trimmed ? "rows" : null,
  };
}

// ──────────────────── opening a folder (the members route) ─────────────────

export type FolderResolution<R> =
  | { ok: true; folder: ServedFolder; members: R[] }
  | { ok: false; code: "UNKNOWN_FOLDER" | "NOT_IN_A_FOLDER" | "BELOW_THE_WINDOW"; message: string };

/** The server's `resolveFolder`, with its three refusals and their sentences —
 *  `kept` is the set of event keys the trimmed answer actually serves, so an
 *  event below the row cap is refused as BELOW_THE_WINDOW rather than opened
 *  into a folder the page never drew. */
export function resolveFolder<R>(
  grouped: GroupedRows<R>,
  kept: ReadonlySet<string>,
  ask: { event?: string | null; folder?: string | null },
): FolderResolution<R> {
  let id = ask.folder ?? null;
  if (!id && ask.event) {
    if (!grouped.served.has(ask.event) || !kept.has(ask.event)) {
      return {
        ok: false,
        code: "BELOW_THE_WINDOW",
        message:
          "That event sits below this position's served window, so no folder on this answer holds it. What is below the cut is stated by the timeline's boundary card.",
      };
    }
    id = grouped.folderByEvent.get(ask.event) ?? null;
    if (!id) {
      return {
        ok: false,
        code: "NOT_IN_A_FOLDER",
        message: "That event is served as its own row on this position's timeline, so there is no folder to open.",
      };
    }
  }
  const folder = id ? grouped.folders.get(id) : undefined;
  const members = id ? grouped.members.get(id) : undefined;
  if (!folder || !members) {
    return {
      ok: false,
      code: "UNKNOWN_FOLDER",
      message:
        "No folder with that id in this position's current answer. A folder id is scoped to the response it came in — an event arriving at the head, or a backfill below it, retires it — so re-read the timeline and use an id from that answer, or ask by event key.",
    };
  }
  return { ok: true, folder, members: members.slice(0, folder.count) };
}
