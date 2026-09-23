// A wallet's WHOLE LIFE across the Compound V3 deployment on Base, read from
// the INDEX.
// ----------------------------------------------------------------------------
// The twin of lib/sources/chain/compound-v3-events.ts's capture half. That
// module sweeps the five Comets' logs on every visit because, when it was
// written, our tables held no Base history. They do now: the Sieve indexer
// captures every Comet event, the backfill has walked the history to the block
// Sieve took over at, and rails-server's /api/compound-base/timeline hands a
// wallet's rows over raw — with the block timestamp and the tx sender Sieve
// holds, so nothing here touches an RPC except the one collateral-metadata
// multicall (cached for the process).
//
// The rows go through the SAME replay (replayCometRows) the sweep uses, so the
// events, the running balances, the peaks and the lifetime flows are
// byte-identical between the two sources; only `coverage.source` differs, and
// the footer and the receipts say which one they are looking at.
//
// WHOLE OR NOTHING. The route that calls this uses the index only when the
// index can vouch for the whole life — the backfill has reached the Sieve
// checkpoint (`coverage.historyComplete`) — and sweeps otherwise. The five
// Comets share ONE coverage row on the server (the worker records the lowest
// of the five backfill cursors), so the verdict is one verdict for the whole
// deployment, which is also the grain the sweep reads at (all five Comets in
// one query, floored at the earliest one's first block). A partial index is
// stated truthfully here (a gap between the backfill cursor and the
// checkpoint) but is not what a reader is shown while a complete sweep is
// still possible.
//
// SIX ADDRESSES ARE TOO BIG FOR THAT, AND THEY ARE STILL WHOLE. Six wallets
// hold more rows on the five Comets than the API can send at a sensible size
// — the heaviest is 161,864 rows, 69.3 MB, 4.2 seconds on the box, and the
// page then replays every one of them in the browser to draw two thousand.
// Four are unnamed strategy contracts and two are busy bots; none is an
// address this explorer links to. For those the API sends the newest rows,
// names the cut, and beside them sends `heavy.seeds`: one per Comet market
// the wallet touched before the cut, the replay's running state there —
// the signed base, the peaks, each collateral asset's clamped balance and
// peak, the absorb and transaction and event counts, the first and last
// stamps, and the gross lifetime flows — every one of them exact in raw
// units (api/src/routes/baseComet.ts `TimelineSeed` states each lane's
// closed form). They go into `replayCometRows` as each market's opening
// state, the tail walks from there, and the positions, the peaks, the
// counts and the flows are the ones a replay over the whole list reaches,
// to the wei. The coverage then says `fromDeployment: true` from the
// earliest Comet's first block, as it would for any whole read — the
// elided part travelled as state, so nothing is missing from the record —
// and the page's `sweptClean` gate lets the principal, the peaks, the
// transaction count and the lifetime layer through.
//
// This is the Morpho Blue Base pattern (lib/sources/api/morpho-base-
// timeline.ts), and two things had to be true of THIS replay for it to
// apply. Every lane it runs has an exact closed form over the rows — the
// unclamped base is a plain sum, the peaks a running max over its prefix
// sums (a window function; the base axis is unclamped so the prefix sum IS
// the walk), the clamped collateral its Lindley form, the counts counts —
// and the lifetime flows accumulate as BIGINTS in raw units, split at the
// running base's zero crossings, so a SQL split over the same raw deltas
// lands on the same integers. Until the flows moved off float64 they were
// the one lane a seed could not carry, and a heavy wallet was served as a
// horizon (`fromDeployment: false` from the cut) — which is still what this
// reader does for a heavy answer that carries no `seeds`, so an older
// server keeps its exact behaviour. Unlike Morpho, the peaks here are NOT
// partial: Comet's base is unclamped, so its peak is a property of the
// prefix sums and a window reproduces it.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import type { CometDeployment } from "@/lib/compound/asset-catalog";
import {
  replayCometRows,
  type CometChainTimelineResult,
  type CometDecodedRow,
  type CometReplaySeed,
} from "@/lib/sources/chain/compound-v3-events";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { CompoundEventType } from "@/lib/shared/types/event-shape";

/** One row as rails-server's /api/compound-base/timeline returns it
 *  (api/src/routes/baseComet.ts TimelineRow). Numerics are decimal strings;
 *  amounts UNSIGNED — the sign is this module's, per kind, exactly as the
 *  sweep signs a decoded log. A transfer row carries both sides and yields
 *  the wallet's leg(s). */
interface IndexRow {
  kind:
    | "supply"
    | "withdraw"
    | "supply_collateral"
    | "withdraw_collateral"
    | "absorb_debt"
    | "absorb_collateral"
    | "transfer"
    | "transfer_collateral";
  market: string;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string;
  asset: string | null;
  amount: string;
  counterparty: string | null;
  xfer_from: string | null;
  xfer_to: string | null;
  usd_value: string | null;
}

interface IndexResponse {
  wallet: string;
  rows: IndexRow[];
  totalEvents: number;
  /** The API's row ceiling was hit — the list is cut, so a replay over it
   *  would be wrong from the cut on. Not whole. */
  truncated?: boolean;
  /** Present for a HEAVY wallet — one of the six addresses whose history
   *  across the five Comets is tens to hundreds of thousands of rows. `rows`
   *  is then the newest ones only, cut back to a transaction boundary, and
   *  the history before `cut` travels as `seeds` — the replay's exact state
   *  per market at the cut, read in the same snapshot as the tail. A server
   *  from before the seeds sends the cut alone, and the reader treats that
   *  as the horizon it always was. */
  heavy?: { cut: { block: number; txIndex: number; logIndex: number }; seeds?: IndexSeed[] };
  coverage: BaseLendingCoverage | null;
  /** Markets where the server flags this account as a router/relay; the
   *  replay states no peak there. Absent from a server before the flag. */
  peakWithheldMarkets?: string[];
}

/** One market's replay state at the cut, as the API sends it (api/src/routes/
 *  baseComet.ts TimelineSeed). Amounts are raw integer units as decimal
 *  strings; counts, blocks and timestamps are numbers. */
interface IndexSeed {
  market: string;
  base: string;
  peakLend: string;
  peakBorrow: string;
  collateral: Record<string, { balance: string; peak: string }>;
  absorbs: number;
  txCount: number;
  eventCount: number;
  firstBlock: number;
  firstTimestamp: number;
  lastBlock: number;
  lastTimestamp: number;
  lifetime: {
    deposited: string;
    withdrawn: string;
    borrowed: string;
    repaid: string;
    absorbedDebt: string;
    collateral: Record<
      string,
      { supplied: string; withdrawn: string; absorbed: string; received: string; sent: string }
    >;
  };
}

/** How many of the newest rows are drawn — the one cut every timeline shares
 *  (rails-ops decision 0019, amended 2026-09-10). The sweep draws 250 because
 *  each drawn row costs it a timestamp and a sender read; the index pays
 *  neither, so this is a payload ceiling only — ten pages of the timeline.
 *  The replay still runs over every row and the boundary card states the
 *  cut. */
const MAX_RENDERED_EVENTS = TIMELINE_WINDOW_EVENTS;

const BASE_KINDS = new Set<CompoundEventType>(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);

export interface LoadCometIndexParams {
  wallet: string;
  deployment: CometDeployment;
  /** rails-server mount, e.g. "/api/compound-base". */
  apiPrefix: string;
  /** The earliest Comet's first block — the floor of the whole life. */
  deployBlock: number;
}

export interface CometIndexRead {
  result: CometChainTimelineResult;
  /** True when the index vouches for the whole life. */
  whole: boolean;
  /** True when the API answered a HEAVY wallet: a tail plus the seeds its
   *  elided history travels as — `whole` then, the seeds being exact — or,
   *  from a server that sends no seeds, a tail from a stated horizon. Either
   *  way the answer to serve: the sweep's alternative for such an address is
   *  the five Comets' logs read from the earliest one's first block plus a
   *  timestamp and a sender per drawn row, which is slower and reaches a
   *  shallower horizon. */
  heavy: boolean;
  /** Why not whole, when not — for the route's log line. */
  reason?: string;
  /** The server's plumbing flag per market, read from every answer, whole or not: a
   *  route that falls back to the sweep passes it on, so a flagged wallet's
   *  swept replay states no peak either (rails-ops decision 0024). */
  peakWithheldMarkets: string[];
}

/**
 * Read a wallet's history from the index. Resolves to null when the index is
 * not reachable at all (no RAILS_API_URL, or the API says it is not
 * configured) — "could not look" is left to the caller to decide about, and
 * is never returned as an empty history.
 */
export async function loadCometEventsFromIndex(
  p: LoadCometIndexParams,
  readerIp?: string,
): Promise<CometIndexRead | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const wallet = p.wallet.toLowerCase();
  const res = await fetch(`${base}${p.apiPrefix}/timeline?wallet=${wallet}`, {
    ...createAuthFetchOptions(undefined, readerIp),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status !== 503) console.error(`${p.apiPrefix}/timeline answered ${res.status} ${res.statusText}`);
    return null;
  }
  const json = (await res.json()) as IndexResponse;
  const cov = json.coverage;
  const marketByKey = new Map(p.deployment.markets.map((m) => [m.key, m]));

  const rows: CometDecodedRow[] = [];
  const timestamps = new Map<number, number>();
  const senders = new Map<string, string>();
  for (const r of json.rows) {
    const market = marketByKey.get(r.market);
    // A market the roster does not name is not silently reshaped into one it
    // does; the server's table set and this roster are meant to be the same
    // five, and a row outside them is a drift to notice, not to draw.
    if (!market) continue;
    const blockNumber = Number(r.block_number);
    const txHash = r.tx_hash.toLowerCase();
    timestamps.set(blockNumber, Number(r.block_timestamp));
    senders.set(txHash, r.tx_from.toLowerCase());
    const head = { market, blockNumber, txIndex: r.tx_index, logIndex: r.log_index, txHash };
    const baseToken = market.baseToken.toLowerCase();
    const amount = BigInt(r.amount);
    const usd = r.usd_value != null ? { usdValue: BigInt(r.usd_value) } : {};
    const counterparty = (r.counterparty ?? "").toLowerCase();
    switch (r.kind) {
      case "supply":
        rows.push({ ...head, kind: "supply", asset: baseToken, delta: amount, counterparty });
        break;
      case "withdraw":
        rows.push({ ...head, kind: "withdraw", asset: baseToken, delta: -amount, counterparty });
        break;
      case "supply_collateral":
        rows.push({
          ...head,
          kind: "supply_collateral",
          asset: (r.asset ?? "").toLowerCase(),
          delta: amount,
          counterparty,
        });
        break;
      case "withdraw_collateral":
        rows.push({
          ...head,
          kind: "withdraw_collateral",
          asset: (r.asset ?? "").toLowerCase(),
          delta: -amount,
          counterparty,
        });
        break;
      case "absorb_debt":
        rows.push({ ...head, kind: "absorb_debt", asset: baseToken, delta: amount, counterparty, ...usd });
        break;
      case "absorb_collateral":
        rows.push({
          ...head,
          kind: "absorb_collateral",
          asset: (r.asset ?? "").toLowerCase(),
          delta: -amount,
          counterparty,
          ...usd,
        });
        break;
      case "transfer":
      case "transfer_collateral": {
        // The wallet's leg(s): a peer-to-peer move it is on both sides of
        // yields both, as the sweep's decoder and mig 053 do. Mint / burn legs
        // never reach here (the server leaves them out, as the sweep does).
        const from = (r.xfer_from ?? "").toLowerCase();
        const to = (r.xfer_to ?? "").toLowerCase();
        const collateral = r.kind === "transfer_collateral";
        const asset = collateral ? (r.asset ?? "").toLowerCase() : baseToken;
        if (from === wallet)
          rows.push({
            ...head,
            kind: collateral ? "transfer_collateral_out" : "transfer_out",
            asset,
            delta: -amount,
            counterparty: to,
          });
        if (to === wallet)
          rows.push({
            ...head,
            kind: collateral ? "transfer_collateral_in" : "transfer_in",
            asset,
            delta: amount,
            counterparty: from,
          });
        break;
      }
    }
  }
  // The API orders by (block, tx, log) and the key is unique, but the replay's
  // contract is stated here rather than assumed of the wire.
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // A heavy wallet's elided rows, as the state they left behind. Without
  // `heavy.seeds` this is undefined and the replay runs exactly as it always
  // has. A market the roster does not name is dropped here as its rows are
  // above — a drift to notice, not to replay.
  const heavy = json.heavy;
  const seeds: CometReplaySeed[] | undefined = heavy?.seeds?.flatMap((s) => {
    const market = marketByKey.get(s.market);
    if (!market) return [];
    const legs = <T extends Record<string, string>>(o: T): Record<keyof T, bigint> =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, BigInt(v)])) as Record<keyof T, bigint>;
    return [
      {
        market,
        base: BigInt(s.base),
        peakLend: BigInt(s.peakLend),
        peakBorrow: BigInt(s.peakBorrow),
        collateral: Object.fromEntries(
          Object.entries(s.collateral).map(([a, c]) => [
            a.toLowerCase(),
            { balance: BigInt(c.balance), peak: BigInt(c.peak) },
          ]),
        ),
        absorbs: s.absorbs,
        txCount: s.txCount,
        eventCount: s.eventCount,
        firstBlock: s.firstBlock,
        firstTimestamp: s.firstTimestamp,
        lastBlock: s.lastBlock,
        lastTimestamp: s.lastTimestamp,
        lifetime: {
          deposited: BigInt(s.lifetime.deposited),
          withdrawn: BigInt(s.lifetime.withdrawn),
          borrowed: BigInt(s.lifetime.borrowed),
          repaid: BigInt(s.lifetime.repaid),
          absorbedDebt: BigInt(s.lifetime.absorbedDebt),
          collateral: Object.fromEntries(
            Object.entries(s.lifetime.collateral).map(([a, c]) => [a.toLowerCase(), legs(c)]),
          ),
        },
      },
    ];
  });
  const seeded = seeds != null;

  // The replay needs decimals for every collateral asset it holds a figure
  // for — the tail's rows' and the seeds'.
  const collAddrs = new Set<string>();
  for (const d of rows) if (!BASE_KINDS.has(d.kind)) collAddrs.add(d.asset);
  for (const s of seeds ?? []) {
    for (const a of Object.keys(s.collateral)) collAddrs.add(a);
    for (const a of Object.keys(s.lifetime.collateral)) collAddrs.add(a);
  }
  const metas = await resolveErc20Meta([...collAddrs], p.deployment.chainId);

  // What the index is a complete record of. The backfill walks up from the
  // deploy block and Sieve holds everything past its checkpoint, so an
  // unfinished backfill is one hole: [cursor, checkpoint].
  const complete = cov?.historyComplete === true;
  const toBlock = cov?.sourceCheckpoint ?? null;
  const gaps =
    !complete && cov?.backfillNextBlock != null && cov?.backfillTo != null && cov.backfillNextBlock <= cov.backfillTo
      ? [{ from: cov.backfillNextBlock, to: cov.backfillTo }]
      : [];

  // A heavy wallet's rows are a TAIL. With seeds beside them the elided
  // history travelled as state and the record is whole from the earliest
  // Comet's first block. Without them — an older server — nothing travelled,
  // and the record starts at the cut: `fromDeployment: false` from that
  // block, this reader's own horizon grammar, which the page reads to
  // withhold the principal, the peaks, the transaction count and the
  // lifetime layer.
  const horizon = heavy != null && !seeded;

  // Every row came with its block's timestamp and its sender (above), so the
  // replay's anchor is ON by default: a wallet-signed row below the render cut
  // is decided by the sender it carries and dated by the timestamp it carries,
  // never dropped as `undated` (rails-ops reference/timeline-attention-budget.md,
  // decision 0019 leg F).
  const result = replayCometRows({
    wallet,
    chainId: p.deployment.chainId,
    deployment: p.deployment,
    rows,
    metas,
    timestamps,
    senders,
    maxRendered: MAX_RENDERED_EVENTS,
    ...(seeds ? { seeds } : {}),
    peakWithheldMarkets: json.peakWithheldMarkets ?? [],
    coverage: {
      fromBlock: horizon ? heavy.cut.block : p.deployBlock,
      toBlock: toBlock ?? p.deployBlock,
      fromDeployment: !horizon,
      deployBlock: p.deployBlock,
      gaps,
      source: "index",
    },
  });

  const reason = !cov
    ? "no coverage row"
    : !complete
      ? `backfill at ${cov.backfillNextBlock ?? "?"} of ${cov.backfillTo ?? "?"}`
      : json.truncated
        ? `row ceiling hit at ${json.rows.length}`
        : toBlock == null
          ? "no Sieve checkpoint"
          : horizon
            ? `heavy wallet — a tail from block ${heavy.cut.block}, no seeds`
            : undefined;
  return {
    result,
    whole: reason === undefined,
    heavy: heavy != null,
    reason,
    peakWithheldMarkets: json.peakWithheldMarkets ?? [],
  };
}
