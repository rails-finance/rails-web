// A wallet's WHOLE LIFE on Morpho Blue, read from the singleton's own logs.
// ----------------------------------------------------------------------------
// The Ethereum explorer gets this from an index: rails-server captures the
// singleton's events into the morpho_* tables and mig 045's MV replays the
// per-position running balances; the web route only does presentation. On
// Base this module was BOTH halves — the capture (a chunked sweep,
// lib/sources/chain/log-sweep) and the replay — emitting the exact same
// `MorphoContext` the index route emits, so the timeline card, its detail
// grid, its explainer and the economics tower are the Ethereum ones, reused
// rather than forked.
//
// The two halves are now two functions. `loadMorphoEventsFromChain` is the
// capture: the sweep, the decode, the coverage. `replayMorphoRows` is the
// replay, and it is SHARED with the index reader
// (lib/sources/api/morpho-base-timeline) — the Sieve indexer captures the
// singleton's events too, and once its backfill vouches for a wallet's whole
// life the route reads the same decoded rows from there instead of sweeping.
// Both sources go through the one replay, so the events, the running
// balances, the lifetime flows and the peaks are byte-identical between them;
// only `coverage.source` differs, and the footer and the receipts say which.
//
// Where the two lanes must agree, they agree deliberately, and the arithmetic
// here is the MV's line for line:
//
//   collateral = Σ (supply_collateral − withdraw_collateral − liquidation
//                seized), clamped ≥ 0 — exact, collateral doesn't accrue
//   borrowed   = Σ (borrow − repay − liquidation (repaid + bad debt)) assets —
//                PRINCIPAL, and NOT clamped: a full repay settles principal
//                plus the interest built on it, so the running figure can end
//                below zero, and the explainer reads that overshoot as the
//                interest paid
//   shares     = the same sums in shares, which ARE the position's slots
//
// That last line is the check. A wallet's replayed `borrowShares` and
// `collateral` must equal `Morpho.position(id, user)` to the wei — shares are
// conserved and collateral never accrues, so any drift is a sweep that missed
// a log, never interest. The asset-denominated principal is what interest
// drifts away from, and that difference is what the tower's principal /
// accrued-interest split is built on.
//
// Two of Blue's events put the owner in TOPIC 3 where the others put them in
// topic 2 — verified on the singleton's own Base logs, not assumed from the
// ABI: `Supply`, `Repay`, `SupplyCollateral` and `Liquidate` index (id, caller,
// onBehalf/borrower), while `Withdraw`, `Borrow` and `WithdrawCollateral`
// index (id, onBehalf, receiver) with the caller left in the data. So the
// sweep is two queries, and every decoded log is re-checked against the
// wallet before it is trusted.
//
// One thing the mainnet index lane has and this one does not: the lender
// side. The MV replays five borrower-scoped actions and carries no
// `Supply`/`Withdraw` rows at all. This sweep reads them — they are the
// wallet's own activity, and the live position read beside it shows the
// supply they built — and renders them through the card grammar's existing
// lender-side floor, with the running supplied principal on a field the
// index never sets (`suppliedAfter`). The economics tower stays
// borrower-scoped (collateral against debt), as on Ethereum; a supply is
// neither. The Base index reader keeps that parity rule: it is "whole" only
// when the box captures the lender side too.
//
// SERVER-ONLY.

import { decodeEventLog, encodeEventTopics, parseAbi } from "viem";
import { chainBatchClient, chainLogsClient } from "./rpc";
import { addressTopic, splitCoverage, sweepLogs, type BlockRange, type RawLog } from "./log-sweep";
import { inPacedGroups, resolveBlockTimestamps, resolveTxSenders } from "./sweep-metadata";
import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "./erc20-meta";
import { bucketsOf, type BoundaryStateLine, type TimelineCutSummary } from "@/lib/shared/timeline-boundary";
import type { MorphoDeployment } from "./morpho-deployments";
import { fmtUnits, MORPHO_EVENT_LABEL } from "@/lib/sources/api/morpho-timeline";
import { marketLabel } from "@/lib/morpho/asset-catalog";
import { explorerUrl } from "@/lib/shared/chains";
import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { AssetFlow, BaseActivityEvent, MorphoContext, MorphoEventType } from "@/lib/shared/types/event-shape";

const BLUE_EVENTS_ABI = parseAbi([
  "event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)",
  "event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)",
  "event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)",
  "event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)",
  "event SupplyCollateral(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets)",
  "event WithdrawCollateral(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets)",
  "event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)",
]);

const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
]);
const ORACLE_ABI = parseAbi(["function price() view returns (uint256)"]);

// Topic-0 of each event, DERIVED from the ABI at module load rather than
// pasted as literals — a signature edit can then never leave a stale hash
// silently filtering for an event that no longer exists.
const topic0 = (eventName: string): string =>
  encodeEventTopics({ abi: BLUE_EVENTS_ABI, eventName } as never)[0] as string;

const TOPIC0 = {
  Supply: topic0("Supply"),
  Withdraw: topic0("Withdraw"),
  Borrow: topic0("Borrow"),
  Repay: topic0("Repay"),
  SupplyCollateral: topic0("SupplyCollateral"),
  WithdrawCollateral: topic0("WithdrawCollateral"),
  Liquidate: topic0("Liquidate"),
} as const;

/** The events whose owner param is the THIRD indexed one (id, caller, owner). */
const OWNER_IN_TOPIC3 = [TOPIC0.Supply, TOPIC0.Repay, TOPIC0.SupplyCollateral, TOPIC0.Liquidate];
/** …and the ones where it is the SECOND (id, owner, receiver). */
const OWNER_IN_TOPIC2 = [TOPIC0.Withdraw, TOPIC0.Borrow, TOPIC0.WithdrawCollateral];

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Blocks per sweep chunk — HALF the sweep's default. Measured on a Base
 *  borrower with 13,214 events: one 5,000,000-block chunk answered in 32.8s
 *  (past the sweep's 30s deadline, so it was recorded as a hole — and the
 *  same chunk, twice), while its two halves answered in 0.2s and 1.0s. A chunk
 *  that runs out the deadline is gapped whole with no time left to halve it,
 *  so the size is set below the range that misbehaved. The singleton-plus-
 *  wallet filter is cheap per chunk (an untouched address answers 16 chunks
 *  in 1.7s), so the extra requests cost a normal wallet about a second. */
const CHUNK_BLOCKS = 2_500_000;

/** How many events get RENDERED across the wallet BY THE SWEEP. A wallet can
 *  be a vault or a strategy contract with tens of thousands of singleton
 *  events (66,979 on one Base MetaMorpho vault), and drawing them all costs
 *  a block timestamp and a transaction read per event — enough of both to
 *  trip every endpoint's rate limit — plus a payload nobody scrolls. The
 *  number is set by the METADATA rate (see sweep-metadata), not by the sweep;
 *  the index reader, which pays no metadata read, sets its own.
 *
 *  The budget is shared out PER POSITION rather than taken off the top of one
 *  wallet-wide list: a wallet in nine markets keeps its newest rows in every
 *  one of them, where a single newest-250 cut would leave its quieter markets
 *  with an empty list under a card. Each position draws its newest
 *  `max(MIN_RENDERED_PER_POSITION, budget ÷ positions)` rows, so the total
 *  stays bounded at roughly the budget. The replay still runs over EVERY row,
 *  so the running balances, the peaks and the lifetime sums are complete —
 *  only the drawn lists are capped, and each position's coverage says by how
 *  much. */
const MAX_RENDERED_EVENTS = 250;
const MIN_RENDERED_PER_POSITION = 10;

/** Lifetime gross flows for one position over the WHOLE swept history — the
 *  shape the economics tower's lifetime layer takes. Computed here rather than
 *  in the browser because the browser only has the rendered slice, and
 *  reducing a capped list into a bar labelled "all time" would state a recent
 *  window as a lifetime. Human token units: collateral ones in the collateral
 *  token, the rest in the loan token. */
export interface MorphoLifetimeFlows {
  deposited: number;
  collateralWithdrawn: number;
  collateralLiquidated: number;
  borrowed: number;
  repaid: number;
  supplied: number;
  withdrawn: number;
}

/** One (market, wallet) position as the sweep replayed it. */
export interface MorphoSweptPosition {
  /** 0x-prefixed market id (keccak of the params). */
  marketId: string;
  marketLabel: string;
  loanToken: string;
  loanSymbol: string;
  loanDecimals: number;
  collateralToken: string;
  collateralSymbol: string | null;
  collateralDecimals: number;
  isIdle: boolean;
  /** Liquidation LTV as a 0..1 fraction — the market's one line. */
  lltv: number;
  /** Collateral held now — replayed Σ, clamped ≥ 0 (human). Equals the
   *  `position()` slot exactly when the sweep was whole. */
  collateral: number;
  collateralRaw: string;
  /** Net borrowed PRINCIPAL (human loan token) — NOT clamped; see the module
   *  note on the overshoot a full repay leaves. */
  borrowed: number;
  /** Replayed borrow shares — the position's own slot, exact when whole. */
  borrowSharesRaw: string;
  /** Replayed supply shares — likewise. */
  supplySharesRaw: string;
  /** Net supplied PRINCIPAL on the lender side (human loan token). */
  supplied: number;
  /** Highest recorded collateral / borrowed principal after any event. */
  peakCollateral: number;
  peakBorrowed: number;
  everLiquidated: boolean;
  liquidationCount: number;
  /** Σ bad debt the position's liquidations socialised, human loan units. */
  badDebt: number;
  /** All rows the replay walked, including ones not drawn. */
  eventCount: number;
  /** DISTINCT transactions of the position's own — liquidations excluded,
   *  they are done TO it. The activity chip's figure. */
  txCount: number;
  firstBlock: number;
  lastBlock: number;
  /** Unix seconds of the position's last event; null when its block could not
   *  be dated. */
  lastTs: number | null;
  /** Unix seconds of the position's FIRST event — resolved for that block
   *  specifically, even when it sits far below the rendering cutoff. */
  firstEventAt: number | null;
  lifetime: MorphoLifetimeFlows;
  /** The drawn rows, oldest first. */
  events: BaseActivityEvent[];
  /** Set when this position's rows were cut by the wallet-wide cap.
   *  `anchored` — how many wallet-signed rows this position drew from below
   *  its cut — and `anchoredComplete` — whether that is the whole set, false
   *  beside THIS position's seed — ride exactly as they do on `coverage.omitted`. */
  omitted?: {
    count: number;
    upToBlock: number;
    anchored?: number;
    anchoredComplete?: boolean;
    summary?: TimelineCutSummary;
  };
  /** Rows dropped from the drawn list because their block could not be dated. */
  undated?: number;
  /** Set when this position's replay STARTED from a seed (the index sent the
   *  wallet's newest rows plus the running state behind them, because the
   *  whole list is a hundred megabytes). The state is exact — shares and
   *  collateral are sums — but a running PEAK is a property of the walk, not
   *  of its total, so the peaks below are a floor, not the lifetime highs,
   *  and the card states them as not recorded on this lane. */
  peaksPartial?: boolean;
}

/** One market's replay state before the rows the index sent — everything the
 *  per-position accumulator below holds at the cut, so a replay that starts
 *  here and walks the tail lands where a whole-history replay would.
 *  rails-server computes it with SQL aggregates over the elided rows
 *  (api/src/routes/baseMorpho.ts, `heavy.seeds`). */
export interface MorphoReplaySeed {
  /** 0x-prefixed, lowercase. */
  marketId: string;
  supplyShares: bigint;
  borrowShares: bigint;
  /** Σ collateral in − out, in raw collateral units. */
  collateral: bigint;
  /** Net borrowed principal, raw loan units — NOT clamped. */
  borrowed: bigint;
  /** Net supplied principal on the lender side, raw loan units. */
  supplied: bigint;
  badDebt: bigint;
  liquidations: number;
  /** Rows before the cut. Every one of them is omitted from the drawn list. */
  events: number;
  /** Distinct transactions before the cut, liquidations excluded. */
  txCount: number;
  firstBlock: number;
  firstTimestamp: number;
  lastBlock: number;
  lastTimestamp: number;
  /** Gross lifetime flows before the cut, RAW — scaled here with the market's
   *  own decimals. */
  lifetime: {
    deposited: bigint;
    collateralWithdrawn: bigint;
    collateralLiquidated: bigint;
    borrowed: bigint;
    repaid: bigint;
    supplied: bigint;
    withdrawn: bigint;
  };
  /** Whether the peaks are unknown before the cut. Always true today; the
   *  replay reads the reason off the seed rather than off the caller. */
  peaksPartial: boolean;
}

export interface MorphoChainTimelineResult {
  wallet: string;
  /** Every position the wallet's own events touched, most recently active
   *  first — including ones that have since closed. */
  positions: MorphoSweptPosition[];
  /** Rows across every position, drawn or not. */
  totalEvents: number;
  coverage: ChainTimelineCoverage;
}

/** One singleton event, decoded to what the replay needs — the shape both
 *  the sweep (from a log) and the index reader (from a Sieve row) produce. */
export interface MorphoDecodedRow {
  blockNumber: number;
  txIndex: number;
  logIndex: number;
  txHash: string;
  kind: MorphoEventType;
  /** 0x-prefixed, lowercase. */
  marketId: string;
  /** Loan-token amount this event moved (assets), for every kind but the
   *  collateral moves; on a liquidation, repaid + bad debt. */
  assets: bigint;
  /** Shares moved on the loan side; zero for collateral moves. */
  shares: bigint;
  /** Collateral moved: the collateral kinds' `assets`, a liquidation's seized. */
  collateral: bigint;
  badDebtAssets?: bigint;
  /** The event's own msg.sender param. Absent on a liquidation, whose actor is
   *  the liquidator. */
  caller?: string;
}

function decodeBlueLog(log: RawLog, wallet: string): MorphoDecodedRow | null {
  const base = {
    blockNumber: Number(log.blockNumber),
    txIndex: Number(log.transactionIndex),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash.toLowerCase(),
  };
  try {
    const { eventName, args } = decodeEventLog({
      abi: BLUE_EVENTS_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    }) as { eventName: string; args: Record<string, unknown> };
    // Every event is re-checked against the wallet. The two topic positions
    // are filtered separately above, and a sweep bug that let someone else's
    // row through would attribute their position to this wallet.
    const owner = String(args.onBehalf ?? args.borrower ?? "").toLowerCase();
    if (owner !== wallet) return null;
    const marketId = String(args.id).toLowerCase();
    const caller = args.caller != null ? String(args.caller).toLowerCase() : undefined;
    switch (eventName) {
      case "Supply":
        return {
          ...base,
          kind: "supply",
          marketId,
          assets: args.assets as bigint,
          shares: args.shares as bigint,
          collateral: ZERO,
          caller,
        };
      case "Withdraw":
        return {
          ...base,
          kind: "withdraw",
          marketId,
          assets: args.assets as bigint,
          shares: args.shares as bigint,
          collateral: ZERO,
          caller,
        };
      case "Borrow":
        return {
          ...base,
          kind: "borrow",
          marketId,
          assets: args.assets as bigint,
          shares: args.shares as bigint,
          collateral: ZERO,
          caller,
        };
      case "Repay":
        return {
          ...base,
          kind: "repay",
          marketId,
          assets: args.assets as bigint,
          shares: args.shares as bigint,
          collateral: ZERO,
          caller,
        };
      case "SupplyCollateral":
        return {
          ...base,
          kind: "supply_collateral",
          marketId,
          assets: ZERO,
          shares: ZERO,
          collateral: args.assets as bigint,
          caller,
        };
      case "WithdrawCollateral":
        return {
          ...base,
          kind: "withdraw_collateral",
          marketId,
          assets: ZERO,
          shares: ZERO,
          collateral: args.assets as bigint,
          caller,
        };
      case "Liquidate":
        return {
          ...base,
          kind: "liquidation",
          marketId,
          assets: (args.repaidAssets as bigint) + (args.badDebtAssets as bigint),
          shares: (args.repaidShares as bigint) + (args.badDebtShares as bigint),
          collateral: args.seizedAssets as bigint,
          badDebtAssets: args.badDebtAssets as bigint,
        };
    }
  } catch {
    // A log whose shape doesn't decode is not silently reshaped into an event.
  }
  return null;
}

interface MarketMeta {
  marketId: string;
  loan: Erc20Meta;
  collateral: Erc20Meta | null;
  isIdle: boolean;
  oracle: string;
  lltv: number;
}

// The roster is 4,306 rows and every request would otherwise rebuild the same
// map from it; one per deployment, built on first use.
const rosterCache = new WeakMap<MorphoDeployment, Map<string, MorphoDeployment["markets"][number]>>();
function rosterOf(deployment: MorphoDeployment): Map<string, MorphoDeployment["markets"][number]> {
  let m = rosterCache.get(deployment);
  if (!m) {
    m = new Map(deployment.markets.map((r) => [r.id.toLowerCase(), r]));
    rosterCache.set(deployment, m);
  }
  return m;
}

/** Each touched market's params — from the censused roster where the id is
 *  known, and from the singleton itself where it is not (a market created
 *  after the census block). An event in an unrostered market is resolved, not
 *  dropped: dropping it would leave the replay short of a real position. */
async function resolveMarkets(
  ids: string[],
  deployment: MorphoDeployment,
  client: ReturnType<typeof chainBatchClient>,
): Promise<Map<string, MarketMeta>> {
  const roster = rosterOf(deployment);
  const params = new Map<string, { loanToken: string; collateralToken: string; oracle: string; lltv: string }>();
  const missing: string[] = [];
  for (const id of ids) {
    const r = roster.get(id);
    if (r)
      params.set(id, { loanToken: r.loanToken, collateralToken: r.collateralToken, oracle: r.oracle, lltv: r.lltv });
    else missing.push(id);
  }
  if (missing.length > 0) {
    const res = (await client.multicall({
      allowFailure: true,
      contracts: missing.map(
        (id) =>
          ({
            address: deployment.blue as `0x${string}`,
            abi: BLUE_ABI,
            functionName: "idToMarketParams",
            args: [id as `0x${string}`],
          }) as const,
      ),
    })) as { status: string; result?: readonly [string, string, string, string, bigint] }[];
    missing.forEach((id, i) => {
      const r = res[i];
      if (r?.status === "success" && r.result) {
        const [loanToken, collateralToken, oracle, , lltv] = r.result;
        params.set(id, {
          loanToken: loanToken.toLowerCase(),
          collateralToken: collateralToken.toLowerCase(),
          oracle: oracle.toLowerCase(),
          lltv: lltv.toString(),
        });
      }
    });
  }

  const addrs = new Set<string>();
  for (const p of params.values()) {
    if (p.loanToken !== ZERO_ADDR) addrs.add(p.loanToken.toLowerCase());
    if (p.collateralToken !== ZERO_ADDR) addrs.add(p.collateralToken.toLowerCase());
  }
  const metas = await resolveErc20Meta([...addrs], deployment.chainId);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });

  const out = new Map<string, MarketMeta>();
  for (const [id, p] of params) {
    const loanAddr = p.loanToken.toLowerCase();
    const collAddr = p.collateralToken.toLowerCase();
    const isIdle = collAddr === ZERO_ADDR;
    out.set(id, {
      marketId: id,
      loan: metas.get(loanAddr) ?? fallback(loanAddr),
      collateral: isIdle ? null : (metas.get(collAddr) ?? fallback(collAddr)),
      isIdle,
      oracle: p.oracle.toLowerCase(),
      lltv: Number(p.lltv) / 1e18,
    });
  }
  return out;
}

/** The market oracle's own price at a liquidation's block — the figure the
 *  LLTV test and the incentive math acted on. On Ethereum mig 112 captures
 *  these into the index; here the oracle is asked at the block directly, for
 *  the drawn liquidation rows only (they are rare per wallet). A block that
 *  will not answer leaves the forensics token-only, exactly as an unpriced
 *  block does on the index lane. Raw 1e36-scaled. */
async function resolveOraclePrices(
  client: ReturnType<typeof chainBatchClient>,
  reads: { oracle: string; blockNumber: number }[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const key = (r: { oracle: string; blockNumber: number }) => `${r.oracle}:${r.blockNumber}`;
  const distinct = [...new Map(reads.map((r) => [key(r), r])).values()].filter((r) => r.oracle !== ZERO_ADDR);
  await inPacedGroups(distinct, async (r) => {
    const p = (await client.readContract({
      address: r.oracle as `0x${string}`,
      abi: ORACLE_ABI,
      functionName: "price",
      blockNumber: BigInt(r.blockNumber),
    })) as bigint;
    out.set(key(r), p);
  });
  return out;
}

export interface LoadMorphoChainEventsParams {
  wallet: string;
  deployment: MorphoDeployment;
  /** The singleton's own deployment block — the floor of a whole-life sweep. */
  deployBlock: number;
}

/**
 * Read every singleton event this wallet is the owner of, from the contract's
 * first block to the chain head, and replay them per market into the shared
 * timeline shape plus a per-position summary.
 */
export async function loadMorphoEventsFromChain(p: LoadMorphoChainEventsParams): Promise<MorphoChainTimelineResult> {
  const wallet = p.wallet.toLowerCase();
  const blue = p.deployment.blue.toLowerCase();
  const chainId = p.deployment.chainId;
  const logsClient = chainLogsClient(chainId);
  // Per-event metadata goes to the STATE endpoint, paced — see sweep-metadata
  // for why the history gateway is the wrong place for it.
  const stateClient = chainBatchClient(chainId);

  const head = Number(await stateClient.getBlockNumber());
  const range: BlockRange = { from: p.deployBlock, to: head };
  const walletTopic = addressTopic(wallet);

  // Two sweeps, because no filter can OR across topic POSITIONS.
  const opts = { chunkBlocks: CHUNK_BLOCKS };
  const [sweep3, sweep2] = await Promise.all([
    sweepLogs(logsClient, { address: blue, topics: [OWNER_IN_TOPIC3, null, null, walletTopic] }, range, opts),
    sweepLogs(logsClient, { address: blue, topics: [OWNER_IN_TOPIC2, null, walletTopic] }, range, opts),
  ]);

  const decoded: MorphoDecodedRow[] = [];
  for (const log of [...sweep3.logs, ...sweep2.logs]) {
    const d = decodeBlueLog(log, wallet);
    if (d) decoded.push(d);
  }
  decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // De-duplicate: a chunk retried after a partial failure can repeat a log.
  const seen = new Set<string>();
  const rows = decoded.filter((d) => {
    const k = `${d.txHash}-${d.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Where the history actually starts, and what is missing from inside it —
  // a stretch unread at the FLOOR is a horizon, anywhere else a hole.
  const { horizonTo, holes } = splitCoverage([...sweep3.gaps, ...sweep2.gaps], range.from);
  const floor = horizonTo != null ? horizonTo + 1 : range.from;

  return replayMorphoRows({
    wallet,
    deployment: p.deployment,
    rows,
    maxRendered: MAX_RENDERED_EVENTS,
    // The anchor is OFF on the sweep: the anchor asks for every below-cut
    // row's sender, and here each one is a paced chain read — the metadata
    // cost the 250-row cut exists to avoid. So the sweep cuts by depth alone
    // and states no guarantee. The index reader carries every row's sender
    // and anchors (lib/sources/api/morpho-base-timeline.ts).
    anchorWalletRows: false,
    // The drawn rows' blocks and senders are read from the chain, paced.
    metadata: async (blocks, txHashes) => {
      const [timestamps, senders] = await Promise.all([
        resolveBlockTimestamps(stateClient, blocks),
        resolveTxSenders(stateClient, txHashes),
      ]);
      return { timestamps, senders };
    },
    coverage: {
      fromBlock: floor,
      toBlock: range.to,
      fromDeployment: floor === p.deployBlock,
      deployBlock: p.deployBlock,
      gaps: holes,
      source: "sweep",
    },
  });
}

export interface MorphoReplayInput {
  wallet: string;
  deployment: MorphoDeployment;
  /** Every decoded row of the wallet's, sorted by (block, tx, log), unique.
   *  With `seeds`, the wallet's NEWEST rows only — the tail past the cut. */
  rows: MorphoDecodedRow[];
  /** The running state per market before `rows`, when the index sent a tail
   *  rather than a whole history. Absent — the sweep, and every wallet the
   *  index answers in full — leaves the replay exactly as it was. */
  seeds?: MorphoReplaySeed[];
  /** The wallet-wide budget of drawn rows (see MAX_RENDERED_EVENTS), shared
   *  out per position. Within each position's cut, rows the wallet signed
   *  itself are ANCHORED — drawn however far below it they sit (rails-ops
   *  reference/timeline-attention-budget.md, adjustment 1; ported from the
   *  Moonwell replay under decision 0019 leg F). */
  maxRendered: number;
  /** False turns the anchor OFF: every position's cut is a plain depth cut,
   *  every row below it is elided and neither `omitted.anchored` nor
   *  `omitted.anchoredComplete` rides. For a
   *  caller whose `metadata` costs a chain read per item — the sweep — since
   *  the anchor asks for every row's sender (see `metadata`). Default true,
   *  the Moonwell replay's own switch. */
  anchorWalletRows?: boolean;
  /** Block timestamps and transaction senders for the rows the replay decides
   *  to draw, plus each position's first and last block. With the anchor on
   *  the lists also name every row BELOW a position's cut — its sender is the
   *  one fact that decides whether it anchors, and an anchored row draws only
   *  if its block is dated. The sweep answers from the chain; the index reader
   *  answers from the rows it was handed, whatever the lists ask. */
  metadata: (
    blocks: number[],
    txHashes: string[],
  ) => Promise<{ timestamps: Map<number, number>; senders: Map<string, string> }>;
  coverage: Pick<ChainTimelineCoverage, "fromBlock" | "toBlock" | "fromDeployment" | "deployBlock" | "gaps" | "source">;
}

/**
 * Replay a wallet's decoded singleton rows per market into the shared
 * timeline shape plus a per-position summary. The one replay both sources
 * run: a row is a row whether a sweep decoded it from a log or the index
 * handed it over.
 */
export async function replayMorphoRows(p: MorphoReplayInput): Promise<MorphoChainTimelineResult> {
  const { wallet, rows } = p;
  const chainId = p.deployment.chainId;
  // Market params not in the roster, and each drawn liquidation's oracle
  // price, are read from the chain on both lanes (mainnet's mig 112 captures
  // the prices; the Base box does not).
  const stateClient = chainBatchClient(chainId);

  // The seeds, by market. A seeded market has rows BEFORE the ones handed
  // over: its counts, its ordinals and its running state all start from the
  // seed, so the cap and the draw decision are the ones a whole-history replay
  // would reach — the elided rows are counted, they are simply not here.
  const seedOf = new Map<string, MorphoReplaySeed>();
  for (const s of p.seeds ?? []) seedOf.set(s.marketId, s);
  const seedEvents = [...seedOf.values()].reduce((n, s) => n + s.events, 0);

  const countOf = new Map<string, number>();
  for (const s of seedOf.values()) countOf.set(s.marketId, s.events);
  for (const d of rows) countOf.set(d.marketId, (countOf.get(d.marketId) ?? 0) + 1);
  const perPositionCap = Math.max(MIN_RENDERED_PER_POSITION, Math.floor(p.maxRendered / Math.max(1, countOf.size)));
  // Each position keeps its NEWEST rows: the ordinal of a row within its own
  // market decides whether it is drawn.
  const ordinal = new Map<string, number>();
  for (const s of seedOf.values()) ordinal.set(s.marketId, s.events);
  const render: boolean[] = rows.map((d) => {
    const k = ordinal.get(d.marketId) ?? 0;
    ordinal.set(d.marketId, k + 1);
    return k >= Math.max(0, (countOf.get(d.marketId) ?? 0) - perPositionCap);
  });
  const shown = rows.filter((_, i) => render[i]);
  // Below a position's cut a row is either anchored (wallet-signed, drawn
  // anyway) or elided — decided in the walk below, once the senders are in
  // hand. The omitted figures are therefore the walk's, taken off each
  // position's ledger after it, not a count of `render` here.
  const anchorRows = p.anchorWalletRows !== false;
  const below = anchorRows ? rows.filter((_, i) => !render[i]) : [];

  // Every market the rows touch, and — for the "active since" of each
  // position — the block of each position's FIRST row, even when it sits far
  // below the rendering cutoff. Taking that from the rendered slice would date
  // the start of a capped list as the start of the position. With the anchor
  // on, every below-cut row's block too: an anchored row draws only if dated.
  const marketIds = [...new Set([...seedOf.keys(), ...rows.map((d) => d.marketId)])];
  const firstRowOf = new Map<string, MorphoDecodedRow>();
  const lastRowOf = new Map<string, MorphoDecodedRow>();
  for (const d of rows) {
    if (!firstRowOf.has(d.marketId)) firstRowOf.set(d.marketId, d);
    lastRowOf.set(d.marketId, d);
  }
  const blocks = [
    ...new Set([
      ...shown.map((d) => d.blockNumber),
      ...below.map((d) => d.blockNumber),
      ...[...firstRowOf.values()].map((d) => d.blockNumber),
      ...[...lastRowOf.values()].map((d) => d.blockNumber),
    ]),
  ];
  // The drawn rows' senders (a liquidation's actor is the liquidator, so its
  // card never needs one) and, with the anchor on, every below-cut row's —
  // the signature fact is what decides the anchor.
  const txHashes = [
    ...new Set([...shown.filter((d) => d.kind !== "liquidation").map((d) => d.txHash), ...below.map((d) => d.txHash)]),
  ];

  const markets = await resolveMarkets(marketIds, p.deployment, stateClient);
  const [{ timestamps: tsOf, senders: fromOf }, priceOf] = await Promise.all([
    p.metadata(blocks, txHashes),
    resolveOraclePrices(
      stateClient,
      shown
        .filter((d) => d.kind === "liquidation")
        .map((d) => ({ oracle: markets.get(d.marketId)?.oracle ?? ZERO_ADDR, blockNumber: d.blockNumber })),
    ),
  ]);

  // ── The replay, per market ─────────────────────────────────────────────────
  interface Running {
    coll: bigint;
    borr: bigint;
    bsh: bigint;
    ssh: bigint;
    sup: bigint;
    peakColl: bigint;
    peakBorr: bigint;
    badDebt: bigint;
    liq: number;
    n: number;
    txs: Set<string>;
    /** Distinct transactions the seed counted — they are not in `txs`, whose
     *  members are only the rows this replay walked. */
    seededTxs: number;
    omitted: number;
    omittedUpTo: number;
    /** The boundary card's facts (rails-ops decision 0019): the position
     *  after this market's newest elided row — taken the moment the walk
     *  reaches the market's first DRAWN row, before it moves anything — and
     *  the elided rows by kind. `undefined` until taken. */
    cutState?: BoundaryStateLine[] | null;
    cutTypes: Map<string, number>;
    /** Wallet-signed rows drawn from below this position's cut (the anchor). */
    anchoredDrawn: number;
    undated: number;
    /** Whether this position's peaks are a floor rather than the lifetime
     *  highs (see MorphoSweptPosition.peaksPartial). */
    peaksPartial: boolean;
    lifetime: MorphoLifetimeFlows;
    events: BaseActivityEvent[];
  }
  const run = new Map<string, Running>();
  const runOf = (id: string): Running => {
    let r = run.get(id);
    if (!r) {
      r = {
        coll: ZERO,
        borr: ZERO,
        bsh: ZERO,
        ssh: ZERO,
        sup: ZERO,
        peakColl: ZERO,
        peakBorr: ZERO,
        badDebt: ZERO,
        liq: 0,
        n: 0,
        txs: new Set(),
        seededTxs: 0,
        omitted: 0,
        omittedUpTo: 0,
        cutTypes: new Map(),
        anchoredDrawn: 0,
        undated: 0,
        peaksPartial: false,
        lifetime: {
          deposited: 0,
          collateralWithdrawn: 0,
          collateralLiquidated: 0,
          borrowed: 0,
          repaid: 0,
          supplied: 0,
          withdrawn: 0,
        },
        events: [],
      };
      run.set(id, r);
    }
    return r;
  };

  // Seeded markets open with the state the elided rows left, BEFORE the walk —
  // so a market whose whole history sits before the cut still becomes a
  // position, and the first row of the tail is not mistaken for the position's
  // opening one (`isOpen` reads `n === 0`). The peaks start at the seeded
  // balances: a floor, and `peaksPartial` says so.
  for (const s of seedOf.values()) {
    const m = markets.get(s.marketId);
    const loanDec = m?.loan.decimals ?? 18;
    const collDec = m?.collateral?.decimals ?? 18;
    const r = runOf(s.marketId);
    r.coll = s.collateral < ZERO ? ZERO : s.collateral;
    r.borr = s.borrowed;
    r.bsh = s.borrowShares;
    r.ssh = s.supplyShares;
    r.sup = s.supplied;
    r.peakColl = r.coll;
    r.peakBorr = r.borr > ZERO ? r.borr : ZERO;
    r.badDebt = s.badDebt;
    r.liq = s.liquidations;
    r.n = s.events;
    r.seededTxs = s.txCount;
    r.omitted = s.events;
    r.omittedUpTo = s.lastBlock;
    r.peaksPartial = s.peaksPartial;
    r.lifetime = {
      deposited: scaleRaw(s.lifetime.deposited, collDec),
      collateralWithdrawn: scaleRaw(s.lifetime.collateralWithdrawn, collDec),
      collateralLiquidated: scaleRaw(s.lifetime.collateralLiquidated, collDec),
      borrowed: scaleRaw(s.lifetime.borrowed, loanDec),
      repaid: scaleRaw(s.lifetime.repaid, loanDec),
      supplied: scaleRaw(s.lifetime.supplied, loanDec),
      withdrawn: scaleRaw(s.lifetime.withdrawn, loanDec),
    };
  }

  // The signature fact that anchors a row through its position's cut: the
  // wallet signed the transaction itself. Never the event KIND, and never the
  // event's `caller` param — a liquidation is the liquidator's transaction,
  // and a bundler's call names the bundler. The rule and its rationale:
  // rails-ops reference/timeline-attention-budget.md.
  const signedByWallet = (d: MorphoDecodedRow): boolean => fromOf.get(d.txHash) === wallet;

  rows.forEach((d, i) => {
    const m = markets.get(d.marketId);
    const r = runOf(d.marketId);
    const loanDec = m?.loan.decimals ?? 18;
    const collDec = m?.collateral?.decimals ?? 18;
    const loanSym = m?.loan.symbol ?? "?";
    const collSym = m?.collateral?.symbol ?? null;
    const isOpen = r.n === 0;
    // Below the position's cut a wallet-signed row is anchored (drawn anyway)
    // and an unsigned one is elided. Decided first, because only an ELIDED row
    // belongs in the histogram: a row counted there AND drawn would make the
    // boundary's pills sum to more than `omitted.count` (decision 0019 leg A).
    const anchored = !render[i] && anchorRows && signedByWallet(d);
    const elided = !render[i] && !anchored;
    if (render[i] && r.cutState === undefined && r.omitted > 0) {
      const out: BoundaryStateLine[] = [];
      if (r.coll > ZERO && collSym)
        out.push({ label: `${collSym} collateral`, value: String(scaleRaw(r.coll, collDec)), unit: collSym });
      if (r.borr > ZERO)
        out.push({ label: `${loanSym} debt`, value: String(scaleRaw(r.borr, loanDec)), unit: loanSym });
      if (r.sup > ZERO)
        out.push({ label: `${loanSym} supplied`, value: String(scaleRaw(r.sup, loanDec)), unit: loanSym });
      r.cutState = out.length > 0 ? out : null;
    }
    if (elided) r.cutTypes.set(d.kind, (r.cutTypes.get(d.kind) ?? 0) + 1);
    r.n++;
    if (d.kind !== "liquidation") r.txs.add(d.txHash);

    // Signed deltas, the MV's exact lines.
    let coll = ZERO;
    let borr = ZERO;
    let bsh = ZERO;
    let sup = ZERO;
    let ssh = ZERO;
    switch (d.kind) {
      case "supply_collateral":
        coll = d.collateral;
        r.lifetime.deposited += scaleRaw(d.collateral, collDec);
        break;
      case "withdraw_collateral":
        coll = -d.collateral;
        r.lifetime.collateralWithdrawn += scaleRaw(d.collateral, collDec);
        break;
      case "borrow":
        borr = d.assets;
        bsh = d.shares;
        r.lifetime.borrowed += scaleRaw(d.assets, loanDec);
        break;
      case "repay":
        borr = -d.assets;
        bsh = -d.shares;
        r.lifetime.repaid += scaleRaw(d.assets, loanDec);
        break;
      case "supply":
        sup = d.assets;
        ssh = d.shares;
        r.lifetime.supplied += scaleRaw(d.assets, loanDec);
        break;
      case "withdraw":
        sup = -d.assets;
        ssh = -d.shares;
        r.lifetime.withdrawn += scaleRaw(d.assets, loanDec);
        break;
      case "liquidation":
        coll = -d.collateral;
        borr = -d.assets;
        bsh = -d.shares;
        r.liq++;
        r.badDebt += d.badDebtAssets ?? ZERO;
        r.lifetime.collateralLiquidated += scaleRaw(d.collateral, collDec);
        break;
    }
    r.coll += coll;
    if (r.coll < ZERO) r.coll = ZERO; // the MV clamps collateral, and only collateral
    r.borr += borr;
    r.bsh += bsh;
    r.sup += sup;
    r.ssh += ssh;
    if (r.coll > r.peakColl) r.peakColl = r.coll;
    if (r.borr > r.peakBorr) r.peakBorr = r.borr;

    // Every row advances the replay; rows past the position's cutoff are
    // rendered, and so is every older row the wallet signed itself (the
    // anchor) — but only those whose block could actually be dated.
    if (elided) {
      r.omitted++;
      r.omittedUpTo = d.blockNumber;
      return;
    }
    const ts = tsOf.get(d.blockNumber);
    if (ts == null) {
      r.undated++;
      return;
    }
    if (anchored) r.anchoredDrawn++;

    const isCollateral = d.kind === "supply_collateral" || d.kind === "withdraw_collateral";
    const isLiq = d.kind === "liquidation";
    const isLender = d.kind === "supply" || d.kind === "withdraw";
    const side: "loan" | "collateral" = isCollateral || isLiq ? "collateral" : "loan";
    const assetsRaw = side === "collateral" ? coll : isLender ? sup : borr;
    const assetsDec = side === "collateral" ? collDec : loanDec;
    const shareDelta = bsh !== ZERO ? bsh.toString() : undefined;

    // The acting parties, present only where the owner is NEITHER the signer
    // nor the caller — the index route's exact predicate. An unresolved
    // sender leaves the pair incomplete and the row unmarked.
    const txFrom = fromOf.get(d.txHash);
    const external = !isLiq && txFrom != null && d.caller != null && txFrom !== wallet && d.caller !== wallet;

    const price = isLiq ? priceOf.get(`${m?.oracle ?? ZERO_ADDR}:${d.blockNumber}`) : undefined;
    const oraclePriceAtBlock =
      price != null && price > ZERO
        ? (() => {
            const human = (Number(price) * Math.pow(10, collDec - loanDec)) / 1e36;
            return Number.isFinite(human) && human > 0
              ? { loanPerCollateral: human, source: "morpho-oracle" as const }
              : undefined;
          })()
        : undefined;

    const ctx: MorphoContext = {
      eventType: d.kind,
      marketId: d.marketId,
      loanSymbol: loanSym,
      collateralSymbol: collSym ?? "—",
      side,
      assetsDelta: fmtUnits(assetsRaw, assetsDec),
      sharesDelta: shareDelta,
      collateralAfter: fmtUnits(r.coll, collDec),
      borrowedAfter: fmtUnits(r.borr, loanDec),
      isOpen,
      ...(isLender ? { suppliedAfter: fmtUnits(r.sup, loanDec) } : {}),
      ...(external ? { txFrom, caller: d.caller } : {}),
      ...(isLiq ? { loanRepaid: fmtUnits(d.assets, loanDec), oraclePriceAtBlock } : {}),
    };

    const flows: AssetFlow[] = [];
    if (coll !== ZERO && collSym) {
      const mag = coll < ZERO ? -coll : coll;
      flows.push({
        token: m?.collateral?.address ?? "",
        tokenSymbol: collSym,
        tokenDecimals: collDec,
        amount: mag.toString(),
        amountFormatted: Number(fmtUnits(mag, collDec)),
        direction: coll > ZERO ? "in" : "out",
      });
    }
    const loanMove = isLender ? sup : borr;
    if (loanMove !== ZERO) {
      const mag = loanMove < ZERO ? -loanMove : loanMove;
      flows.push({
        token: m?.loan.address ?? "",
        tokenSymbol: loanSym,
        tokenDecimals: loanDec,
        amount: mag.toString(),
        amountFormatted: Number(fmtUnits(mag, loanDec)),
        // A borrow leaves the protocol toward the wallet; a supply goes the
        // other way — the same convention the index builder uses.
        direction: isLender ? (loanMove > ZERO ? "in" : "out") : loanMove > ZERO ? "out" : "in",
      });
    }

    r.events.push({
      id: `${d.txHash}:${d.logIndex}`,
      txHash: d.txHash,
      blockNumber: d.blockNumber,
      timestamp: ts,
      wallet,
      actionType: d.kind,
      actionLabel: MORPHO_EVENT_LABEL[d.kind],
      flows,
      etherscanUrl: explorerUrl(chainId, "tx-logs", d.txHash),
      context: { protocol: "morpho", data: ctx },
    });
  });

  const positions: MorphoSweptPosition[] = [];
  for (const [id, r] of run) {
    const m = markets.get(id);
    const loanDec = m?.loan.decimals ?? 18;
    const collDec = m?.collateral?.decimals ?? 18;
    const loanSym = m?.loan.symbol ?? "?";
    const collSym = m?.collateral?.symbol ?? null;
    const first = firstRowOf.get(id);
    const last = lastRowOf.get(id);
    const seed = seedOf.get(id);
    positions.push({
      marketId: id,
      marketLabel: marketLabel(loanSym, collSym ?? "—", m?.isIdle ?? collSym == null),
      loanToken: m?.loan.address ?? ZERO_ADDR,
      loanSymbol: loanSym,
      loanDecimals: loanDec,
      collateralToken: m?.collateral?.address ?? ZERO_ADDR,
      collateralSymbol: collSym,
      collateralDecimals: collDec,
      isIdle: m?.isIdle ?? collSym == null,
      lltv: m?.lltv ?? 0,
      collateral: scaleRaw(r.coll, collDec),
      collateralRaw: r.coll.toString(),
      borrowed: scaleRaw(r.borr, loanDec),
      borrowSharesRaw: r.bsh.toString(),
      supplySharesRaw: r.ssh.toString(),
      supplied: scaleRaw(r.sup, loanDec),
      peakCollateral: scaleRaw(r.peakColl, collDec),
      peakBorrowed: scaleRaw(r.peakBorr, loanDec),
      everLiquidated: r.liq > 0,
      liquidationCount: r.liq,
      badDebt: scaleRaw(r.badDebt, loanDec),
      eventCount: r.n,
      txCount: r.seededTxs + r.txs.size,
      // The position's own first and last event. A seed carries both from
      // before the cut, and the tail can only push the last one forward.
      firstBlock: seed?.firstBlock ?? first?.blockNumber ?? 0,
      lastBlock: last?.blockNumber ?? seed?.lastBlock ?? 0,
      lastTs: last ? (tsOf.get(last.blockNumber) ?? null) : (seed?.lastTimestamp ?? null),
      firstEventAt: seed ? seed.firstTimestamp : first ? (tsOf.get(first.blockNumber) ?? null) : null,
      lifetime: r.lifetime,
      events: r.events,
      ...(r.omitted > 0
        ? {
            omitted: {
              count: r.omitted,
              upToBlock: r.omittedUpTo,
              // Present even at 0 and even beside this position's seed —
              // the anchor stays on over the tail; the flag says whether the
              // count is the whole set, and it is not behind a seed, whose
              // rows were not here to anchor.
              ...(anchorRows ? { anchored: r.anchoredDrawn, anchoredComplete: seed == null } : {}),
              summary: {
                // Withheld where this position anchored rows from below its
                // cut: its drawn list is then not contiguous with the cut.
                stateAtCut: r.anchoredDrawn > 0 ? null : (r.cutState ?? null),
                byType: seed ? null : bucketsOf(r.cutTypes),
                byAsset: null,
                firstAt: seed ? seed.firstTimestamp : first ? (tsOf.get(first.blockNumber) ?? null) : null,
                lastAt:
                  tsOf.get(r.omittedUpTo) ?? (seed && r.omittedUpTo === seed.lastBlock ? seed.lastTimestamp : null),
              } satisfies TimelineCutSummary,
            },
          }
        : {}),
      ...(r.undated > 0 ? { undated: r.undated } : {}),
      ...(r.peaksPartial ? { peaksPartial: true } : {}),
    });
  }
  positions.sort((a, b) => b.lastBlock - a.lastBlock);

  // The wallet-wide omission is the positions' own, summed: every seeded row
  // (replayed into its seed, not sent) plus every elided one, up to the newest
  // elided block anywhere. An anchored row is drawn, so it is in neither.
  let omittedTotal = 0;
  let omittedUpTo = 0;
  let anchoredTotal = 0;
  for (const r of run.values()) {
    omittedTotal += r.omitted;
    if (r.omittedUpTo > omittedUpTo) omittedUpTo = r.omittedUpTo;
    anchoredTotal += r.anchoredDrawn;
  }

  // The wallet's first event: with seeds it sits before the cut, so it is the
  // earliest seeded market's own first timestamp.
  const seedFirstAt = p.seeds?.length ? Math.min(...p.seeds.map((s) => s.firstTimestamp)) : null;
  return {
    wallet,
    positions,
    totalEvents: seedEvents + rows.length,
    coverage: {
      ...p.coverage,
      firstEventAt: seedFirstAt ?? (rows.length > 0 ? (tsOf.get(rows[0].blockNumber) ?? null) : null),
      // `anchored` rides whenever the anchor is on — even at 0, and even
      // beside seeds: the positions' anchored rows, summed. Whether that is
      // the WHOLE set of wallet-signed rows below the cuts — the guarantee
      // "everything the wallet signed is drawn" — is `anchoredComplete`:
      // false beside any seed, whose rows were replayed into it and never
      // here to anchor (lib/api/fetch-chain-timeline.ts states both).
      ...(omittedTotal > 0
        ? {
            omitted: {
              count: omittedTotal,
              upToBlock: omittedUpTo,
              ...(anchorRows ? { anchored: anchoredTotal, anchoredComplete: seedOf.size === 0 } : {}),
            },
          }
        : {}),
    },
  };
}
