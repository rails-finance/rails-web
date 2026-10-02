// A wallet's WHOLE LIFE on an Aave V3 Pool on Base, read from the INDEX.
// ----------------------------------------------------------------------------
// The twin of lib/sources/chain/aave-v3-events.ts's capture half. That module
// sweeps the chain's logs on every visit because, when it was written, our
// tables held no Base history. They do now: the Sieve indexer captures every
// Pool event and every aToken BalanceTransfer, the backfill has walked the
// history to the block Sieve took over at, and rails-server's
// /api/<protocol>/timeline hands a wallet's rows over already decoded — with
// the block timestamp and the tx sender Sieve holds, so nothing here touches
// an RPC except the one token-metadata multicall (cached for the process).
//
// The rows go through the SAME replay (replayAaveV3Rows) the sweep uses, so
// the events, the running balances, the lifetime flows and the peaks are
// byte-identical between the two sources; only `coverage.source` differs,
// and the footer and the receipts say which one they are looking at.
//
// WHOLE OR NOTHING. The route that calls this uses the index only when the
// index can vouch for the whole life — the backfill has reached the Sieve
// checkpoint (`coverage.historyComplete`) AND the aToken transfers are
// captured (`transfersCaptured`; the sweep shows them, so an index without
// them would be a regression) — and sweeps otherwise. A partial index is
// stated truthfully here (a gap between the backfill cursor and the
// checkpoint) but is not what a reader is shown while a complete sweep is
// still possible.
//
// FIFTY-TWO ADDRESSES ARE TOO BIG FOR THAT, AND THEY ARE STILL WHOLE. 47 on
// Aave V3 Base and 5 on Seamless hold more rows than the API can send at any
// sensible size — the heaviest is 2.1M rows, 220 MB, 23 seconds — and six of
// them are Aave's own aToken wrappers, which touch every depositor's balance
// change by design. For those the API sends every row at or after a
// block-boundary cut, names the cut, and beside them sends `heavy.seed`: the
// replay's whole state at the cut, computed offline by rails-server's seed
// filler (api/src/services/baseTimelineSeeds.ts `aaveFullSeedSql`, mig 204)
// — per reserve the clamped supply and debt principal, the peak each
// reached, and the six lifetime lanes as raw sums; per wallet the row count,
// the distinct own transactions and the first and last stamps. Nothing in
// this family's grammar makes that cheap (no Pool event carries a running
// total, and the replay's own balance is clamped at zero after every row, so
// a plain SUM is not it — measured −150,424 wei on Seamless's heaviest
// wallet), but the clamp has an exact closed form (`b = S − least(0, min S)`
// over the ordered rows) and the peak is a max over that same walk, so
// computed once offline the seed is exact to the wei. It goes into
// `replayAaveV3Rows` as the opening state, the tail walks from there, and the
// balances, the peaks, the counts and the flows are the ones a replay over
// the whole list reaches. The coverage then says `fromDeployment: true` from
// the Pool's first block, as it would for any whole read — the elided part
// travelled as state — and the page's `sweptClean` gate lets the peaks, the
// transaction count and the lifetime layer through.
//
// The lifetime lanes could not travel until the replay held them as bigints:
// accumulated as scaled float64 in row order, a SQL sum agreed with them to
// a part in 10⁷ and not bit for bit. They are bigints now, scaled once at
// the edge, which is what closed the gap (the Compound V3 Base precedent,
// lib/sources/api/compound-base-timeline.ts).
//
// A heavy answer that carries no `heavy.seed` — none stored yet for the
// wallet, a box behind mig 204, or a seed whose tail has grown past the
// server's bound — is what it always was: a tail from a HORIZON. The coverage
// says the record starts at the cut, not at the Pool's first block, and the
// page withholds every figure that would read a window as a lifetime.
// rails-server's `TimelineHorizon` argues both shapes out.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { timelineFillFromApi } from "@/lib/api/fetch-chain-timeline";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import {
  replayAaveV3Rows,
  type AaveV3ChainTimelineResult,
  type AaveV3DecodedRow,
  type AaveV3ReplayInput,
  type AaveV3ReplaySeed,
  AAVE_V3_SEED_LEGS,
} from "@/lib/sources/chain/aave-v3-events";
import { resolveV3Tokens, type V3TokenMeta } from "@/lib/sources/chain/aave-v3-tokens";
import type { ChainId } from "@/lib/shared/chains";

/** One row as rails-server's /api/<protocol>/timeline returns it (api/src/
 *  routes/baseLending.ts TimelineRow). Numerics are decimal strings. */
interface IndexRow {
  kind: AaveV3DecodedRow["kind"];
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string;
  reserve: string;
  amount: string;
  pool_caller: string | null;
  collateral_asset: string | null;
  liquidated_collateral_amount: string | null;
  liquidator: string | null;
  interest_rate_mode: string | null;
  borrow_rate: string | null;
  use_a_tokens: boolean | null;
  counterparty: string | null;
  atoken: string | null;
  /** The liquidity index the BalanceTransfer emitted (transfer rows only). */
  index_raw: string | null;
  /** The index the Pool applied to this row, from its transaction's
   *  ReserveDataUpdated (rails-server services/aave-base-row-indexes.ts):
   *  liquidity index on the supply lane, variable borrow index on the debt
   *  lane; and a liquidation's receiveAToken. Absent from an older api. */
  sup_index?: string | null;
  var_index?: string | null;
  receive_a_token?: boolean | null;
  /** At-block USD from the lane's oracle-at-block table (rails-server mig
   *  197): the Pool's own IAaveOracle read at the event's block by the
   *  roster filler, on mig 092's wire names. Absent until the filler has
   *  priced the block. Liquidations carry both legs plus the collateral
   *  reserve's liquidation bonus and protocol fee at the block (bps). */
  price_usd?: string | null;
  price_source?: string | null;
  collateral_price_usd?: string | null;
  collateral_price_source?: string | null;
  debt_price_usd?: string | null;
  debt_price_source?: string | null;
  liquidation_bonus_bps?: number | null;
  protocol_fee_bps?: number | null;
}

/** At-block price pair → the row's typed shape. NULL columns (the walk has
 *  not reached the block) drop the key; an unrecognized source string (a
 *  future filler source this build predates) is treated the same — the card
 *  renders token-only rather than mislabeling a receipt. */
function priceOf(
  usd: string | null | undefined,
  source: string | null | undefined,
): { usd: number; source: "iaave-oracle" } | undefined {
  if (usd == null || source !== "iaave-oracle") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

export interface AaveV3IndexResponse {
  wallet: string;
  rows: IndexRow[];
  totalEvents: number;
  /** The API's row ceiling was hit — the list is cut, so a replay over it
   *  would be wrong from the cut on. Not whole. */
  truncated?: boolean;
  transfersCaptured: boolean;
  /** "plumbing" when the server flags this wallet as a router/relay or names
   *  it as Base plumbing; the replay then states no peak. Absent from a
   *  server before the flag. */
  peakWithheld?: "plumbing" | null;
  /** The lane's oracle-at-block walk (rails-server price-walk-fill.ts);
   *  read through timelineFillFromApi. */
  fill?: unknown;
  /** Present for a HEAVY wallet — one of the 52 addresses whose history on
   *  these two Pools is hundreds of thousands to millions of rows, six of
   *  them Aave's own aToken wrappers. With `seed`: `rows` is every row at or
   *  after `cut` (a block boundary) and the seed is the replay's exact state
   *  before it. Without: `rows` is the newest ones only, cut at a
   *  transaction boundary, and the history before `cut` is not in the answer
   *  at all — a horizon (api/src/routes/baseLending.ts `TimelineHorizon`). */
  heavy?: { cut: { block: number; txIndex: number; logIndex: number }; seed?: IndexSeed };
  coverage: BaseLendingCoverage | null;
}

/** The replay's state at the cut as the API sends it (rails-server
 *  api/src/services/baseTimelineSeeds.ts `AaveSeedPayload`, with its
 *  provenance). Token amounts are raw integer units as decimal strings;
 *  counts, blocks and timestamps are numbers. `version` names the payload
 *  grammar; this reader speaks exactly SEED_VERSION and treats any other as
 *  no seed at all. */
interface IndexSeed {
  version: number;
  computedAt: string;
  cutBlock: number;
  wallet: {
    events: number;
    txCount: number;
    firstBlock: number;
    firstTimestamp: number;
    lastBlock: number;
    lastTimestamp: number;
  };
  reserves: {
    reserve: string;
    supply: string;
    debt: string;
    peakSupply: string;
    peakDebt: string;
    lifetime: {
      supplied: string;
      withdrawn: string;
      borrowed: string;
      repaid: string;
      liquidatedCollateral: string;
      liquidatedDebt: string;
    };
    /** Each lane's scaled state at the cut (decision 0033): null where the
     *  seed cannot state it, no key where the lane had no row before the cut.
     *  Absent on a seed written before the field. */
    chain?: {
      supply?: { scaled: string; net: string; index: string } | null;
      debt?: { scaled: string; net: string; index: string } | null;
    };
    /** The classifier's legs before the cut, raw (rails-server
     *  `aaveLegsSeedSql`), and the Pool sums of the rows a swap made there.
     *  Absent on a seed written before them. */
    legs?: Partial<Record<string, string>>;
    swapPool?: Partial<Record<string, string>>;
  }[];
}

/** A raw-amount map off the wire, keeping only the keys named and the
 *  entries that are integers. */
function rawMap<K extends string>(src: Partial<Record<string, string>> | undefined, keys: readonly K[]) {
  if (!src) return undefined;
  const out: Partial<Record<K, bigint>> = {};
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string" && /^\d+$/.test(v)) out[k] = BigInt(v);
  }
  return out;
}

/** The Pool's V3.5 upgrade, per lane: events at or before it round half up,
 *  later ones floor/ceiling (rails-server routes/baseLending.ts
 *  `halfUpThrough`, read from the Pool's Upgraded logs). Seamless never took
 *  V3.5. */
const HALF_UP_THROUGH: Record<string, readonly [number, number] | null> = {
  "/api/aave-v3-base": [33885416, 141],
  "/api/seamless": null,
};

/** The one seed grammar this reader understands. */
const SEED_VERSION = 1;

const RAY = BigInt("1000000000000000000000000000");
const ADDRESS = /^0x[0-9a-f]{40}$/;

/** How many of the newest rows are drawn — the one cut every timeline shares
 *  (rails-ops decision 0019, amended 2026-09-10). The sweep draws 250 because
 *  each drawn row costs it a timestamp and a sender read; the index pays
 *  neither, so this is a payload ceiling only — ten pages of the timeline.
 *  The replay still runs over every row and the boundary card states the
 *  cut. */
const MAX_RENDERED_EVENTS = TIMELINE_WINDOW_EVENTS;

export interface LoadAaveV3IndexParams {
  wallet: string;
  chainId: ChainId;
  /** rails-server mount, e.g. "/api/seamless". */
  apiPrefix: string;
  /** The Pool's own first block. */
  deployBlock: number;
}

export interface AaveV3IndexRead {
  result: AaveV3ChainTimelineResult;
  /** True when the index vouches for the whole life. */
  whole: boolean;
  /** True when the API answered a HEAVY wallet: a tail plus the seed its
   *  elided history travels as — `whole` then, the seed being exact — or,
   *  without a seed, a tail from a stated horizon. Either way the answer to
   *  serve — the sweep's alternative for such an address is millions of logs
   *  and a metadata read per drawn row, which is slower and no more
   *  complete. */
  heavy: boolean;
  /** Why not whole, when not — for the route's log line. */
  reason?: string;
  /** The server's plumbing flag, read from every answer, whole or not: a
   *  route that falls back to the sweep passes it on, so a flagged wallet's
   *  swept replay states no peak either (rails-ops decision 0024). */
  peakWithheld: boolean;
}

/** The read and the decode behind `loadAaveV3EventsFromIndex`, stopping
 *  short of the replay: what a caller needs to replay the rows itself, with a
 *  render cut it chooses (lib/aave-v3-base/timeline-folders.ts
 *  replays with the cut lifted and groups after). */
export interface AaveV3IndexPrepared {
  input: Omit<AaveV3ReplayInput, "maxRendered">;
  whole: boolean;
  heavy: boolean;
  reason?: string;
  peakWithheld: boolean;
}

/**
 * Read a wallet's history from the index. Resolves to null when the index is
 * not reachable at all (no RAILS_API_URL, or the API says it is not
 * configured) — "could not look" is left to the caller to decide about, and
 * is never returned as an empty history.
 */
export async function loadAaveV3EventsFromIndex(
  p: LoadAaveV3IndexParams,
  readerIp?: string,
): Promise<AaveV3IndexRead | null> {
  const read = await readAaveV3Index(p, readerIp);
  if (!read) return null;
  return {
    result: replayAaveV3Rows({ ...read.input, maxRendered: MAX_RENDERED_EVENTS }),
    whole: read.whole,
    heavy: read.heavy,
    reason: read.reason,
    peakWithheld: read.peakWithheld,
  };
}

/** The read and the decode behind `loadAaveV3EventsFromIndex`. Same null and
 *  same throw. */
export async function readAaveV3Index(
  p: LoadAaveV3IndexParams,
  readerIp?: string,
): Promise<AaveV3IndexPrepared | null> {
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
  const json = (await res.json()) as AaveV3IndexResponse;
  // The replay needs a symbol and decimals for every reserve it holds a
  // figure for — the rows' and the seed's.
  const metas = await resolveV3Tokens(aaveV3IndexReserves(json), p.chainId);
  return prepareAaveV3Index(json, metas, p);
}

/** Every reserve an index answer names: the rows' and the seed's. */
export function aaveV3IndexReserves(json: AaveV3IndexResponse): string[] {
  const addrs = new Set<string>();
  for (const r of json.rows) {
    addrs.add(r.reserve.toLowerCase());
    if (r.collateral_asset) addrs.add(r.collateral_asset.toLowerCase());
  }
  if (json.heavy?.seed?.version === SEED_VERSION)
    for (const r of json.heavy.seed.reserves) {
      const reserve = r.reserve.toLowerCase();
      if (ADDRESS.test(reserve)) addrs.add(reserve);
    }
  return [...addrs];
}

/** An index answer decoded for the replay, given its reserves' metadata.
 *  Pure: the verifiers run it over stored answers. */
export function prepareAaveV3Index(
  json: AaveV3IndexResponse,
  metas: Map<string, V3TokenMeta>,
  p: LoadAaveV3IndexParams,
): AaveV3IndexPrepared {
  const wallet = p.wallet.toLowerCase();
  const cov = json.coverage;

  const rows: AaveV3DecodedRow[] = [];
  const timestamps = new Map<number, number>();
  const senders = new Map<string, string>();
  for (const r of json.rows) {
    const blockNumber = Number(r.block_number);
    const txHash = r.tx_hash.toLowerCase();
    timestamps.set(blockNumber, Number(r.block_timestamp));
    senders.set(txHash, r.tx_from.toLowerCase());
    const isTransfer = r.kind === "transfer_in" || r.kind === "transfer_out";
    rows.push({
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash,
      kind: r.kind,
      reserve: r.reserve.toLowerCase(),
      // A transfer's emitted `value` is the SCALED balance; the underlying it
      // moved is value × the index it emitted ÷ 1e27 — the sweep's arithmetic.
      amount: isTransfer && r.index_raw != null ? (BigInt(r.amount) * BigInt(r.index_raw)) / RAY : BigInt(r.amount),
      ...(r.collateral_asset ? { collateralAsset: r.collateral_asset.toLowerCase() } : {}),
      ...(r.liquidated_collateral_amount != null
        ? { liquidatedCollateralAmount: BigInt(r.liquidated_collateral_amount) }
        : {}),
      ...(r.liquidator ? { liquidator: r.liquidator.toLowerCase() } : {}),
      ...(r.pool_caller ? { poolCaller: r.pool_caller.toLowerCase() } : {}),
      ...(r.counterparty ? { counterparty: r.counterparty.toLowerCase() } : {}),
      ...(r.interest_rate_mode != null ? { interestRateMode: Number(r.interest_rate_mode) } : {}),
      ...(r.borrow_rate != null ? { borrowRate: r.borrow_rate } : {}),
      ...(r.use_a_tokens != null ? { useATokens: r.use_a_tokens } : {}),
      // The index each lane was applied at: a transfer's own, a Pool row's
      // from its transaction's reserve update.
      ...(isTransfer
        ? r.index_raw != null
          ? { supplyIndex: BigInt(r.index_raw), scaledValue: BigInt(r.amount) }
          : {}
        : {
            ...(r.sup_index != null ? { supplyIndex: BigInt(r.sup_index) } : {}),
            ...(r.var_index != null ? { debtIndex: BigInt(r.var_index) } : {}),
          }),
      ...(r.receive_a_token != null ? { receiveAToken: r.receive_a_token } : {}),
      ...(r.kind === "liquidation"
        ? {
            collateralPrice: priceOf(r.collateral_price_usd, r.collateral_price_source),
            debtPrice: priceOf(r.debt_price_usd, r.debt_price_source),
            ...(r.liquidation_bonus_bps != null && r.liquidation_bonus_bps > 0
              ? {
                  liquidationBonusAtBlock: {
                    bonusBps: r.liquidation_bonus_bps,
                    protocolFeeBps: r.protocol_fee_bps ?? 0,
                  },
                }
              : {}),
          }
        : { price: priceOf(r.price_usd, r.price_source) }),
    });
  }
  // The API orders by (block, tx, log) and the key is unique, but the replay's
  // contract is stated here rather than assumed of the wire.
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // A heavy wallet's elided rows, as the state they left behind. Without
  // `heavy.seed` — or with one in a grammar this build does not speak —
  // this is undefined and the replay runs exactly as it always has. The
  // web holds no reserve roster for either Base Pool (their catalogs name
  // the Pool, the oracle and the first block, and every reserve's symbol and
  // decimals are read from the chain), so the seed's reserves are resolved
  // the way the rows' are, through the same metadata read; an entry that is
  // not an address at all is dropped rather than replayed under a key no row
  // could ever match.
  const heavy = json.heavy;
  const seed: AaveV3ReplaySeed | undefined =
    heavy?.seed && heavy.seed.version === SEED_VERSION
      ? {
          wallet: { ...heavy.seed.wallet },
          reserves: heavy.seed.reserves.flatMap((r) => {
            const reserve = r.reserve.toLowerCase();
            if (!ADDRESS.test(reserve)) return [];
            return [
              {
                reserve,
                supply: BigInt(r.supply),
                debt: BigInt(r.debt),
                peakSupply: BigInt(r.peakSupply),
                peakDebt: BigInt(r.peakDebt),
                lifetime: {
                  supplied: BigInt(r.lifetime.supplied),
                  withdrawn: BigInt(r.lifetime.withdrawn),
                  borrowed: BigInt(r.lifetime.borrowed),
                  repaid: BigInt(r.lifetime.repaid),
                  liquidatedCollateral: BigInt(r.lifetime.liquidatedCollateral),
                  liquidatedDebt: BigInt(r.lifetime.liquidatedDebt),
                },
                ...(r.chain
                  ? {
                      chain: Object.fromEntries(
                        (["supply", "debt"] as const)
                          .filter((axis) => r.chain![axis] !== undefined)
                          .map((axis) => {
                            const v = r.chain![axis];
                            return [
                              axis,
                              v ? { scaled: BigInt(v.scaled), net: BigInt(v.net), index: BigInt(v.index) } : null,
                            ];
                          }),
                      ),
                    }
                  : {}),
                ...(r.legs ? { legs: rawMap(r.legs, AAVE_V3_SEED_LEGS) } : {}),
                ...(r.swapPool ? { swapPool: rawMap(r.swapPool, ["supplied", "borrowed", "repaid"] as const) } : {}),
              },
            ];
          }),
        }
      : undefined;
  const seeded = seed != null;

  // What the index is a complete record of. The backfill walks up from the
  // deploy block and Sieve holds everything past its checkpoint, so an
  // unfinished backfill is one hole: [cursor, checkpoint].
  const complete = cov?.historyComplete === true;
  const toBlock = cov?.sourceCheckpoint ?? null;
  const gaps =
    !complete && cov?.backfillNextBlock != null && cov?.backfillTo != null && cov.backfillNextBlock <= cov.backfillTo
      ? [{ from: cov.backfillNextBlock, to: cov.backfillTo }]
      : [];

  // A heavy wallet's rows are a TAIL. With a seed beside them the elided
  // history travelled as state and the record is whole from the Pool's first
  // block. Without one, nothing travelled, and the record starts at the cut:
  // `fromDeployment: false` from that block, this reader's own horizon
  // grammar, which the page reads to withhold the peaks, the transaction
  // count and the lifetime layer.
  const horizon = heavy != null && !seeded;

  // Every row came with its block's timestamp and its sender (above), so the
  // replay's anchor is ON by default: a wallet-signed row below the render cut
  // is decided by the sender it carries and dated by the timestamp it carries,
  // never dropped as `undated` (rails-ops reference/timeline-attention-budget.md,
  // decision 0019 leg F).
  const input: Omit<AaveV3ReplayInput, "maxRendered"> = {
    wallet,
    chainId: p.chainId,
    rows,
    metas,
    timestamps,
    senders,
    ...(seed ? { seed } : {}),
    // Rows at the chain balance where the api sends each row's index.
    ...(p.apiPrefix in HALF_UP_THROUGH ? { chain: { halfUpThrough: HALF_UP_THROUGH[p.apiPrefix] } } : {}),
    peakWithheld: json.peakWithheld === "plumbing",
    coverage: {
      fromBlock: horizon ? heavy.cut.block : p.deployBlock,
      toBlock: toBlock ?? p.deployBlock,
      fromDeployment: !horizon,
      deployBlock: p.deployBlock,
      gaps,
      source: "index",
      fill: timelineFillFromApi(json.fill),
    },
  };

  const reason = !cov
    ? "no coverage row"
    : !complete
      ? `backfill at ${cov.backfillNextBlock ?? "?"} of ${cov.backfillTo ?? "?"}`
      : !json.transfersCaptured
        ? "aToken transfers not captured"
        : json.truncated
          ? `row ceiling hit at ${json.rows.length}`
          : toBlock == null
            ? "no Sieve checkpoint"
            : horizon
              ? heavy.seed
                ? `heavy wallet — a tail from block ${heavy.cut.block}, seed version ${heavy.seed.version} not understood`
                : `heavy wallet — a tail from block ${heavy.cut.block}, no seed`
              : undefined;
  return {
    input,
    whole: reason === undefined,
    heavy: heavy != null,
    reason,
    peakWithheld: json.peakWithheld === "plumbing",
  };
}
