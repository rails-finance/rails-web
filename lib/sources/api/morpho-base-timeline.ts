// A wallet's WHOLE LIFE on Morpho Blue Base, read from the INDEX.
// ----------------------------------------------------------------------------
// The twin of lib/sources/chain/morpho-blue-events.ts's capture half. That
// module sweeps the singleton's logs on every visit because, when it was
// written, our tables held no Base history. They do now: the Sieve indexer
// captures the singleton's events, the backfill walks the history to the
// block Sieve took over at, and rails-server's /api/morpho-base/timeline
// hands a wallet's rows over raw — with the block timestamp and the tx
// sender Sieve holds, so nothing here touches an RPC except what the replay
// reads on both lanes (an unrostered market's params, a drawn liquidation's
// oracle price).
//
// The rows go through the SAME replay (replayMorphoRows) the sweep uses, so
// the positions, the events, the running balances, the lifetime flows and
// the peaks are byte-identical between the two sources; only
// `coverage.source` differs, and the footer and the receipts say which one
// they are looking at.
//
// WHOLE OR NOTHING. The route that calls this uses the index only when the
// index can vouch for the whole life — the backfill has reached the Sieve
// checkpoint (`coverage.historyComplete`) AND the lender side is captured
// (`lenderCaptured`: the sweep shows a wallet's Supply/Withdraw rows, so an
// index without them would be a regression) AND the read was not cut at the
// API's ceiling — and sweeps otherwise. A partial index is stated truthfully
// here (a gap between the backfill cursor and the checkpoint) but is not what
// a reader is shown while a complete sweep is still possible.
//
// A HEAVY wallet is still whole. A MetaMorpho vault holds a couple of hundred
// thousand singleton rows — a hundred megabytes of JSON that this reader
// replays and then draws two thousand rows of — so above the API's threshold
// the route sends the newest rows plus `heavy.seeds`: the replay's running
// state per market at the cut, aggregated over the elided rows. They go into
// the replay as each position's opening state, so the balances, the counts and
// the flows are the ones a replay over the whole list reaches; what the seeds
// cannot carry is a running PEAK, and the seed says so (`peaksPartial`).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import {
  replayMorphoRows,
  type MorphoChainTimelineResult,
  type MorphoDecodedRow,
  type MorphoReplaySeed,
} from "@/lib/sources/chain/morpho-blue-events";
import type { MorphoDeployment } from "@/lib/sources/chain/morpho-deployments";

/** One row as rails-server's /api/morpho-base/timeline returns it (api/src/
 *  routes/baseMorpho.ts TimelineRow). Numerics are decimal strings; the
 *  market id is 64 hex without 0x. */
interface IndexRow {
  kind: MorphoDecodedRow["kind"];
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string;
  market: string;
  caller: string;
  /** A collateral move's collateral; a loan-side move's assets; a
   *  liquidation's REPAID assets (bad debt beside it). */
  assets: string;
  shares: string | null;
  seized_assets: string | null;
  bad_debt_assets: string | null;
  bad_debt_shares: string | null;
}

/** One market's replay state at the cut, as the API sends it (api/src/routes/
 *  baseMorpho.ts TimelineSeed). Numerics are decimal strings. */
interface IndexSeed {
  market: string;
  supplyShares: string;
  borrowShares: string;
  collateral: string;
  borrowed: string;
  supplied: string;
  badDebt: string;
  liquidations: number;
  events: number;
  txCount: number;
  firstBlock: number;
  firstTimestamp: number;
  lastBlock: number;
  lastTimestamp: number;
  lifetime: {
    deposited: string;
    collateralWithdrawn: string;
    collateralLiquidated: string;
    borrowed: string;
    repaid: string;
    supplied: string;
    withdrawn: string;
  };
  peaksPartial: boolean;
}

interface IndexResponse {
  wallet: string;
  rows: IndexRow[];
  totalEvents: number;
  /** The API's row ceiling was hit — the list is cut, so a replay over it
   *  would be wrong from the cut on. Not whole. */
  truncated?: boolean;
  /** Set for a HEAVY wallet — a vault or a strategy contract, whose whole
   *  history is a hundred megabytes of rows. `rows` then holds the newest
   *  ones only and `seeds` holds the replay's running state per market at the
   *  cut, so nothing is missing: the elided part travels as state. */
  heavy?: {
    omittedBefore: { count: number; upToBlock: number };
    cut: { block: number; txIndex: number; logIndex: number };
    seeds: IndexSeed[];
  };
  /** Whether the box captures Supply/Withdraw at all. */
  lenderCaptured: boolean;
  coverage: BaseLendingCoverage | null;
}

const ZERO = BigInt(0);

/** The wallet-wide budget of drawn rows — the one cut every timeline shares
 *  (rails-ops decision 0019, amended 2026-09-10). The sweep draws 250 because
 *  each drawn row costs it a timestamp and a sender read; the index pays
 *  neither, so this is a payload ceiling only. The replay still runs over
 *  every row and each position's coverage states its omission. */
const MAX_RENDERED_EVENTS = TIMELINE_WINDOW_EVENTS;

export interface LoadMorphoIndexParams {
  wallet: string;
  deployment: MorphoDeployment;
  /** The singleton's own first block. */
  deployBlock: number;
}

export interface MorphoIndexRead {
  result: MorphoChainTimelineResult;
  /** True when the index vouches for the whole life — the only case the
   *  route serves it in place of a sweep. */
  whole: boolean;
  /** Why not, when not — for the route's log line. */
  reason?: string;
}

/**
 * Read a wallet's history from the index. Resolves to null when the index is
 * not reachable at all (no RAILS_API_URL, or the API says it is not
 * configured) — "could not look" is left to the caller to decide about, and
 * is never returned as an empty history.
 */
export async function loadMorphoEventsFromIndex(
  p: LoadMorphoIndexParams,
  readerIp?: string,
): Promise<MorphoIndexRead | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const wallet = p.wallet.toLowerCase();
  const res = await fetch(`${base}/api/morpho-base/timeline?wallet=${wallet}`, {
    ...createAuthFetchOptions(undefined, readerIp),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status !== 503) console.error(`/api/morpho-base/timeline answered ${res.status} ${res.statusText}`);
    return null;
  }
  const json = (await res.json()) as IndexResponse;
  const cov = json.coverage;

  const rows: MorphoDecodedRow[] = [];
  const timestamps = new Map<number, number>();
  const senders = new Map<string, string>();
  for (const r of json.rows) {
    const blockNumber = Number(r.block_number);
    const txHash = r.tx_hash.toLowerCase();
    timestamps.set(blockNumber, Number(r.block_timestamp));
    senders.set(txHash, r.tx_from.toLowerCase());
    const base = {
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash,
      kind: r.kind,
      marketId: `0x${r.market.toLowerCase()}`,
    };
    const caller = r.caller ? r.caller.toLowerCase() : undefined;
    switch (r.kind) {
      case "supply_collateral":
      case "withdraw_collateral":
        // The event's `assets` IS the collateral moved — the sweep's decode.
        rows.push({ ...base, assets: ZERO, shares: ZERO, collateral: BigInt(r.assets), caller });
        break;
      case "liquidation":
        // repaid + bad debt on both axes, seized as the collateral — the
        // sweep's exact sums, so the replay cannot tell the sources apart.
        rows.push({
          ...base,
          assets: BigInt(r.assets) + BigInt(r.bad_debt_assets ?? "0"),
          shares: BigInt(r.shares ?? "0") + BigInt(r.bad_debt_shares ?? "0"),
          collateral: BigInt(r.seized_assets ?? "0"),
          badDebtAssets: BigInt(r.bad_debt_assets ?? "0"),
        });
        break;
      default:
        rows.push({ ...base, assets: BigInt(r.assets), shares: BigInt(r.shares ?? "0"), collateral: ZERO, caller });
    }
  }
  // The API orders by (block, tx, log) and the key is unique, but the replay's
  // contract is stated here rather than assumed of the wire.
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // What the index is a complete record of. The backfill walks up from the
  // deploy block and Sieve holds everything past its checkpoint, so an
  // unfinished backfill is one hole: [cursor, checkpoint].
  const complete = cov?.historyComplete === true;
  const toBlock = cov?.sourceCheckpoint ?? null;
  const gaps =
    !complete && cov?.backfillNextBlock != null && cov?.backfillTo != null && cov.backfillNextBlock <= cov.backfillTo
      ? [{ from: cov.backfillNextBlock, to: cov.backfillTo }]
      : [];

  // A heavy wallet's elided rows, as the state they left behind. Without
  // `heavy` this is undefined and the replay runs exactly as it always has.
  const seeds: MorphoReplaySeed[] | undefined = json.heavy?.seeds.map((s) => ({
    marketId: `0x${s.market.toLowerCase()}`,
    supplyShares: BigInt(s.supplyShares),
    borrowShares: BigInt(s.borrowShares),
    collateral: BigInt(s.collateral),
    borrowed: BigInt(s.borrowed),
    supplied: BigInt(s.supplied),
    badDebt: BigInt(s.badDebt),
    liquidations: s.liquidations,
    events: s.events,
    txCount: s.txCount,
    firstBlock: s.firstBlock,
    firstTimestamp: s.firstTimestamp,
    lastBlock: s.lastBlock,
    lastTimestamp: s.lastTimestamp,
    lifetime: {
      deposited: BigInt(s.lifetime.deposited),
      collateralWithdrawn: BigInt(s.lifetime.collateralWithdrawn),
      collateralLiquidated: BigInt(s.lifetime.collateralLiquidated),
      borrowed: BigInt(s.lifetime.borrowed),
      repaid: BigInt(s.lifetime.repaid),
      supplied: BigInt(s.lifetime.supplied),
      withdrawn: BigInt(s.lifetime.withdrawn),
    },
    peaksPartial: s.peaksPartial,
  }));

  const result = await replayMorphoRows({
    wallet,
    deployment: p.deployment,
    rows,
    ...(seeds ? { seeds } : {}),
    maxRendered: MAX_RENDERED_EVENTS,
    // Every row came with its block's timestamp and its sender, whatever the
    // replay asks for — so its anchor is ON by default: a wallet-signed row
    // below a position's cut is decided by the sender it carries and dated by
    // the timestamp it carries, never dropped as `undated` (rails-ops
    // reference/timeline-attention-budget.md, decision 0019 leg F).
    metadata: async () => ({ timestamps, senders }),
    coverage: {
      fromBlock: p.deployBlock,
      toBlock: toBlock ?? p.deployBlock,
      fromDeployment: true,
      deployBlock: p.deployBlock,
      gaps,
      source: "index",
    },
  });

  const reason = !cov
    ? "no coverage row"
    : !complete
      ? `backfill at ${cov.backfillNextBlock ?? "?"} of ${cov.backfillTo ?? "?"}`
      : !json.lenderCaptured
        ? "lender side (Supply/Withdraw) not captured"
        : json.truncated
          ? `row ceiling hit at ${json.rows.length}`
          : toBlock == null
            ? "no Sieve checkpoint"
            : undefined;
  return { result, whole: reason === undefined, reason };
}
