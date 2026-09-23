// A wallet's WHOLE LIFE on Moonwell Base, read from the INDEX.
// ----------------------------------------------------------------------------
// The twin of lib/sources/chain/moonwell-events.ts's capture half. That module
// sweeps the chain on every visit — anchoring on the reward distributor and
// expanding receipts, because a Compound v2 market indexes nothing on its own
// events. The Sieve indexer has no such problem: it captures every mToken
// event into a table whose party is a plain column, the backfill has walked
// the history to the block Sieve took over at, and rails-server's
// /api/moonwell-base/timeline hands a wallet's rows over already attributed
// (routed mints and redeems resolved to their owner) with the block
// timestamp, the tx sender and the gas Sieve holds. Nothing here touches an
// RPC except the roster read (cached for a minute per process).
//
// The rows go through the SAME replay (replayMoonwellRows) the sweep uses,
// so the events, the three lanes, the lifetime flows, the peaks and the
// positions are byte-identical between the two sources; only
// `coverage.source` differs, and the footer and the receipts say which one
// they are looking at.
//
// ONE RULE APPLIED HERE THAT THE API LEAVES TO US: the API returns every
// mToken Transfer touching the wallet as it stands, and the sweep's rule
// decides which are custody moves — a wallet→mToken (or →router) transfer is
// a Redeem's companion unless the transaction liquidated the wallet on that
// collateral (then it is the protocol's cut of the seize), an mToken→wallet
// (or router→) transfer is a Mint's leg. `transferKind` is the sweep's own
// function, fed the liquidation rows from the same response.
//
// WHOLE OR NOTHING. The route that calls this uses the index only when the
// index can vouch for the whole life — the backfill has reached the Sieve
// checkpoint (`coverage.historyComplete`; Moonwell Base is ONE job over all
// 21 mTokens, so one coverage row is the whole verdict) — and sweeps
// otherwise. A partial index is stated truthfully here (a gap between the
// backfill cursor and the checkpoint) but is not what a reader is shown
// while a complete sweep is still possible.
//
// ONE ADDRESS IN TEN THOUSAND IS TOO BIG FOR THAT, AND IT IS STILL WHOLE.
// Three dozen Base addresses hold more Moonwell rows than the API can read
// inside its own statement timeout — twelve of them the mToken markets' own
// contracts, whose transfer tables key the underlying's every movement by the
// market address. For those the API sends the rows from a CUT and, beside
// them, the history before the cut as STATE: `heavy.seed`, the replay's whole
// state at a block boundary — per market the supply principal, the mToken
// balance, the debt, both peaks and the raw lifetime flows; for the wallet
// the event, transaction and liquidation counts and the first and last
// stamps — computed offline into a stored seed table (mig 204) because the
// clamped walks have a closed form a window function reproduces exactly
// (api/src/services/baseTimelineSeeds.ts). That seed opens every accumulator
// in `replayMoonwellRows`, the tail walks from there, and the positions, the
// peaks, the counts and the flows are the ones a replay over the whole list
// reaches, to the wei. The coverage then says `fromDeployment: true` from
// the Comptroller's first block, as it would for any whole read — nothing is
// missing from the record, the elided part travelled as state — and the
// page's `sweptClean` gate lets the peaks, the transaction count and the
// lifetime layer through.
//
// Until the seed is stored (or when the tail after it has grown past what the
// route reads whole) the API sends only the debt lane's state at the cut
// (`heavy.seeds`), and this reader turns the cut into a HORIZON: the coverage
// says the record starts there, not at the Comptroller's first block, and the
// page withholds every figure that would read a window as a lifetime. Either
// way it is served rather than swept, because the sweep's answer for such an
// address is a shallower horizon (300 expanded receipts) that costs half a
// minute of chain reads.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { timelineFillFromApi } from "@/lib/api/fetch-chain-timeline";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import {
  marketMapFromRoster,
  replayMoonwellRows,
  transferKind,
  type MoonwellDecodedRow,
  type MoonwellReplayInput,
  type MoonwellReplaySeed,
  type MoonwellReplayWholeSeed,
} from "@/lib/sources/chain/moonwell-events";
import { resolveMoonwellRoster } from "@/lib/sources/chain/moonwell-roster";
import type { MoonwellDeployment } from "@/lib/moonwell/asset-catalog";
import type { MoonwellChainTimelineResponse } from "@/lib/moonwell-base/chain-timeline";
import type { MvOracleAtBlock } from "@/lib/sources/api/moonwell-timeline";

/** One row as rails-server's /api/moonwell-base/timeline returns it (api/src/
 *  routes/baseMoonwell.ts TimelineRow). Numerics are decimal strings. */
interface IndexRow {
  kind: "mint" | "redeem" | "borrow" | "repay" | "liquidation" | "transfer_in" | "transfer_out";
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  /** The mToken address — the market key on Base. */
  market: string;
  caller: string | null;
  amount: string | null;
  mtokens: string | null;
  account_borrows: string | null;
  collateral_market: string | null;
  seize_tokens: string | null;
  liquidator: string | null;
  /** The Comptroller's own oracle state at the row's block (mig 195): the
   *  event market's raw price and exchange rate, the seized market's pair on
   *  a liquidation, the incentive and close factor. null until the filler has
   *  priced the block. */
  oracle_at_block?: MvOracleAtBlock | null;
}

interface IndexResponse {
  wallet: string;
  rows: IndexRow[];
  totalEvents: number;
  /** The API's row ceiling was hit — the list is cut, so a replay over it
   *  would be wrong from the cut on. Not whole. */
  truncated?: boolean;
  /** The WETH Router the API resolved routed mints/redeems against. */
  router: string;
  /** "plumbing" when the server flags this wallet as a router/relay; the
   *  replay then states no peak. Absent from a server before the flag. */
  peakWithheld?: "plumbing" | null;
  /** The lane's oracle-at-block walk (rails-server price-walk-fill.ts);
   *  read through timelineFillFromApi. */
  fill?: unknown;
  /** Present for a HEAVY wallet — one of the three dozen addresses whose
   *  Moonwell Base history is millions of rows, most of them the mToken
   *  markets' own contracts. `rows` is then the rows from `cut` on. With
   *  `seed` the history before the cut travels as the replay's whole state
   *  and `rows` is EVERY row after a block-boundary cut (see
   *  MoonwellReplayWholeSeed); without it — no seed stored yet, or the tail
   *  past the stored seed outgrew what the route reads whole — `rows` is the
   *  newest TAIL_ROWS cut at a transaction boundary and only the debt lane
   *  travels as state (`seeds`), the one lane the market emits a running
   *  total for rather than one summed over every row (MoonwellReplaySeed). */
  heavy?: {
    cut: { block: number; txIndex: number; logIndex: number };
    seeds: { market: string; debt: string; peakDebt: string }[];
    seed?: IndexFullSeed;
  };
  coverage: BaseLendingCoverage | null;
}

/** The stored seed as the API carries it (api/src/routes/baseMoonwell.ts
 *  TimelineFullSeed — mig 204's payload with its provenance). Token amounts
 *  are decimal strings of raw units; counts, blocks and timestamps are JSON
 *  numbers. `lifetime.repaid` is GROSS: the replay nets the liquidated debt
 *  out of it itself, over the whole life. */
interface IndexFullSeed {
  /** The payload grammar. This reader understands exactly SEED_VERSION; a
   *  seed under another version is treated as no seed — a horizon. */
  version: number;
  computedAt: string;
  cutBlock: number;
  wallet: {
    events: number;
    txCount: number;
    liquidations: number;
    firstBlock: number;
    firstTimestamp: number;
    lastBlock: number;
    lastTimestamp: number;
  };
  markets: {
    market: string;
    debt: string;
    peakDebt: string;
    supply: string;
    peakSupply: string;
    mtokens: string;
    lifetime: { supplied: string; withdrawn: string; borrowed: string; repaid: string; liquidatedDebt: string };
  }[];
}

/** The one seed grammar this reader consumes (api/src/services/
 *  baseTimelineSeeds.ts SEED_VERSION). A grammar change is a new version and
 *  a refill on the server, never a reinterpretation here. */
const SEED_VERSION = 1;

/** How many of the newest rows are drawn BY DEFAULT. The sweep draws 250
 *  because each drawn row costs it a block read; the index pays nothing, so
 *  this is a payload ceiling only — ten pages of the timeline, the one cut
 *  every timeline shares (rails-ops decision 0019, amended 2026-09-10). The
 *  replay still runs over every row regardless of this number (the balances,
 *  lifetime flows, peaks and positions are already whole), so raising it is
 *  never a correctness fix — the per-event pages raise it to read a pinned
 *  card's row wherever it sits (`LoadMoonwellIndexParams.maxRendered`). */
export const DEFAULT_MAX_RENDERED_EVENTS = TIMELINE_WINDOW_EVENTS;

export interface LoadMoonwellIndexParams {
  wallet: string;
  deployment: MoonwellDeployment;
  /** The Comptroller's own first block. */
  deployBlock: number;
  /** The WETH Router whose emitted minter/redeemer means "routed". */
  router: string;
  /** rails-server mount, e.g. "/api/moonwell-base". */
  apiPrefix: string;
  /** How many of the newest rows to draw. rails-server already returns this
   *  wallet's whole history in one response (no server-side windowing exists
   *  for Base), so a deeper render is a bigger local slice of what was
   *  already fetched, not a second, more expensive query. The position page
   *  takes the default; the per-event pages pass `Number.MAX_SAFE_INTEGER`
   *  so a pinned row below the cut is still served. */
  maxRendered?: number;
}

export interface MoonwellIndexRead {
  result: MoonwellChainTimelineResponse;
  /** True when the index vouches for the whole life. */
  whole: boolean;
  /** True when the API answered a HEAVY wallet: a tail plus the stored seed
   *  its elided history travels as — `whole` then, the seed being exact — or,
   *  while no seed is stored, a tail from a stated horizon. Either way the
   *  answer to serve — the sweep's alternative for such an address is a
   *  horizon too, drawn from 300 expanded receipts instead of the index's own
   *  rows, and it costs half a minute of chain reads to get there. */
  heavy: boolean;
  /** Why not whole, when not — for the route's log line. */
  reason?: string;
  /** The server's plumbing flag, read from every answer, whole or not: a
   *  route that falls back to the sweep passes it on, so a flagged wallet's
   *  swept replay states no peak either (rails-ops decision 0024). */
  peakWithheld: boolean;
}

/** The index's answer decoded and ready to replay, before the replay runs —
 *  so a caller that replays the same rows twice (the grouped route: once over
 *  every row to group, once more at the row cap's cut) reads the index once. */
export interface MoonwellIndexPrepared {
  /** Everything `replayMoonwellRows` takes except the render cut. */
  input: Omit<MoonwellReplayInput, "maxRendered">;
  /** The render cut this read was asked for. */
  maxRendered: number;
  whole: boolean;
  heavy: boolean;
  reason?: string;
}

/**
 * Read a wallet's history from the index and replay it. Resolves to null when
 * the index is not reachable at all (no RAILS_API_URL, or the API says it is
 * not configured) — "could not look" is left to the caller to decide about,
 * and is never returned as an empty history. Throws when the roster cannot be
 * read: the market list is the Comptroller's to state, and rows keyed by
 * mToken cannot be scaled or named without it.
 */
export async function loadMoonwellEventsFromIndex(
  p: LoadMoonwellIndexParams,
  readerIp?: string,
): Promise<MoonwellIndexRead | null> {
  const read = await readMoonwellIndex(p, readerIp);
  if (!read) return null;
  return {
    result: replayMoonwellRows({ ...read.input, maxRendered: read.maxRendered }),
    whole: read.whole,
    heavy: read.heavy,
    reason: read.reason,
    peakWithheld: read.input.peakWithheld ?? false,
  };
}

/** The read and the decode behind `loadMoonwellEventsFromIndex`, stopping
 *  short of the replay. Same null and same throw. */
export async function readMoonwellIndex(
  p: LoadMoonwellIndexParams,
  readerIp?: string,
): Promise<MoonwellIndexPrepared | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const wallet = p.wallet.toLowerCase();
  const router = p.router.toLowerCase();
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

  const roster = await resolveMoonwellRoster(p.deployment);
  if (!roster) throw new Error("Moonwell roster could not be read — the market list is the Comptroller's to state");
  const marketByMtoken = marketMapFromRoster(roster);
  const protocolLegs = new Set<string>([...marketByMtoken.keys(), router]);

  // Which collateral markets a liquidation of THIS wallet seized, per
  // transaction — the one case a wallet→mToken transfer is not a redeem
  // companion. The liquidation rows are in the same response.
  const seizedIn = new Map<string, Set<string>>();
  for (const r of json.rows) {
    if (r.kind !== "liquidation" || !r.collateral_market) continue;
    const tx = r.tx_hash.toLowerCase();
    if (!seizedIn.has(tx)) seizedIn.set(tx, new Set());
    seizedIn.get(tx)!.add(r.collateral_market.toLowerCase());
  }

  const timestamps = new Map<number, number>();
  const rows: MoonwellDecodedRow[] = [];
  const seen = new Set<string>();
  let unknownMarket = 0;
  for (const r of json.rows) {
    const market = r.market.toLowerCase();
    // The sweep decodes only the roster's mTokens; a market the Comptroller
    // no longer lists cannot be scaled or named, so its rows are counted and
    // left out here too, and the count is said in the log below.
    if (!marketByMtoken.has(market)) {
      unknownMarket++;
      continue;
    }
    const txHash = r.tx_hash.toLowerCase();
    // Two routed mints of one market in one transaction pair twice on the
    // API's router-leg join; the sweep dedupes on (tx, log) and so does this.
    const key = `${txHash}-${r.log_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const blockNumber = Number(r.block_number);
    const base: Omit<MoonwellDecodedRow, "kind"> = {
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash,
      txFrom: r.tx_from.toLowerCase(),
      market,
      txGasUsed: r.tx_gas_used,
      txGasPrice: r.tx_gas_price,
      oracleAtBlock: r.oracle_at_block ?? null,
    };
    const caller = r.caller ? r.caller.toLowerCase() : undefined;
    let row: MoonwellDecodedRow | null = null;
    switch (r.kind) {
      case "mint":
      case "redeem":
        row = { ...base, kind: r.kind, caller, amount: BigInt(r.amount!), mTokens: BigInt(r.mtokens!) };
        break;
      case "borrow":
        row = { ...base, kind: "borrow", amount: BigInt(r.amount!), accountBorrows: BigInt(r.account_borrows!) };
        break;
      case "repay":
        row = { ...base, kind: "repay", caller, amount: BigInt(r.amount!), accountBorrows: BigInt(r.account_borrows!) };
        break;
      case "liquidation":
        row = {
          ...base,
          kind: "liquidation",
          caller,
          amount: BigInt(r.amount!),
          collateralMarket: r.collateral_market!.toLowerCase(),
          seizeTokens: BigInt(r.seize_tokens!),
          liquidator: r.liquidator!.toLowerCase(),
        };
        break;
      case "transfer_in":
      case "transfer_out": {
        // The API resolved the direction; the sweep's rule decides whether it
        // is a custody move at all.
        const other = caller!;
        const from = r.kind === "transfer_out" ? wallet : other;
        const to = r.kind === "transfer_out" ? other : wallet;
        const kind = transferKind({
          from,
          to,
          wallet,
          protocolLegs,
          protocolCut: to === market && (seizedIn.get(txHash)?.has(market) ?? false),
        });
        if (kind) row = { ...base, kind, caller: other, mTokens: BigInt(r.mtokens!) };
        break;
      }
    }
    if (!row) continue;
    timestamps.set(blockNumber, Number(r.block_timestamp));
    rows.push(row);
  }
  // The API orders by (block, tx, log), but the replay's contract is stated
  // here rather than assumed of the wire.
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

  // A heavy wallet's elided rows, as the state they left behind. The stored
  // seed when the API sent one in the grammar this reader speaks — a market
  // the roster does not name is dropped here as its rows are above, a drift
  // to notice, not to replay — else the debt lane alone.
  const heavy = json.heavy;
  const full = heavy?.seed;
  const seed: MoonwellReplayWholeSeed | undefined =
    full && full.version === SEED_VERSION
      ? {
          ...full.wallet,
          markets: full.markets.flatMap((s) => {
            const market = s.market.toLowerCase();
            if (!marketByMtoken.has(market)) return [];
            return [
              {
                market,
                debtRaw: BigInt(s.debt),
                peakDebtRaw: BigInt(s.peakDebt),
                supplyRaw: BigInt(s.supply),
                peakSupplyRaw: BigInt(s.peakSupply),
                mTokensRaw: BigInt(s.mtokens),
                lifetime: {
                  supplied: BigInt(s.lifetime.supplied),
                  withdrawn: BigInt(s.lifetime.withdrawn),
                  borrowed: BigInt(s.lifetime.borrowed),
                  repaid: BigInt(s.lifetime.repaid),
                  liquidatedDebt: BigInt(s.lifetime.liquidatedDebt),
                },
              },
            ];
          }),
        }
      : undefined;
  const seeds: MoonwellReplaySeed[] | undefined =
    seed || !heavy
      ? undefined
      : heavy.seeds.map((s) => ({
          market: s.market.toLowerCase(),
          debtRaw: BigInt(s.debt),
          peakDebtRaw: BigInt(s.peakDebt),
        }));
  if (full && !seed)
    console.warn(
      `${p.apiPrefix}/timeline: seed version ${full.version} for ${wallet} is not ${SEED_VERSION} — horizon`,
    );

  // A heavy wallet's rows are a TAIL. With the seed beside them the elided
  // history travelled as state and the record is whole from the
  // Comptroller's first block. Without it only the debt lane travelled; every
  // other lane starts at the cut, so the history this reply is a record of
  // starts there too — `fromDeployment: false` from the cut's block, the
  // reader's own horizon grammar, which the page reads to withhold the peaks,
  // the transaction count and the lifetime layer.
  const horizon = heavy != null && seed == null;

  const input: Omit<MoonwellReplayInput, "maxRendered"> = {
    wallet,
    chainId: p.deployment.chainId,
    router,
    rows,
    ...(seed ? { seed } : seeds ? { seeds } : {}),
    marketByMtoken,
    timestamps,
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
      : json.truncated
        ? `row ceiling hit at ${json.rows.length}`
        : toBlock == null
          ? "no Sieve checkpoint"
          : horizon
            ? `heavy wallet — a tail from block ${heavy.cut.block}, no seed`
            : undefined;
  // Not a reason to sweep: the sweep decodes only the roster's mTokens and
  // would leave the same rows out. Said in the log, not hidden.
  if (unknownMarket > 0)
    console.warn(
      `${p.apiPrefix}/timeline: ${unknownMarket} rows for ${wallet} on a market the Comptroller no longer lists — left out`,
    );
  return {
    input,
    maxRendered: p.maxRendered ?? DEFAULT_MAX_RENDERED_EVENTS,
    whole: reason === undefined,
    heavy: heavy != null,
    reason,
  };
}
