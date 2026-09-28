// SERVER-ONLY — one Morpho Blue Base position as ROWS: grouped after the
// replay, and a month of it sliced from that replay.
// ----------------------------------------------------------------------------
// Batch 5 of the row cut (rails-ops TO-DO-infra-and-backend.md, "the row cut
// and served folders are built on three lanes"). The route
// (`app/api/chain/morpho-base/timeline`, `?group=1&market=`) reads the index,
// replays EVERY row of the wallet's tail, and groups the events the replay
// produced for the one position the page draws, as the Aave-family Base
// routes do (lib/aave-v3-base/timeline-folders.ts): the singleton logs amounts
// and shares and no balances, so the running figures exist only after the
// replay, and grouping after it is a pure transform (rails-ops decision 0019,
// "leg C").
//
// THE SPEC IS THE INDEX'S, TRANSCRIBED from rails-server
// `api/src/services/morpho-timeline-folders.ts` (MORPHO_FOLDER_SPECS), which
// Morpho mainnet is served under: a liquidation run of four or more, and an
// owner run of five or more of the owner's own rows of one borrower action
// (add or remove collateral, borrow, repay) back to back, the opening row
// excepted (decision 0021, 2026-09-24). Base also carries the lender side,
// which mainnet's index does not: a supply or a withdrawal is its own row and
// closes a run, as any other row does. The page draws both kinds with the
// family's register (`MORPHO_FOLDER_REGISTER`). Not carried over: the state
// faces (no page reads a folder's `stateBefore`/`stateAfter`) and the flows
// (the replay reduces the lifetime flows over every row before this pass
// runs, lib/shared/timeline-grouping.ts).
//
// A POSITION IS ONE MARKET, so the route groups the market it is asked for.
// The preload is that position's newest rows up to the row cap; the replay
// runs again with that position's cut at the trim's block
// (`renderFromBlock`), so its `omitted` states the rows below it. Only that
// position draws: the others' events are not in the answer, which keeps the
// replay's per-liquidation oracle read to the page's own position.

import type { BaseActivityEvent, MorphoContext } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import {
  groupIntoRows,
  trimToRowCap,
  type GroupingAccess,
  type GroupingLegEntry,
  type GroupingSpec,
} from "@/lib/shared/timeline-grouping";
import { getEventActionKey, getEventAssetKeys, getEventCounterpartyKeys } from "@/lib/shared/event-filter-helpers";
import {
  answerStore,
  eventsByDay,
  groupReplaySpan,
  type ReplayGroupedAnswer,
} from "@/lib/shared/replay-grouped-answer";
import {
  replayMorphoRows,
  type MorphoChainTimelineResult,
  type MorphoDecodedRow,
  type MorphoSweptPosition,
} from "@/lib/sources/chain/morpho-blue-events";
import {
  readMorphoIndex,
  type LoadMorphoIndexParams,
  type MorphoIndexPrepared,
} from "@/lib/sources/api/morpho-base-timeline";

/** The web spec's liquidation floor (lib/morpho/timeline-runs.tsx). */
const MIN_LIQUIDATION_RUN = 4;
/** Decision 0021, 2026-09-24: the owner's runs collapse at five. */
const MIN_OWNER_RUN = 5;
/** The wire kind of an owner-run folder (lib/shared/owner-run-folders.tsx,
 *  which is a client module and is not imported into a route). */
const OWNER_RUN_KIND = "owner_run";

const dataOf = (e: BaseActivityEvent): MorphoContext | null => (isMorphoEvent(e) ? e.context.data : null);

export const MORPHO_BASE_ROW_ACCESS: GroupingAccess<BaseActivityEvent> = {
  // `${txHash}:${logIndex}` — the replay's id, a chain coordinate, and what
  // every card, permalink and `?at=` landing on this page uses.
  eventKey: (e) => e.id,
  txHash: (e) => e.txHash,
  blockNumber: (e) => e.blockNumber,
  timestamp: (e) => e.timestamp,
};

const OWNER_ACTIONS: Record<string, { verb: string; side: "collateral" | "loan"; prov: string }> = {
  supply_collateral: { verb: "Supplied", side: "collateral", prov: "Collateral added" },
  withdraw_collateral: { verb: "Withdrawn", side: "collateral", prov: "Collateral removed" },
  borrow: { verb: "Borrowed", side: "loan", prov: "Borrowed" },
  repay: { verb: "Repaid", side: "loan", prov: "Repaid" },
};
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The two specs, in the order the index declares them, for one position.
 *  `rowOf` finds the decoded row behind an event (its raw amounts). */
export function morphoBaseFolderSpecs(
  pos: MorphoSweptPosition,
  rowOf: (e: BaseActivityEvent) => MorphoDecodedRow | undefined,
): GroupingSpec<BaseActivityEvent>[] {
  /** A leg on one of the market's two tokens. A token whose decimals did not
   *  load has no figure to state; its pair is dropped. */
  const leg = (verb: string, side: "collateral" | "loan", amount: bigint, provWhat: string): GroupingLegEntry => {
    const collateral = side === "collateral";
    const unread = collateral ? pos.collateralDecimalsUnread : pos.loanDecimalsUnread;
    const symbol = collateral ? pos.collateralSymbol : pos.loanSymbol;
    return {
      verb,
      asset: collateral ? pos.collateralToken : pos.loanToken,
      assetKeyKind: "tokenAddress",
      amount: (amount < BigInt(0) ? -amount : amount).toString(),
      provWhat,
      symbol: unread ? null : symbol,
      decimals: unread ? null : collateral ? pos.collateralDecimals : pos.loanDecimals,
    };
  };
  // The route's verdict, as mainnet's: the replay puts the signer and the
  // caller on a row exactly when the position's owner is neither, and a
  // liquidation's actor is the liquidator, never counted.
  const actorOf = (e: BaseActivityEvent) => {
    const d = dataOf(e);
    if (!d || d.eventType === "liquidation") return null;
    return d.txFrom && d.caller ? d.txFrom : null;
  };
  const cellOf = (e: BaseActivityEvent) => ({
    kind: getEventActionKey(e),
    assets: getEventAssetKeys(e),
    counterparties: getEventCounterpartyKeys(e),
  });

  return [
    {
      kind: "liquidation",
      match: (e) => dataOf(e)?.eventType === "liquidation",
      min: MIN_LIQUIDATION_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      // "Repaid" is the loan the liquidation cleared (repaid plus any bad
      // debt), "Seized" the collateral taken, in the client spec's order.
      legsOf: (e) => {
        const r = rowOf(e);
        return r
          ? [
              leg("Repaid", "loan", r.assets, "Debt cleared"),
              leg("Seized", "collateral", r.collateral, "Collateral seized"),
            ]
          : [];
      },
      actorOf,
      cellOf,
    },
    {
      kind: OWNER_RUN_KIND,
      match: (e) => {
        const d = dataOf(e);
        return d != null && has(OWNER_ACTIONS, d.eventType) && !d.isOpen && actorOf(e) === null;
      },
      sameRun: (prev, next) => dataOf(prev)?.eventType === dataOf(next)?.eventType,
      min: MIN_OWNER_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      legsOf: (e) => {
        const d = dataOf(e);
        const r = rowOf(e);
        if (!d || !r || !has(OWNER_ACTIONS, d.eventType)) return [];
        const a = OWNER_ACTIONS[d.eventType];
        return [leg(a.verb, a.side, a.side === "collateral" ? r.collateral : r.assets, a.prov)];
      },
      actorOf,
      cellOf,
    },
  ];
}

// ── The replay the answers slice ────────────────────────────────────────────

interface Replayed {
  prepared: MorphoIndexPrepared;
  market: string;
  /** The replay with this position's render cut lifted and every other
   *  position's closed: all of this position's events, none of the others'. */
  full: MorphoChainTimelineResult;
  /** This position in `full`; null when the wallet never touched the market. */
  pos: MorphoSweptPosition | null;
  specs: GroupingSpec<BaseActivityEvent>[];
  /** This position's rows before `pos.events[0]`: its seed's. */
  eventsBefore: number;
}

/** Draw `market` from `from` on, and nothing of any other position. */
function renderOnly(prepared: MorphoIndexPrepared, market: string, from: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of prepared.input.seeds ?? []) out.set(s.marketId, Number.MAX_SAFE_INTEGER);
  for (const r of prepared.input.rows) out.set(r.marketId, Number.MAX_SAFE_INTEGER);
  out.set(market, from);
  return out;
}

async function replayWhole(prepared: MorphoIndexPrepared, market: string): Promise<Replayed> {
  const { input } = prepared;
  // Nothing is below a lifted cut, so the anchor has nothing to draw; off, it
  // states no `anchored` count on an answer the trim leaves whole.
  const full = await replayMorphoRows({
    ...input,
    maxRendered: Number.MAX_SAFE_INTEGER,
    renderFromBlock: renderOnly(prepared, market, 0),
    anchorWalletRows: false,
  });
  const byId = new Map<string, MorphoDecodedRow>();
  for (const r of input.rows) if (r.marketId === market) byId.set(`${r.txHash}:${r.logIndex}`, r);
  const pos = full.positions.find((p) => p.marketId === market) ?? null;
  const seed = input.seeds?.find((s) => s.marketId === market);
  return {
    prepared,
    market,
    full,
    pos,
    specs: pos ? morphoBaseFolderSpecs(pos, (e) => byId.get(e.id)) : [],
    eventsBefore: seed?.events ?? 0,
  };
}

export type MorphoBaseGroupedAnswer = Omit<
  ReplayGroupedAnswer<{ events: BaseActivityEvent[] }, BaseActivityEvent>,
  "result"
> & {
  result: MorphoChainTimelineResult;
  market: string;
};

/** The preload: the position's events grouped, trimmed to `cap` rows at a
 *  block, and the replay run again with the position's cut at that block. */
async function groupMorphoBaseRest(r: Replayed, cap: number): Promise<MorphoBaseGroupedAnswer> {
  const events = r.pos?.events ?? [];
  const grouped = groupIntoRows(events, r.specs, MORPHO_BASE_ROW_ACCESS, { ordinalBase: r.eventsBefore + 1 });
  const trimmed = trimToRowCap(grouped, MORPHO_BASE_ROW_ACCESS, cap);
  const kept = new Set<string>();
  let first: string | null = null;
  for (const row of trimmed.rows) {
    const list = row.kind === "event" ? [row.event] : (grouped.members.get(row.folder.responseId) ?? []);
    for (const e of list) {
      if (first == null) first = e.id;
      kept.add(e.id);
    }
  }
  let result = r.full;
  let belowByDay: ReturnType<typeof eventsByDay> | null = null;
  const cutoff = trimmed.cutoffBlock;
  if (cutoff != null) {
    const cut = await replayMorphoRows({
      ...r.prepared.input,
      maxRendered: Number.MAX_SAFE_INTEGER,
      renderFromBlock: renderOnly(r.prepared, r.market, cutoff),
      anchorWalletRows: false,
    });
    const cutPos = cut.positions.find((p) => p.marketId === r.market);
    const drawn = cutPos?.events ?? [];
    // Checked rather than assumed: a boundary card over a different cut would
    // state a count the page contradicts.
    if (drawn.length !== trimmed.eventsKept || (drawn[0]?.id ?? null) !== first) {
      throw new Error(
        `Morpho Base grouped cut disagrees with the replay's: ${drawn.length} events from ${
          drawn[0]?.id ?? "none"
        } against ${trimmed.eventsKept} from ${first}`,
      );
    }
    result = cut;
    belowByDay = eventsByDay(
      events.filter((e) => e.blockNumber < cutoff),
      (e) => e.timestamp,
    );
  }
  return { result, grouped, trimmed, kept, span: null, belowByDay, market: r.market };
}

function groupMorphoBaseSpan(r: Replayed, span: { from: number; to: number }, cap: number): MorphoBaseGroupedAnswer {
  const a = groupReplaySpan({
    full: { ...r.full, events: r.pos?.events ?? [] },
    specs: r.specs,
    access: MORPHO_BASE_ROW_ACCESS,
    eventsBefore: r.eventsBefore,
    cap,
    span,
  });
  return { ...a, result: r.full, market: r.market };
}

/** The route's body. The preload: the replay's envelope, every position's
 *  summary with its events emptied but this one's, whose events are narrowed
 *  to the ungrouped ones, and the row plan beside them. A span: the rows and
 *  the span echoed, as `replayGroupedBody` answers one. */
export function morphoBaseGroupedBody(a: MorphoBaseGroupedAnswer) {
  const rowPlan: TimelineRowPlanEntry[] = a.trimmed.rows.map((row) =>
    row.kind === "event" ? { kind: "event" } : { kind: "folder", folder: row.folder },
  );
  const events = a.trimmed.rows.flatMap((row) => (row.kind === "event" ? [row.event] : []));
  const rows = {
    grouped: true as const,
    rowPlan,
    eventsServed: a.trimmed.eventsKept,
    boundBy: a.trimmed.boundBy,
    cutoffBlock: a.trimmed.cutoffBlock,
  };
  if (a.span) return { wallet: a.result.wallet, events, ...rows, span: a.span, market: a.market };
  return {
    ...a.result,
    positions: a.result.positions.map((p) => ({ ...p, events: p.marketId === a.market ? events : [] })),
    ...rows,
    belowByDay: a.belowByDay,
    market: a.market,
  };
}

export type MorphoBaseGroupedRead =
  | { kind: "grouped"; answer: MorphoBaseGroupedAnswer }
  /** The index cannot vouch for this history (or did not answer): the caller
   *  serves the flat answer, which sweeps. */
  | { kind: "flat" };

/**
 * Read, replay and group one position. The replay is kept a minute per
 * position, so a month read and a folder open after a page load neither
 * re-read the index nor re-run the replay; `preferRemembered` (the members
 * route) also takes the grouping the page drew.
 */
export async function readGroupedMorphoBase(
  p: LoadMorphoIndexParams,
  market: string,
  readerIp: string | undefined,
  opts: { span?: { from: number; to: number } | null; preferRemembered?: boolean; cap?: number } = {},
): Promise<MorphoBaseGroupedRead> {
  const span = opts.span ?? null;
  const cap = opts.cap ?? TIMELINE_WINDOW_EVENTS;
  const id = market.toLowerCase();
  const key = `${p.wallet.toLowerCase()}|${id}`;
  const answers = answerStore<MorphoBaseGroupedAnswer>("morphoBase");
  const replays = answerStore<Replayed>("morphoBase.replay", 6);
  if (opts.preferRemembered) {
    const hit = answers.get(key, span);
    if (hit) return { kind: "grouped", answer: hit };
  }
  let replayed = span || opts.preferRemembered ? replays.get(key, null) : null;
  if (!replayed) {
    const prepared = await readMorphoIndex(p, readerIp);
    if (!prepared?.whole) return { kind: "flat" };
    replayed = await replayWhole(prepared, id);
    replays.set(key, null, replayed);
  }
  const answer = span ? groupMorphoBaseSpan(replayed, span, cap) : await groupMorphoBaseRest(replayed, cap);
  answers.set(key, span, answer);
  return { kind: "grouped", answer };
}
