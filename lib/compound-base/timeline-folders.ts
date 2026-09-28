// SERVER-ONLY — Compound V3 on Base as ROWS: every Comet market the wallet
// touched, grouped after the replay, and a month of one market sliced from it.
// ----------------------------------------------------------------------------
// Batch 5 of the row cut (rails-ops TO-DO-infra-and-backend.md, "the row cut
// and served folders are built on three lanes"). The route
// (`app/api/chain/compound-base/timeline`, `?group=1`) reads the index,
// replays EVERY row of the tail, and groups the events the replay produced,
// as the Aave-family Base routes do (lib/aave-v3-base/timeline-folders.ts):
// Comet logs amounts and no balances, so the running figures exist only after
// the replay, and grouping after it is a pure transform (rails-ops decision
// 0019, "leg C").
//
// THE SPEC IS THE INDEX'S, TRANSCRIBED from rails-server
// `api/src/services/compound-timeline-folders.ts` (COMPOUND_V3_FOLDER_SPECS),
// which Compound V3 mainnet is served under: a liquidation run of four or more
// absorption rows (`absorb_debt` and its `absorb_collateral` legs), and an
// owner run of five or more of the owner's own supplies or withdrawals of one
// asset back to back (decision 0021, 2026-09-24), the owner judged as the
// summary's `actorsSql` judges it. The page draws both with the family's
// register (`COMPOUND_FOLDER_REGISTER`). Two things are not carried over: the
// state faces (no page reads a folder's `stateBefore`/`stateAfter`) and the
// flows (the replay reduces the lifetime flows over every row before this pass
// runs, lib/shared/timeline-grouping.ts).
//
// ONE PAGE, SEVERAL TIMELINES. The page draws one timeline per Comet market,
// so the events are grouped per market (a run never crosses markets) and the
// markets' rows are merged in chain order before the trim. The preload's row
// cap is the page's, as the replay's render budget always was: the merged
// rows are trimmed from the oldest end to the cap at one block, so every
// market's rows open at or after the same block and the replay's own cut at
// that block states what sits below. A month is read one market at a time
// (`&market=`), trimmed to the same cap.

import type { BaseActivityEvent, CompoundContext } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { ServedTimelineRow, TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import type { OpeningBucket } from "@/lib/shared/timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import {
  groupIntoRows,
  type GroupedRows,
  type GroupingAccess,
  type GroupingLegEntry,
  type GroupingSpec,
  type TrimmedRows,
} from "@/lib/shared/timeline-grouping";
import { externalActor } from "@/lib/shared/external-actor";
import { getEventActionKey, getEventAssetKeys, getEventCounterpartyKeys } from "@/lib/shared/event-filter-helpers";
import {
  answerStore,
  eventsByDay,
  groupReplaySpan,
  type ReplayGroupedAnswer,
} from "@/lib/shared/replay-grouped-answer";
import {
  replayCometRows,
  type CometChainTimelineResult,
  type CometDecodedRow,
} from "@/lib/sources/chain/compound-v3-events";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import {
  readCometIndex,
  type CometIndexPrepared,
  type LoadCometIndexParams,
} from "@/lib/sources/api/compound-base-timeline";

/** The web specs' liquidation floor (lib/compound/timeline-runs.tsx). */
const MIN_LIQUIDATION_RUN = 4;
/** Decision 0021, 2026-09-24: the owner's runs collapse at five. */
const MIN_OWNER_RUN = 5;
/** The wire kind of an owner-run folder (lib/shared/owner-run-folders.tsx,
 *  which is a client module and is not imported into a route). */
const OWNER_RUN_KIND = "owner_run";

const dataOf = (e: BaseActivityEvent): CompoundContext | null => (isCompoundEvent(e) ? e.context.data : null);

export const COMPOUND_BASE_ROW_ACCESS: GroupingAccess<BaseActivityEvent> = {
  // `${txHash}-${logIndex}-${kind}` — the replay's id: a self-transfer's two
  // legs share a log, so the kind is part of the key, as it is of every card,
  // permalink and `?at=` landing on this page.
  eventKey: (e) => e.id,
  txHash: (e) => e.txHash,
  blockNumber: (e) => e.blockNumber,
  timestamp: (e) => e.timestamp,
};

const OWNER_VERB: Record<string, string> = {
  supply: "Supplied",
  withdraw: "Withdrawn",
  supply_collateral: "Supplied",
  withdraw_collateral: "Withdrawn",
};
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The two specs, in the order the index declares them. `rowOf` finds the
 *  decoded row behind an event (its raw delta and asset); `metaOf` names a
 *  collateral token. */
export function compoundBaseFolderSpecs(
  rowOf: (e: BaseActivityEvent) => CometDecodedRow | undefined,
  metaOf: (address: string) => { symbol: string; decimals: number; unresolved?: true } | undefined,
): GroupingSpec<BaseActivityEvent>[] {
  /** A base leg is keyed by the Comet slug (the base asset IS the market) and
   *  a collateral leg by its token, as the index keys them. A token whose
   *  decimals did not load has no figure to state; its pair is dropped. */
  const leg = (verb: string, e: BaseActivityEvent, provWhat: string): GroupingLegEntry[] => {
    const d = dataOf(e);
    const r = rowOf(e);
    if (!d || !r) return [];
    const amount = (r.delta < BigInt(0) ? -r.delta : r.delta).toString();
    if (d.isBase) {
      const m: CometMarket = r.market;
      return [
        {
          verb,
          asset: m.key,
          assetKeyKind: "marketKey",
          amount,
          provWhat,
          symbol: m.baseSymbol,
          decimals: m.baseDecimals,
        },
      ];
    }
    const meta = metaOf(r.asset);
    return [
      {
        verb,
        asset: r.asset,
        assetKeyKind: "tokenAddress",
        amount,
        provWhat,
        symbol: meta && !meta.unresolved ? meta.symbol : null,
        decimals: meta && !meta.unresolved ? meta.decimals : null,
      },
    ];
  };
  // The summary's `actorsSql`: only a supply carries a party param (the
  // funder); a row is third-party-acted when neither the signer nor the
  // funder is the account. The event carries both facts exactly there.
  const actorOf = (e: BaseActivityEvent) => {
    const d = dataOf(e);
    if (!d || (d.eventType !== "supply" && d.eventType !== "supply_collateral")) return null;
    return externalActor({ txFrom: d.txFrom, poolCaller: d.funder }, e.wallet);
  };
  const cellOf = (e: BaseActivityEvent) => ({
    kind: getEventActionKey(e),
    assets: getEventAssetKeys(e),
    counterparties: getEventCounterpartyKeys(e),
  });

  return [
    {
      kind: "liquidation",
      match: (e) => {
        const t = dataOf(e)?.eventType;
        return t === "absorb_debt" || t === "absorb_collateral";
      },
      min: MIN_LIQUIDATION_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      countKinds: ["absorb_debt", "absorb_collateral"],
      legsOf: (e) =>
        dataOf(e)?.eventType === "absorb_debt"
          ? leg("Absorbed", e, "Debt absorbed")
          : leg("Seized", e, "Collateral seized"),
      actorOf,
      cellOf,
    },
    {
      kind: OWNER_RUN_KIND,
      match: (e) => {
        const d = dataOf(e);
        return d != null && has(OWNER_VERB, d.eventType) && actorOf(e) === null;
      },
      // One action on one asset: the base (the market) or one collateral token.
      sameRun: (prev, next) => {
        const a = rowOf(prev);
        const b = rowOf(next);
        return a != null && b != null && a.kind === b.kind && a.market.key === b.market.key && a.asset === b.asset;
      },
      min: MIN_OWNER_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      legsOf: (e) => {
        const t = dataOf(e)?.eventType ?? "";
        return has(OWNER_VERB, t) ? leg(OWNER_VERB[t], e, OWNER_VERB[t]) : [];
      },
      actorOf,
      cellOf,
    },
  ];
}

// ── The replay the answers slice ────────────────────────────────────────────

interface Replayed {
  prepared: CometIndexPrepared;
  /** The replay with the render cut lifted: every event the tail holds. */
  full: CometChainTimelineResult;
  specs: GroupingSpec<BaseActivityEvent>[];
  /** Each market's events, chain order, and the seed's rows before them. */
  byMarket: Map<string, { events: BaseActivityEvent[]; eventsBefore: number }>;
}

function replayWhole(prepared: CometIndexPrepared): Replayed {
  const { input } = prepared;
  // Nothing is below a lifted cut, so the anchor has nothing to draw; off, it
  // states no `anchored` count on an answer the trim leaves whole.
  const full = replayCometRows({ ...input, maxRendered: Number.MAX_SAFE_INTEGER, anchorWalletRows: false });
  const byId = new Map<string, CometDecodedRow>();
  for (const r of input.rows) byId.set(`${r.txHash}-${r.logIndex}-${r.kind}`, r);
  const specs = compoundBaseFolderSpecs(
    (e) => byId.get(e.id),
    (address) => input.metas.get(address),
  );
  const byMarket = new Map<string, { events: BaseActivityEvent[]; eventsBefore: number }>();
  for (const s of input.seeds ?? []) byMarket.set(s.market.key, { events: [], eventsBefore: s.eventCount });
  for (const e of full.events) {
    const key = dataOf(e)?.market;
    if (!key) continue;
    let m = byMarket.get(key);
    if (!m) byMarket.set(key, (m = { events: [], eventsBefore: 0 }));
    m.events.push(e);
  }
  return { prepared, full, specs, byMarket };
}

/** One market's share of the preload: its rows, in the order the page draws
 *  them, and what the Date panel's grid needs for the months below them. */
export interface CompoundBaseMarketRows {
  rowPlan: TimelineRowPlanEntry[];
  /** Events the market's rows cover, folder members included. */
  eventsServed: number;
  /** The market's replayed events below the preload's cut, per UTC day; null
   *  where nothing of it was cut. */
  belowByDay: OpeningBucket[] | null;
}

export interface CompoundBaseGroupedAnswer {
  /** The replay the page states its figures from: at the cut for a preload
   *  longer than the cap, the whole replay otherwise and for a span. */
  result: CometChainTimelineResult;
  /** Every market's grouping, merged: what the members route resolves in. */
  grouped: GroupedRows<BaseActivityEvent>;
  trimmed: TrimmedRows<BaseActivityEvent>;
  kept: Set<string>;
  /** The preload's rows per market; null on a span. */
  markets: Record<string, CompoundBaseMarketRows> | null;
  /** The span a month read answered, and the market it read; null on the
   *  preload. */
  span: { from: number; to: number } | null;
  market: string | null;
}

/** Every market's rows merged in chain order: a row sits where its oldest
 *  event sits in the whole replay. */
function mergeMarkets(r: Replayed): {
  grouped: GroupedRows<BaseActivityEvent>;
  marketOf: Map<ServedTimelineRow<BaseActivityEvent>, string>;
} {
  const at = new Map<string, number>();
  r.full.events.forEach((e, i) => at.set(e.id, i));
  const merged: { row: ServedTimelineRow<BaseActivityEvent>; at: number; market: string }[] = [];
  const grouped: GroupedRows<BaseActivityEvent> = {
    rows: [],
    folders: new Map(),
    members: new Map(),
    folderByEvent: new Map(),
    served: new Set(),
  };
  for (const [market, m] of r.byMarket) {
    const g = groupIntoRows(m.events, r.specs, COMPOUND_BASE_ROW_ACCESS, { ordinalBase: m.eventsBefore + 1 });
    for (const row of g.rows) {
      const first = row.kind === "event" ? row.event.id : (g.members.get(row.folder.responseId)?.[0]?.id ?? "");
      merged.push({ row, at: at.get(first) ?? 0, market });
    }
    for (const [k, v] of g.folders) grouped.folders.set(k, v);
    for (const [k, v] of g.members) grouped.members.set(k, v);
    for (const [k, v] of g.folderByEvent) grouped.folderByEvent.set(k, v);
    for (const k of g.served) grouped.served.add(k);
  }
  merged.sort((a, b) => a.at - b.at);
  grouped.rows = merged.map((m) => m.row);
  return { grouped, marketOf: new Map(merged.map((m) => [m.row, m.market])) };
}

function keptOf(grouped: GroupedRows<BaseActivityEvent>, rows: ServedTimelineRow<BaseActivityEvent>[]) {
  const kept = new Set<string>();
  for (const row of rows) {
    const list = row.kind === "event" ? [row.event] : (grouped.members.get(row.folder.responseId) ?? []);
    for (const e of list) kept.add(e.id);
  }
  // The merge orders rows by their oldest member, so the first kept row's
  // first member is the oldest kept event.
  const head = rows[0];
  const first = !head
    ? null
    : head.kind === "event"
      ? head.event.id
      : (grouped.members.get(head.folder.responseId)?.[0]?.id ?? null);
  return { kept, first };
}

/**
 * `trimToRowCap` over merged markets. One market's rows never overlap in
 * blocks, but two markets' can: a folder of one may still be open when a
 * later row of the other starts. So the walk back to a block boundary tests
 * every dropped row's highest block (a running maximum), not only the row
 * before the cut.
 */
function trimMergedToRowCap(grouped: GroupedRows<BaseActivityEvent>, cap: number): TrimmedRows<BaseActivityEvent> {
  const all = grouped.rows;
  const firstBlock = (row: ServedTimelineRow<BaseActivityEvent>) =>
    row.kind === "folder" ? row.folder.firstBlock : row.event.blockNumber;
  const lastBlock = (row: ServedTimelineRow<BaseActivityEvent>) =>
    row.kind === "folder" ? row.folder.lastBlock : row.event.blockNumber;
  let start = Math.max(0, all.length - cap);
  if (start > 0) {
    const highest: number[] = [];
    all.forEach((row, i) => highest.push(Math.max(i > 0 ? highest[i - 1] : -Infinity, lastBlock(row))));
    while (start > 0 && highest[start - 1] >= firstBlock(all[start])) start -= 1;
  }
  const rows = all.slice(start);
  const trimmed = start > 0;
  return {
    rows,
    cutoffBlock: trimmed ? firstBlock(rows[0]) : null,
    eventsKept: rows.reduce((n, row) => n + (row.kind === "folder" ? row.folder.count : 1), 0),
    boundBy: trimmed ? "rows" : null,
  };
}

/** The preload: every market grouped, merged, trimmed to `cap` rows at one
 *  block, and the replay run again with its cut at that block. */
function groupCompoundBaseRest(r: Replayed, cap: number): CompoundBaseGroupedAnswer {
  const { grouped, marketOf } = mergeMarkets(r);
  const trimmed = trimMergedToRowCap(grouped, cap);
  const { kept, first } = keptOf(grouped, trimmed.rows);
  let result = r.full;
  const cutoff = trimmed.cutoffBlock;
  if (cutoff != null) {
    const { input } = r.prepared;
    // The replay cuts by ROW and the trim at a block; rows are in chain
    // order, so the rows at or after the block are the newest that many.
    const cut = replayCometRows({
      ...input,
      maxRendered: input.rows.filter((row) => row.blockNumber >= cutoff).length,
      anchorWalletRows: false,
    });
    if (cut.events.length !== trimmed.eventsKept || (cut.events[0]?.id ?? null) !== first) {
      throw new Error(
        `Compound V3 Base grouped cut disagrees with the replay's: ${cut.events.length} events from ${
          cut.events[0]?.id ?? "none"
        } against ${trimmed.eventsKept} from ${first}`,
      );
    }
    result = cut;
  }
  const markets: Record<string, CompoundBaseMarketRows> = {};
  for (const [market, m] of r.byMarket) {
    const below = cutoff == null ? [] : m.events.filter((e) => e.blockNumber < cutoff);
    markets[market] = {
      rowPlan: [],
      eventsServed: 0,
      belowByDay: below.length > 0 ? eventsByDay(below, (e) => e.timestamp) : null,
    };
  }
  for (const row of trimmed.rows) {
    const m = markets[marketOf.get(row) ?? ""];
    if (!m) continue;
    m.rowPlan.push(row.kind === "event" ? { kind: "event" } : { kind: "folder", folder: row.folder });
    m.eventsServed += row.kind === "event" ? 1 : row.folder.count;
  }
  return { result, grouped, trimmed, kept, markets, span: null, market: null };
}

/** One market's month (or the week or day it shrank to). */
function groupCompoundBaseSpan(
  r: Replayed,
  market: string,
  span: { from: number; to: number },
  cap: number,
): CompoundBaseGroupedAnswer {
  const m = r.byMarket.get(market) ?? { events: [], eventsBefore: 0 };
  const a: ReplayGroupedAnswer<CometChainTimelineResult, BaseActivityEvent> = groupReplaySpan({
    full: { ...r.full, events: m.events },
    specs: r.specs,
    access: COMPOUND_BASE_ROW_ACCESS,
    eventsBefore: m.eventsBefore,
    cap,
    span,
  });
  return {
    result: r.full,
    grouped: a.grouped,
    trimmed: a.trimmed,
    kept: a.kept,
    markets: null,
    span,
    market,
  };
}

/** The route's body. The preload: the replay's envelope with `events`
 *  narrowed to the ungrouped ones every market keeps, and `marketRows`, each
 *  market's row plan over its own events in that list. A span: its market's
 *  rows and the span echoed, as `replayGroupedBody` answers one. */
export function compoundBaseGroupedBody(a: CompoundBaseGroupedAnswer) {
  const events = a.trimmed.rows.flatMap((row) => (row.kind === "event" ? [row.event] : []));
  const rows = {
    events,
    grouped: true as const,
    eventsServed: a.trimmed.eventsKept,
    boundBy: a.trimmed.boundBy,
    cutoffBlock: a.trimmed.cutoffBlock,
  };
  if (a.span) {
    const rowPlan: TimelineRowPlanEntry[] = a.trimmed.rows.map((row) =>
      row.kind === "event" ? { kind: "event" } : { kind: "folder", folder: row.folder },
    );
    return { wallet: a.result.wallet, ...rows, rowPlan, span: a.span, market: a.market };
  }
  return {
    ...a.result,
    ...rows,
    // The whole history's count: what the rows cover and what sits below.
    totalEvents: (a.result.coverage.omitted?.count ?? 0) + a.trimmed.eventsKept,
    marketRows: a.markets,
  };
}

export type CompoundBaseGroupedRead =
  | { kind: "grouped"; answer: CompoundBaseGroupedAnswer }
  /** The index cannot vouch for this history (or did not answer): the caller
   *  serves the flat answer, which sweeps. */
  | { kind: "flat" };

/**
 * Read, replay and group one wallet. The replay is kept a minute per wallet,
 * so a month read and a folder open after a page load neither re-read the
 * index nor re-run the replay; `preferRemembered` (the members route) also
 * takes the grouping the page drew. A span names its market.
 */
export async function readGroupedCompoundBase(
  p: LoadCometIndexParams,
  readerIp: string | undefined,
  opts: {
    span?: { from: number; to: number } | null;
    market?: string | null;
    preferRemembered?: boolean;
    cap?: number;
  } = {},
): Promise<CompoundBaseGroupedRead> {
  const span = opts.span ?? null;
  const market = span ? (opts.market ?? null) : null;
  if (span && !market) throw new Error("a month is read one market at a time");
  const cap = opts.cap ?? TIMELINE_WINDOW_EVENTS;
  const answers = answerStore<CompoundBaseGroupedAnswer>("compoundBase");
  const replays = answerStore<Replayed>("compoundBase.replay", 6);
  const answerKey = market ? `${p.wallet}|${market}` : p.wallet;
  if (opts.preferRemembered) {
    const hit = answers.get(answerKey, span);
    if (hit) return { kind: "grouped", answer: hit };
  }
  let replayed = span || opts.preferRemembered ? replays.get(p.wallet, null) : null;
  if (!replayed) {
    const prepared = await readCometIndex(p, readerIp);
    if (!prepared || !(prepared.whole || prepared.heavy)) return { kind: "flat" };
    replayed = replayWhole(prepared);
    replays.set(p.wallet, null, replayed);
  }
  const answer =
    span && market ? groupCompoundBaseSpan(replayed, market, span, cap) : groupCompoundBaseRest(replayed, cap);
  answers.set(answerKey, span, answer);
  return { kind: "grouped", answer };
}
