// SERVER-ONLY — Moonwell Base's history as ROWS: the folders the route serves.
// ----------------------------------------------------------------------------
// Leg C of the `0019` timeline-windowing programme. The route
// (`app/api/chain/moonwell-base/timeline`, `?group=1`) reads the index, replays
// EVERY row, and only then groups the events it produced — so each event keeps
// the running supply, mToken and debt figures a replay over the whole list
// gives it, and a folder standing for a hundred of them leaves nothing
// downstream to reconstruct. Why here and not in rails-server:
//
//   rails-ops/decisions/0019-timeline-boundary-card.md
//     — "Implementation note 2026-09-13 — leg C: Moonwell Base groups in the
//        web's route, after its replay".
//
// THE SPEC IS THE CLIENT'S, TRANSCRIBED. `lib/moonwell/timeline-runs.tsx`
// decides membership by signature (`isThirdParty`, shared from
// `timeline-membership.ts` so the two cannot drift) with a floor of four, and
// its folder header sums Repaid / Seized / Sent / Received. The header here is
// the same four verbs over the same members — in base units, per market address
// rather than per display symbol (two Base markets are both "USDC") — and the
// register that draws it is `MOONWELL_FOLDER_REGISTER` beside the spec.
//
// THE CUT. Grouped, a position's whole replayed history is served as rows up to
// the shared row cap (`TIMELINE_WINDOW_EVENTS`), trimmed from the oldest end at
// a block boundary. Past the cap the replay runs a second time with the anchor
// OFF and its render cut at the trim, so `coverage.omitted` — the boundary
// card's count, breakdown and state — describes exactly the rows below the
// trim, and nothing the page drew is also declared missing (the double count of
// leg A cannot arise here). A seeded heavy wallet's seed rows are below every
// cut and stay in `omitted` as they always were.

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolderLeg, TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import {
  baseUnitMagnitude,
  groupIntoRows,
  trimToRowCap,
  type GroupedRows,
  type GroupingAccess,
  type GroupingSpec,
  type TrimmedRows,
} from "@/lib/shared/timeline-grouping";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { externalActor } from "@/lib/shared/external-actor";
import { getEventActionKey, getEventAssetKeys, getEventCounterpartyKeys } from "@/lib/shared/event-filter-helpers";
import { MIN_ACTIVITY_RUN, isThirdParty } from "@/lib/moonwell/timeline-membership";
import type { MoonwellMarket } from "@/lib/moonwell/asset-catalog";
import type { MoonwellChainTimelineResponse } from "@/lib/moonwell-base/chain-timeline";
import { replayMoonwellRows } from "@/lib/sources/chain/moonwell-events";
import {
  readMoonwellIndex,
  type LoadMoonwellIndexParams,
  type MoonwellIndexPrepared,
} from "@/lib/sources/api/moonwell-base-timeline";

/** An mToken's own decimals on every Compound v2 fork. */
const MTOKEN_DECIMALS = 8;

const ZERO = BigInt(0);

const dataOf = (e: BaseActivityEvent): MoonwellContext | null => (isMoonwellEvent(e) ? e.context.data : null);

export const MOONWELL_ROW_ACCESS: GroupingAccess<BaseActivityEvent> = {
  // `${txHash}-${logIndex}` — a chain coordinate, and the id every card,
  // permalink and `?at=` landing on this page already uses.
  eventKey: (e) => e.id,
  txHash: (e) => e.txHash,
  blockNumber: (e) => e.blockNumber,
  timestamp: (e) => e.timestamp,
};

/** The kinds the header names as pills, in the client register's order —
 *  most severe first, then the two transfer directions. Any other member (a
 *  third-party mint or redeem, which Moonwell's markets make rare) is `other`. */
const COUNT_KINDS = ["liquidation", "repay", "transfer_out", "transfer_in"] as const;

const NOUN: Record<string, string> = {
  liquidation: "liquidation",
  repay: "repayment",
  transfer_in: "transfer",
  transfer_out: "transfer",
};

interface Sum {
  amount: bigint;
  count: number;
}

function add(into: Map<string, Sum>, key: string | undefined, raw: string | undefined): void {
  if (!key) return;
  const v = baseUnitMagnitude(raw);
  if (v == null) return;
  const cur = into.get(key) ?? { amount: ZERO, count: 0 };
  cur.amount += v;
  cur.count += 1;
  into.set(key, cur);
}

/**
 * A folder's header pairs — `folderCard` / `activityAggregates` in
 * timeline-runs.tsx, in base units.
 *
 * "Repaid" per market is the LARGER of the standalone repayments' Σ and the
 * liquidations' own debt legs' Σ, never their total: a liquidation's debt leg is
 * also a RepayBorrow, so the two sums can name the same repayment
 * (`maxBySymbol`'s own comment carries the argument). The pair's count is the
 * members behind the sum it took.
 *
 * A market the roster does not name draws no pair — its rows were already left
 * out by the reader, and an unscaled figure is not a figure.
 */
function moonwellLegs(members: BaseActivityEvent[], marketOf: (key: string) => MoonwellMarket | undefined) {
  const repaid = new Map<string, Sum>();
  const liquidated = new Map<string, Sum>();
  const seized = new Map<string, Sum>();
  const sent = new Map<string, Sum>();
  const received = new Map<string, Sum>();
  const repaidOrder: string[] = [];
  const noteRepaid = (key: string) => {
    if (!repaidOrder.includes(key)) repaidOrder.push(key);
  };
  for (const e of members) {
    const d = dataOf(e);
    if (!d) continue;
    switch (d.eventType) {
      case "repay":
        noteRepaid(d.market);
        add(repaid, d.market, d.raw?.amount);
        break;
      case "liquidation":
        noteRepaid(d.market);
        add(liquidated, d.market, d.raw?.amount);
        add(seized, d.collateralMarket, d.raw?.seizeTokens);
        break;
      case "transfer_out":
        add(sent, d.market, d.raw?.mTokens);
        break;
      case "transfer_in":
        add(received, d.market, d.raw?.mTokens);
        break;
    }
  }

  const legs: ServedFolderLeg[] = [];
  for (const key of repaidOrder) {
    const m = marketOf(key);
    const r = repaid.get(key);
    const l = liquidated.get(key);
    const chosen = r && (!l || r.amount >= l.amount) ? r : l;
    if (!m || !chosen) continue;
    legs.push({
      verb: "Repaid",
      asset: m.underlying.toLowerCase(),
      assetKeyKind: "tokenAddress",
      amount: chosen.amount.toString(),
      count: chosen.count,
      provWhat: "Debt repaid",
      symbol: m.symbol,
      decimals: m.decimals,
    });
  }
  const mTokenLegs = (sums: Map<string, Sum>, verb: string, provWhat: string) => {
    for (const [key, sum] of sums) {
      const m = marketOf(key);
      if (!m) continue;
      legs.push({
        verb,
        asset: m.mtoken.toLowerCase(),
        assetKeyKind: "tokenAddress",
        amount: sum.amount.toString(),
        count: sum.count,
        provWhat,
        // Filed under the underlying, as the rows are (`getEventAssetKeys`),
        // drawn as the receipt token wearing the underlying's mark.
        symbol: m.symbol,
        decimals: MTOKEN_DECIMALS,
        displaySymbol: `m${m.symbol}`,
      });
    }
  };
  mTokenLegs(seized, "Seized", "Collateral seized");
  mTokenLegs(sent, "Sent", "mTokens sent");
  mTokenLegs(received, "Received", "mTokens received");
  return legs;
}

/** Each market's lanes at the folder's edges: the figure before the FIRST
 *  member that touched the market and after the LAST one, keyed
 *  `supply:` / `mtokens:` / `debt:` + market, base units. Carried, not drawn
 *  (see `ServedFolder.stateBefore`). */
function moonwellState(members: BaseActivityEvent[]) {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const put = (key: string, b: string | undefined, a: string | undefined) => {
    if (b != null && !(key in before)) before[key] = b;
    if (a != null) after[key] = a;
  };
  for (const e of members) {
    const d = dataOf(e);
    if (!d?.raw) continue;
    put(`supply:${d.market}`, d.raw.supplyBefore, d.raw.supplyAfter);
    put(`mtokens:${d.market}`, d.raw.mTokensBefore, d.raw.mTokensAfter);
    put(`debt:${d.market}`, d.raw.debtBefore, d.raw.debtAfter);
  }
  return {
    before: Object.keys(before).length ? before : null,
    after: Object.keys(after).length ? after : null,
  };
}

/** The one Moonwell spec, as the index arms state theirs. `kind` is constant:
 *  the register reads a homogeneous folder off its `counts`, exactly as the
 *  client card reads it off its buckets. */
export function moonwellFolderSpecs(
  marketOf: (key: string) => MoonwellMarket | undefined,
): GroupingSpec<BaseActivityEvent>[] {
  return [
    {
      kind: "activity",
      match: isThirdParty,
      min: MIN_ACTIVITY_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      countKinds: COUNT_KINDS,
      legsFor: (members) => moonwellLegs(members, marketOf),
      // The page's own verdict (`summariseExternalActors` in the view): the
      // emitted party is the event's `caller`.
      actorOf: (e) => {
        const d = dataOf(e);
        return d ? externalActor({ txFrom: d.txFrom, poolCaller: d.caller }, e.wallet) : null;
      },
      stateOf: moonwellState,
      magnitudeOf: (e) => {
        const d = dataOf(e);
        if (!d?.raw) return null;
        const raw = d.eventType === "transfer_in" || d.eventType === "transfer_out" ? d.raw.mTokens : d.raw.amount;
        const amount = baseUnitMagnitude(raw);
        return amount == null ? null : { key: `${d.eventType}:${d.market}`, amount };
      },
      nounOf: (kind) => NOUN[kind] ?? kind.replace(/_/g, " "),
      // The members are the page's own events, so the cross-tab is keyed by
      // the filters' own functions and cannot disagree with them.
      cellOf: (e) => ({
        kind: getEventActionKey(e),
        assets: getEventAssetKeys(e),
        counterparties: getEventCounterpartyKeys(e),
      }),
    },
  ];
}

export interface MoonwellGroupedAnswer {
  /** The replay the page states its figures from — over every row, or at the
   *  row cap's cut when the history is longer than the cap. Its `events` are
   *  EVERY served event; `groupedTimelineBody` keeps only the ungrouped ones. */
  result: MoonwellChainTimelineResponse;
  grouped: GroupedRows<BaseActivityEvent>;
  trimmed: TrimmedRows<BaseActivityEvent>;
  /** Every event key the trimmed answer serves, in a row or in a folder. */
  kept: Set<string>;
}

/** Replay, group, trim — pure over a prepared index read. `cap` is the row cap
 *  and is the shared one everywhere but a verifier, which lowers it to reach the
 *  trim on a position that fits. */
export function groupMoonwellReplay(
  prepared: MoonwellIndexPrepared,
  opts: { cap?: number } = {},
): MoonwellGroupedAnswer {
  const full = replayMoonwellRows({ ...prepared.input, maxRendered: Number.MAX_SAFE_INTEGER });
  const events = full.events;
  const specs = moonwellFolderSpecs((key) => prepared.input.marketByMtoken.get(key.toLowerCase()));
  const grouped = groupIntoRows(events, specs, MOONWELL_ROW_ACCESS, {
    // The first served event's place in the WHOLE history: after the seed's
    // rows on a seeded heavy wallet, 1 everywhere else.
    ordinalBase: full.totalEvents - events.length + 1,
  });
  const trimmed = trimToRowCap(grouped, MOONWELL_ROW_ACCESS, opts.cap ?? TIMELINE_WINDOW_EVENTS);

  const kept = new Set<string>();
  let firstKept: string | null = null;
  for (const row of trimmed.rows) {
    const ids =
      row.kind === "event" ? [row.event.id] : (grouped.members.get(row.folder.responseId) ?? []).map((e) => e.id);
    for (const id of ids) {
      if (firstKept == null) firstKept = id;
      kept.add(id);
    }
  }

  let result = full;
  if (trimmed.cutoffBlock != null) {
    // The replay's own cut at the trim, anchor off: `omitted` then counts,
    // buckets and snapshots exactly the rows below it. The replay cuts by ROW
    // index and the trim by event; they are the same cut only while every row
    // became an event, which the index read guarantees (every row is dated) —
    // checked rather than assumed, because a boundary card over a different cut
    // would state a count the page contradicts.
    const cut = replayMoonwellRows({ ...prepared.input, maxRendered: trimmed.eventsKept, anchorWalletRows: false });
    if (cut.events.length !== trimmed.eventsKept || cut.events[0]?.id !== firstKept) {
      throw new Error(
        `Moonwell Base grouped cut disagrees with the replay's: ${cut.events.length} events from ${cut.events[0]?.id} against ${trimmed.eventsKept} from ${firstKept}`,
      );
    }
    result = cut;
  }
  return { result, grouped, trimmed, kept };
}

/** The route's body: the replay's envelope with `events` narrowed to the
 *  ungrouped ones and the row plan beside them — the same fields the index arms'
 *  proxies add (`GroupedTimelineFields`). */
export function groupedTimelineBody(answer: MoonwellGroupedAnswer) {
  const rowPlan: TimelineRowPlanEntry[] = answer.trimmed.rows.map((row) =>
    row.kind === "event" ? { kind: "event" } : { kind: "folder", folder: row.folder },
  );
  return {
    ...answer.result,
    events: answer.trimmed.rows.flatMap((row) => (row.kind === "event" ? [row.event] : [])),
    grouped: true as const,
    rowPlan,
    eventsServed: answer.trimmed.eventsKept,
    boundBy: answer.trimmed.boundBy,
  };
}

// ── The answer the members route opens against ─────────────────────────────
//
// Folders are computed on demand, never stored. An open follows a page load
// within seconds, so the last grouping per wallet is kept in memory for a
// minute and the members route answers from it — the index is not re-read and
// the replay not re-run for each of a page's folders. Held on `globalThis`
// because each route handler is its own bundle and a module-level map would be
// one per route. A stale entry is never wrong about its own members; a page
// that drew a newer grouping sees `stale` on the folder it opened
// (`FolderMembersProvider`).

const ANSWER_TTL_MS = 60_000;
const ANSWER_ENTRIES = 16;
const STORE = Symbol.for("rails.moonwellBase.groupedAnswers");

function store(): Map<string, { at: number; answer: MoonwellGroupedAnswer }> {
  const g = globalThis as unknown as Record<symbol, Map<string, { at: number; answer: MoonwellGroupedAnswer }>>;
  if (!g[STORE]) g[STORE] = new Map();
  return g[STORE];
}

export type MoonwellGroupedRead =
  | { kind: "grouped"; answer: MoonwellGroupedAnswer }
  /** The index cannot vouch for this history (or did not answer): the caller
   *  serves the flat answer, which sweeps. */
  | { kind: "flat" };

export async function readGroupedMoonwellBase(
  p: LoadMoonwellIndexParams,
  readerIp: string | undefined,
  opts: { preferRemembered?: boolean } = {},
): Promise<MoonwellGroupedRead> {
  const wallet = p.wallet.toLowerCase();
  const answers = store();
  if (opts.preferRemembered) {
    const hit = answers.get(wallet);
    if (hit && Date.now() - hit.at < ANSWER_TTL_MS) return { kind: "grouped", answer: hit.answer };
  }
  const prepared = await readMoonwellIndex(p, readerIp);
  if (!prepared || !(prepared.whole || prepared.heavy)) return { kind: "flat" };
  const answer = groupMoonwellReplay(prepared);
  answers.delete(wallet);
  answers.set(wallet, { at: Date.now(), answer });
  while (answers.size > ANSWER_ENTRIES) {
    const oldest = answers.keys().next();
    if (oldest.done) break;
    answers.delete(oldest.value);
  }
  return { kind: "grouped", answer };
}
