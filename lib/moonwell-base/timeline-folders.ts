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
// a block boundary; a month below it is sliced from the same replay
// (`?from=&to=`, lib/shared/replay-grouped-answer.ts). Past the cap the replay runs a second time with the anchor
// OFF and its render cut at the trim, so `coverage.omitted` — the boundary
// card's count, breakdown and state — describes exactly the rows below the
// trim, and nothing the page drew is also declared missing (the double count of
// leg A cannot arise here). A seeded heavy wallet's seed rows are below every
// cut and stay in `omitted` as they always were.

import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolderLeg } from "@/lib/shared/timeline-folder";
import { baseUnitMagnitude, type GroupingAccess, type GroupingSpec } from "@/lib/shared/timeline-grouping";
import {
  answerStore,
  groupReplayRest,
  groupReplaySpan,
  replayGroupedBody,
  type ReplayGroupedAnswer,
} from "@/lib/shared/replay-grouped-answer";
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
  // A liquidation's seizure leaves as two mToken transfers in its own
  // transaction; they are the Seized figure, not transfers the owner sent.
  const liquidationTxs = new Set(members.filter((e) => dataOf(e)?.eventType === "liquidation").map((e) => e.txHash));
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
        if (!liquidationTxs.has(e.txHash)) add(sent, d.market, d.raw?.mTokens);
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

export type MoonwellGroupedAnswer = ReplayGroupedAnswer<MoonwellChainTimelineResponse, BaseActivityEvent>;

/** The replay the answers slice: every row, with the render cut lifted. */
interface MoonwellReplayed {
  prepared: MoonwellIndexPrepared;
  full: MoonwellChainTimelineResponse;
  specs: GroupingSpec<BaseActivityEvent>[];
  /** Events of the whole history before `full.events[0]`: a seed's rows. */
  eventsBefore: number;
}

function replayWhole(prepared: MoonwellIndexPrepared): MoonwellReplayed {
  // Nothing is below a lifted cut, so the anchor has nothing to draw; off, it
  // states no `anchored` count on an answer the trim leaves whole.
  const full = replayMoonwellRows({
    ...prepared.input,
    maxRendered: Number.MAX_SAFE_INTEGER,
    anchorWalletRows: false,
  });
  return {
    prepared,
    full,
    specs: moonwellFolderSpecs((key) => prepared.input.marketByMtoken.get(key.toLowerCase())),
    eventsBefore: full.totalEvents - full.events.length,
  };
}

/** Replay, group, trim — pure over a prepared index read. The preload, or the
 *  span asked for. `cap` is the row cap and is the shared one everywhere but
 *  a verifier, which lowers it to reach the trim on a position that fits. */
export function groupMoonwellReplay(
  prepared: MoonwellIndexPrepared,
  opts: { cap?: number; span?: { from: number; to: number } | null } = {},
): MoonwellGroupedAnswer {
  return groupReplayed(replayWhole(prepared), opts.span ?? null, opts.cap);
}

function groupReplayed(
  r: MoonwellReplayed,
  span: { from: number; to: number } | null,
  cap: number = TIMELINE_WINDOW_EVENTS,
): MoonwellGroupedAnswer {
  if (span)
    return groupReplaySpan({
      full: r.full,
      specs: r.specs,
      access: MOONWELL_ROW_ACCESS,
      eventsBefore: r.eventsBefore,
      cap,
      span,
    });
  const { input } = r.prepared;
  return groupReplayRest({
    full: r.full,
    specs: r.specs,
    access: MOONWELL_ROW_ACCESS,
    // The first served event's place in the WHOLE history: after the seed's
    // rows on a seeded heavy wallet, 1 everywhere else.
    ordinalBase: r.eventsBefore + 1,
    cap,
    // The replay's cut at the trim, anchor off: `omitted` then counts,
    // buckets and snapshots the rows below it.
    recut: (cutoffBlock) =>
      replayMoonwellRows({
        ...input,
        maxRendered: input.rows.filter((row) => row.blockNumber >= cutoffBlock).length,
        anchorWalletRows: false,
      }),
    label: "Moonwell Base",
  });
}

/** The route's body (`replayGroupedBody`). */
export const groupedTimelineBody = (answer: MoonwellGroupedAnswer) => replayGroupedBody(answer);

// ── The answer the members route opens against ─────────────────────────────
//
// Folders are computed on demand, never stored. An open follows a page load
// within seconds, so the last grouping per (wallet, span) is kept in memory
// for a minute and the members route answers from it, and the replay is kept
// beside it so a month read does not re-read the index
// (lib/shared/replay-grouped-answer.ts `answerStore`).

export type MoonwellGroupedRead =
  | { kind: "grouped"; answer: MoonwellGroupedAnswer }
  /** The index cannot vouch for this history (or did not answer): the caller
   *  serves the flat answer, which sweeps. */
  | { kind: "flat" };

export async function readGroupedMoonwellBase(
  p: LoadMoonwellIndexParams,
  readerIp: string | undefined,
  opts: { preferRemembered?: boolean; span?: { from: number; to: number } | null } = {},
): Promise<MoonwellGroupedRead> {
  const span = opts.span ?? null;
  const answers = answerStore<MoonwellGroupedAnswer>("moonwellBase");
  const replays = answerStore<MoonwellReplayed>("moonwellBase.replay", 6);
  if (opts.preferRemembered) {
    const hit = answers.get(p.wallet, span);
    if (hit) return { kind: "grouped", answer: hit };
  }
  let replayed = span || opts.preferRemembered ? replays.get(p.wallet, null) : null;
  if (!replayed) {
    const prepared = await readMoonwellIndex(p, readerIp);
    if (!prepared || !(prepared.whole || prepared.heavy)) return { kind: "flat" };
    replayed = replayWhole(prepared);
    replays.set(p.wallet, null, replayed);
  }
  const answer = groupReplayed(replayed, span);
  answers.set(p.wallet, span, answer);
  return { kind: "grouped", answer };
}
