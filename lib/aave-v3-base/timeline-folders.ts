// SERVER-ONLY — the Aave-family Pools on Base as ROWS: Aave V3 Base and
// Seamless, grouped after the replay, and a month sliced from it.
// ----------------------------------------------------------------------------
// Batch 3 of the row cut (rails-ops TO-DO-infra-and-backend.md, "the row cut
// and served folders are built on three lanes"). The routes
// (`app/api/chain/{aave-v3-base,seamless}/timeline`, `?group=1`) read the
// index, replay EVERY row of the tail, and group the events the replay
// produced, as Moonwell Base's route does (lib/moonwell-base/timeline-folders.ts):
// this family's events carry amounts and no balances, so the running figures
// exist only after the replay, and grouping after it is a pure transform
// (rails-ops decision 0019, "leg C").
//
// THE SPEC IS THE INDEX'S, TRANSCRIBED from rails-server
// `api/src/services/aave-family-timeline-folders.ts`, which Aave V3 mainnet and
// SparkLend are served under: two runs, both min 4 — liquidation (a
// `bad_debt_written_off` row rides with it; Base reads no DeficitCreated, so
// none arises here) and aToken transfer (a swap card is never a member) — the
// same legs keyed by the same reserve addresses, the same state faces and
// the same actor verdict. The page draws them with the family's register
// (`AAVE_V3_FOLDER_REGISTER`), as the mainnet page draws the index's.
//
// The index rows carry the reserve addresses and the events carry symbols, so
// a leg's asset comes from the row behind the event (by event key) and its
// symbol and decimals from the replay's token metadata.

import type { BaseActivityEvent, AaveV3Context } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import {
  baseUnitMagnitude,
  type GroupingAccess,
  type GroupingLegEntry,
  type GroupingSpec,
} from "@/lib/shared/timeline-grouping";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { externalActor } from "@/lib/shared/external-actor";
import { getEventActionKey, getEventAssetKeys, getEventCounterpartyKeys } from "@/lib/shared/event-filter-helpers";
import {
  answerStore,
  groupReplayRest,
  groupReplaySpan,
  type ReplayGroupedAnswer,
} from "@/lib/shared/replay-grouped-answer";
import {
  replayAaveV3Rows,
  type AaveV3ChainTimelineResult,
  type AaveV3DecodedRow,
} from "@/lib/sources/chain/aave-v3-events";
import {
  readAaveV3Index,
  type AaveV3IndexPrepared,
  type LoadAaveV3IndexParams,
} from "@/lib/sources/api/aave-v3-base-timeline";

const MIN_RUN = 4;

const dataOf = (e: BaseActivityEvent): AaveV3Context | null => (isAaveV3Event(e) ? e.context.data : null);

export const AAVE_V3_BASE_ROW_ACCESS: GroupingAccess<BaseActivityEvent> = {
  // `${txHash}-${logIndex}` — the replay's id, a chain coordinate, and
  // what every card, permalink and `?at=` landing on these pages already uses.
  eventKey: (e) => e.id,
  txHash: (e) => e.txHash,
  blockNumber: (e) => e.blockNumber,
  timestamp: (e) => e.timestamp,
};

/** What a leg needs about the row behind an event: its reserve addresses. */
interface RowAssets {
  reserve: string;
  collateralAsset?: string;
}

/** The two specs, in the order the index declares them. `assetsOf` resolves
 *  an event to its row's addresses; `metaOf` names an address. */
export function aaveV3BaseFolderSpecs(
  assetsOf: (e: BaseActivityEvent) => RowAssets | undefined,
  metaOf: (address: string | undefined) => { symbol: string; decimals: number; unresolved?: true } | undefined,
): GroupingSpec<BaseActivityEvent>[] {
  const leg = (
    verb: string,
    asset: string | undefined,
    amount: string | undefined,
    provWhat: string,
  ): GroupingLegEntry => {
    const m = metaOf(asset);
    return {
      verb,
      asset: asset ?? null,
      assetKeyKind: "tokenAddress",
      amount: amount ?? null,
      provWhat,
      // A token whose decimals did not load has no figure to state; its pair
      // is dropped on the page rather than drawn in the 18 stand-in.
      symbol: m && !m.unresolved ? m.symbol : null,
      decimals: m && !m.unresolved ? m.decimals : null,
    };
  };

  /** The position at a folder's edge, keyed `supply:` / `debt:` + reserve,
   *  base units — the index's `stateFace`. A liquidation speaks for both axes
   *  (collateral seized on the supply axis, debt covered on the debt axis). */
  const stateFace = (e: BaseActivityEvent, side: "before" | "after"): Record<string, string> => {
    const out: Record<string, string> = {};
    const d = dataOf(e);
    const a = assetsOf(e);
    if (!d?.raw || !a) return out;
    const supply = side === "before" ? d.raw.supplyBefore : d.raw.supplyAfter;
    const debt = side === "before" ? d.raw.debtBefore : d.raw.debtAfter;
    if (d.eventType === "liquidation") {
      if (a.collateralAsset && supply != null) out[`supply:${a.collateralAsset}`] = supply;
      if (debt != null) out[`debt:${a.reserve}`] = debt;
      return out;
    }
    const supplySide =
      d.eventType === "supply" ||
      d.eventType === "withdraw" ||
      d.eventType === "transfer_in" ||
      d.eventType === "transfer_out";
    if (supplySide && supply != null) out[`supply:${a.reserve}`] = supply;
    if (!supplySide && debt != null) out[`debt:${a.reserve}`] = debt;
    return out;
  };
  const stateOf = (members: BaseActivityEvent[]) => {
    const before = stateFace(members[0], "before");
    const after = stateFace(members[members.length - 1], "after");
    return {
      before: Object.keys(before).length ? before : null,
      after: Object.keys(after).length ? after : null,
    };
  };
  const actorOf = (e: BaseActivityEvent) => {
    const d = dataOf(e);
    return d ? externalActor({ txFrom: d.txFrom, poolCaller: d.poolCaller }, e.wallet) : null;
  };
  // The members are the page's events, so the cross-tab is keyed by the
  // filters' functions and cannot disagree with them.
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
        return t === "liquidation" || t === "bad_debt_written_off";
      },
      min: MIN_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      countKinds: ["liquidation", "bad_debt_written_off"],
      mixedKind: "mixed",
      legsOf: (e) => {
        const d = dataOf(e);
        const a = assetsOf(e);
        if (!d || !a) return [];
        if (d.eventType === "bad_debt_written_off")
          return [leg("Written off", a.reserve, d.raw?.amount, "Debt written off")];
        return [
          leg("Repaid", a.reserve, d.raw?.debtToCover, "Debt repaid"),
          leg("Seized", a.collateralAsset, d.raw?.liquidatedCollateralAmount, "Collateral seized"),
        ];
      },
      // Rule 6 compares a member with the median of its (kind, asset):
      // the debt covered, the figure the header leads with.
      magnitudeOf: (e) => {
        const d = dataOf(e);
        const a = assetsOf(e);
        if (!d || !a) return null;
        const amount = baseUnitMagnitude(d.eventType === "bad_debt_written_off" ? d.raw?.amount : d.raw?.debtToCover);
        return amount == null ? null : { key: `${d.eventType}:${a.reserve}`, amount };
      },
      actorOf,
      stateOf,
      cellOf,
    },
    {
      kind: "transfer",
      // A swap is a separate event type, so a swap card never matches here and
      // breaks the run instead of hiding inside it.
      match: (e) => {
        const t = dataOf(e)?.eventType;
        return t === "transfer_in" || t === "transfer_out";
      },
      min: MIN_RUN,
      kindOf: (e) => dataOf(e)?.eventType ?? "unknown",
      countKinds: ["transfer_in", "transfer_out"],
      mixedKind: "mixed",
      legsOf: (e) => {
        const d = dataOf(e);
        const a = assetsOf(e);
        if (!d || !a) return [];
        const into = d.eventType === "transfer_in";
        return [
          leg(into ? "Received" : "Sent", a.reserve, d.raw?.amount, `aTokens transferred ${into ? "in" : "out"}`),
        ];
      },
      magnitudeOf: (e) => {
        const d = dataOf(e);
        const a = assetsOf(e);
        const amount = baseUnitMagnitude(d?.raw?.amount);
        return d && a && amount != null ? { key: `${d.eventType}:${a.reserve}`, amount } : null;
      },
      actorOf,
      stateOf,
      cellOf,
    },
  ];
}

// ── The replay the answers slice ────────────────────────────────────────────

interface Replayed {
  prepared: AaveV3IndexPrepared;
  /** The replay with the render cut lifted: every event the tail holds. */
  full: AaveV3ChainTimelineResult;
  specs: GroupingSpec<BaseActivityEvent>[];
  /** Events of the whole history before `full.events[0]`: the seed's rows. */
  eventsBefore: number;
}

function replayWhole(prepared: AaveV3IndexPrepared): Replayed {
  const { input } = prepared;
  // Nothing is below a lifted cut, so the anchor has nothing to draw; off, it
  // states no `anchored` count on an answer the trim leaves whole.
  const full = replayAaveV3Rows({ ...input, maxRendered: Number.MAX_SAFE_INTEGER, anchorWalletRows: false });
  const byKey = new Map<string, AaveV3DecodedRow>();
  for (const r of input.rows) byKey.set(`${r.txHash}-${r.logIndex}`, r);
  const specs = aaveV3BaseFolderSpecs(
    (e) => {
      const r = byKey.get(e.id);
      return r
        ? { reserve: r.reserve, ...(r.collateralAsset ? { collateralAsset: r.collateralAsset } : {}) }
        : undefined;
    },
    (address) => (address ? input.metas.get(address) : undefined),
  );
  return { prepared, full, specs, eventsBefore: input.seed?.wallet.events ?? 0 };
}

export type AaveV3BaseGroupedAnswer = ReplayGroupedAnswer<AaveV3ChainTimelineResult, BaseActivityEvent>;

export type AaveV3BaseGroupedRead =
  | { kind: "grouped"; answer: AaveV3BaseGroupedAnswer }
  /** The index cannot vouch for this history (or did not answer): the caller
   *  serves the flat answer, which sweeps. */
  | { kind: "flat" };

/** The preload, or the span asked for, grouped. `cap` is the row cap and is
 *  the shared one everywhere but a verifier. */
export function groupAaveV3BaseReplay(
  r: Replayed,
  span: { from: number; to: number } | null,
  opts: { cap?: number } = {},
): AaveV3BaseGroupedAnswer {
  const cap = opts.cap ?? TIMELINE_WINDOW_EVENTS;
  if (span)
    return groupReplaySpan({
      full: r.full,
      specs: r.specs,
      access: AAVE_V3_BASE_ROW_ACCESS,
      eventsBefore: r.eventsBefore,
      cap,
      span,
    });
  const { input } = r.prepared;
  return groupReplayRest({
    full: r.full,
    specs: r.specs,
    access: AAVE_V3_BASE_ROW_ACCESS,
    ordinalBase: r.eventsBefore + 1,
    cap,
    // The replay's cut at the trim, anchor off: `omitted` then counts,
    // buckets and snapshots the rows below it. The trim is at a block
    // boundary, so the rows at or after that block are the rows it keeps.
    recut: (cutoffBlock) =>
      replayAaveV3Rows({
        ...input,
        maxRendered: input.rows.filter((row) => row.blockNumber >= cutoffBlock).length,
        anchorWalletRows: false,
      }),
    label: "Aave V3 Base",
  });
}

/**
 * Read, replay and group one wallet on one of the two Pools. The replay is
 * kept a minute per wallet, so a month read and a folder open after a page
 * load neither re-read the index nor re-run the replay; `preferRemembered`
 * (the members route) also takes the grouping the page drew.
 */
export async function readGroupedAaveV3Base(
  p: LoadAaveV3IndexParams,
  readerIp: string | undefined,
  opts: { span?: { from: number; to: number } | null; preferRemembered?: boolean } = {},
): Promise<AaveV3BaseGroupedRead> {
  const span = opts.span ?? null;
  const lane = `aaveV3Base.${p.apiPrefix}`;
  const answers = answerStore<AaveV3BaseGroupedAnswer>(lane);
  const replays = answerStore<Replayed>(`${lane}.replay`, 6);
  if (opts.preferRemembered) {
    const hit = answers.get(p.wallet, span);
    if (hit) return { kind: "grouped", answer: hit };
  }
  let replayed = span || opts.preferRemembered ? replays.get(p.wallet, null) : null;
  if (!replayed) {
    const prepared = await readAaveV3Index(p, readerIp);
    if (!prepared || !(prepared.whole || prepared.heavy)) return { kind: "flat" };
    replayed = replayWhole(prepared);
    replays.set(p.wallet, null, replayed);
  }
  const answer = groupAaveV3BaseReplay(replayed, span);
  answers.set(p.wallet, span, answer);
  return { kind: "grouped", answer };
}
