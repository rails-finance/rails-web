// A wallet's WHOLE LIFE on an Aave V3 Pool, read from the chain's own logs.
// ----------------------------------------------------------------------------
// The Ethereum explorer gets this from an index: rails-server captures the Pool
// events and `mv_aave_v3_events` replays the per-reserve running balances, and
// the web route only does presentation. On Base there is no index, so this
// module is BOTH halves — the capture (a chunked sweep, lib/sources/chain/
// log-sweep) and the replay — emitting the exact same `AaveV3Context` the MV
// route emits, so the timeline card, its detail grid, its explainer and the
// economics tower are the Ethereum ones, reused unchanged rather than forked.
//
// Where the two must agree, they agree deliberately:
//
//   • The running balances are a PRINCIPAL replay — the running sum of the
//     amounts the logs emitted, floored at zero. That is exactly what mig 160's
//     `SUM(delta) OVER (…)` / `GREATEST(…, 0)` computes, down to the floor. It
//     is not the aToken's rebased balance: interest accrues with no log to
//     replay, so the sum drifts below `balanceOf` by exactly the interest. The
//     economics tower is built on that difference (it is where its principal /
//     accrued-interest split comes from), which only works if this side means
//     principal and says so.
//   • `poolCaller` is the event's own party param, and is absent on withdraw
//     and liquidation because those events do not carry one — the same NULLs
//     the MV has, so the card's third-party verdict reads identically.
//
// Three things the L1 lane has and this one does not, each absent rather than
// approximated:
//   • Per-event historic USD. Pricing an event needs the oracle read AT its
//     block; mig 092 walks that on L1 and nothing walks it on Base. So no
//     `price` is set and the cards render token amounts only.
//   • Genesis certainty for a transfer-fed balance. An aToken that arrived by
//     transfer is captured (BalanceTransfer, below) but its own history before
//     this wallet is not — the same boundary the L1 lane has.
//   • A guarantee that the sweep completed. It can fail; `coverage.gaps` says
//     where, and the page states it. See log-sweep.
//
// LiquidationCall deserves its own line, because getting it wrong is silent:
// the event indexes (collateralAsset, debtAsset, user), so the position owner
// is in TOPIC 3, where every other Pool event puts them in topic 2. A sweep
// that filters topic2 for the wallet returns a complete-looking history with
// every liquidation missing from it.
//
// SERVER-ONLY.

import type { TimelineFillState } from "@/lib/api/fetch-chain-timeline";
import { decodeEventLog, encodeEventTopics, parseAbi } from "viem";
import { chainBatchClient, chainLogsClient } from "./rpc";
import { resolveBlockTimestamps, resolveTxSenders } from "./sweep-metadata";
import { addressTopic, splitCoverage, sweepLogs, type BlockRange, type RawLog } from "./log-sweep";
import { resolveV3Tokens, scaleV3, flowV3, type V3TokenMeta } from "./aave-v3-tokens";
import { bucketsOf, type BoundaryStateLine, type TimelineCutSummary } from "@/lib/shared/timeline-boundary";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { AssetFlow, BaseActivityEvent, OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { AaveV3Context, AaveV3EventType, AaveV3PriceSource } from "@/lib/shared/types/protocols/aave-v3";

const POOL_EVENTS_ABI = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
]);

const ATOKEN_EVENTS_ABI = parseAbi([
  "event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index)",
]);

const POOL_ABI = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);

// Topic-0 of each event, DERIVED from the ABIs above at module load rather
// than pasted as literals — a signature edit can then never leave a stale hash
// silently filtering for an event that no longer exists.
const topic0 = (abi: typeof POOL_EVENTS_ABI | typeof ATOKEN_EVENTS_ABI, eventName: string): string =>
  encodeEventTopics({ abi, eventName } as never)[0] as string;

const TOPIC0 = {
  Supply: topic0(POOL_EVENTS_ABI, "Supply"),
  Withdraw: topic0(POOL_EVENTS_ABI, "Withdraw"),
  Borrow: topic0(POOL_EVENTS_ABI, "Borrow"),
  Repay: topic0(POOL_EVENTS_ABI, "Repay"),
  LiquidationCall: topic0(POOL_EVENTS_ABI, "LiquidationCall"),
  BalanceTransfer: topic0(ATOKEN_EVENTS_ABI, "BalanceTransfer"),
} as const;

const LABELS: Record<AaveV3EventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
  swap: "Swap",
  // Never produced here: the sweep reads the Pool topics above and
  // DeficitCreated is not among them. Named so the roster stays total.
  bad_debt_written_off: "Debt written off",
};

/** V3 Pool event emitting each action's `amount` param — the origin envelope's
 *  `event` field, so a receipt names the log a reader can go and check. */
const AMOUNT_EVENT: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};

const ZERO = BigInt(0);
const RAY = BigInt("1000000000000000000000000000");

/** What the sweep could and could not see. Rendered under the timeline: a
 *  reader is entitled to know where the history they are looking at begins and
 *  whether anything is missing from the middle of it. */
export interface ChainTimelineCoverage {
  /** First block swept — for a whole-life read, the Pool's own first block. */
  fromBlock: number;
  /** Last block swept (the chain head at read time). */
  toBlock: number;
  /** True when `fromBlock` IS the Pool's deployment block, so nothing on this
   *  Pool predates the sweep. False when the sweep ran out of time before
   *  reaching the beginning, in which case `fromBlock` is where it stopped and
   *  everything before it is simply unread — a horizon, not a hole. */
  fromDeployment: boolean;
  /** The Pool's own first block, so a page can say how far short of it a
   *  horizon fell. */
  deployBlock: number;
  /** Ranges INSIDE the swept span that would not answer, merged. Empty ⇒ the
   *  sweep read every block between `fromBlock` and `toBlock`. Distinct from a
   *  horizon: a hole leaves the replayed balances after it short by whatever it
   *  hid, where a horizon only means the history starts later than the Pool. */
  gaps: BlockRange[];
  /** Unix seconds of the oldest event SHOWN; null when there are none. */
  firstEventAt: number | null;
  /** Set when the event list was truncated: how many older events the replay
   *  accounted for but the list does not draw, and the block the drawn ones
   *  start at. The running balances are still correct — the replay runs over
   *  every event, and only the rendering is capped. */
  omitted?: { count: number; upToBlock: number; summary?: TimelineCutSummary };
  /** Events left off the list because their block's timestamp could not be
   *  read. An undated event cannot be placed on a timeline at all, and the one
   *  thing that must not happen is filling the blank with zero — see
   *  resolveBlockTimestamps. The replay and the lifetime totals still include
   *  them; only the drawing does not. Absent when none. */
  undated?: number;
  /** Where the rows came from: a live sweep of the chain's logs, or the
   *  rails-server index (the Base box's capture, read through the API). The
   *  footer's sentence and the receipts' custody line both turn on it. */
  source?: "sweep" | "index";
  /** The lane's oracle-at-block walk, index answers only (lib/api/fetch-chain-
   *  timeline.ts `TimelineFillState`). */
  fill?: TimelineFillState;
}

/** Per-reserve lifetime gross flows over the WHOLE swept history — the shape
 *  the economics tower's lifetime layer takes (lib/aave-v3/chain-truth-tower
 *  `ReserveFlows`).
 *
 *  Computed here rather than in the browser because the browser only has the
 *  rendered slice. A wallet with 13,000 Pool events shows the most recent 500,
 *  and reducing those into a bar labelled "Deposited (all time)" would state a
 *  recent window as a lifetime. Same rules as the client-side reducer: Pool
 *  flows only — aToken transfers move custody without a Pool flow, so they are
 *  neither a deposit nor a withdrawal and a transfer-fed reserve fails the
 *  tower's conservation gates rather than being guessed at. */
export interface ChainLifetimeFlows {
  symbol: string;
  address?: string;
  decimals?: number;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedCollateral: number;
  liquidatedDebt: number;
  /** Debt the Pool burned as bad debt (DeficitCreated). Always 0 from this
   *  sweep, which does not read that topic: a stated zero, not a claim that
   *  none happened. The Ethereum index lane carries the real figure. */
  writtenOff: number;
  /** The highest running PRINCIPAL the replay recorded on each axis — the
   *  closed card's "highest recorded" figures. Principal because the replay
   *  sums emitted amounts; the interest that accrued between events is not
   *  in it, so the true maximum of the rebased balance sat at or above this. */
  peakSupplied?: number;
  peakSuppliedRaw?: string;
  peakBorrowed?: number;
  peakBorrowedRaw?: string;
}

/** The six lifetime lanes in RAW token units — what the replay accumulates,
 *  as bigints, before anything is scaled. */
export interface AaveV3LifetimeRaw {
  supplied: bigint;
  withdrawn: bigint;
  borrowed: bigint;
  repaid: bigint;
  liquidatedCollateral: bigint;
  liquidatedDebt: bigint;
}

const LIFETIME_LANES = [
  "supplied",
  "withdrawn",
  "borrowed",
  "repaid",
  "liquidatedCollateral",
  "liquidatedDebt",
] as const satisfies readonly (keyof AaveV3LifetimeRaw)[];

/** One reserve's lifetime flows, raw and exact, as decimal strings — keyed by
 *  the reserve's ADDRESS, where `ChainLifetimeFlows` above is keyed by symbol
 *  and scaled. A seed at a cut carries this shape per reserve
 *  (AaveV3ReplaySeed) and the tail's walk adds to it; `lifetime` is these
 *  merged by symbol and scaled once. */
export interface AaveV3ReserveLifetimeRaw {
  /** Lowercase underlying address. */
  reserve: string;
  /** From the reserve's metadata when the replay had it; absent otherwise
   *  (the reserve then has no `ChainLifetimeFlows` entry either). */
  symbol?: string;
  decimals?: number;
  supplied: string;
  withdrawn: string;
  borrowed: string;
  repaid: string;
  liquidatedCollateral: string;
  liquidatedDebt: string;
}

export interface AaveV3ChainTimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Lifetime sums over every row, not just the rendered ones — per symbol,
   *  scaled ONCE at the edge from the raw sums below. */
  lifetime: ChainLifetimeFlows[];
  /** The same sums before scaling, per reserve address, exact. */
  lifetimeRaw: AaveV3ReserveLifetimeRaw[];
  /** Distinct transactions over every row that were the wallet's own — a
   *  liquidation is the liquidator's transaction, so it is not counted. */
  txCount: number;
  /** Liquidation rows over every row the replay walked — the whole life, or
   *  the tail behind a seed. Aave's seed grammar carries what a liquidation
   *  seized (`lifetime.liquidatedDebt`), not how many there were, so on a
   *  seeded wallet this is the tail's count and `lifetime` says whether any
   *  sat before the cut. */
  liquidationCount: number;
  /** Unix seconds of the newest row, when its block could be dated. */
  lastActivityAt: number | null;
  coverage: ChainTimelineCoverage;
}

/** One event the replay takes — what a decoded log reduces to, whichever
 *  store it came from (the sweep decodes it from the raw log; the index route
 *  hands it over already decoded). */
export interface AaveV3DecodedRow {
  blockNumber: number;
  txIndex: number;
  logIndex: number;
  txHash: string;
  kind: AaveV3EventType;
  /** Primary reserve — the debt asset on a liquidation. */
  reserve: string;
  amount: bigint;
  collateralAsset?: string;
  liquidatedCollateralAmount?: bigint;
  liquidator?: string;
  poolCaller?: string;
  counterparty?: string;
  interestRateMode?: number;
  borrowRate?: string;
  useATokens?: boolean;
  /** The Pool's own oracle price at the event's block, where the store holds
   *  it (the index lanes' roster capture — rails-server mig 197). The sweep
   *  never sets these: it reads logs, not prices, and the cards stay
   *  token-only on a swept history. */
  price?: { usd: number; source: AaveV3PriceSource };
  collateralPrice?: { usd: number; source: AaveV3PriceSource };
  debtPrice?: { usd: number; source: AaveV3PriceSource };
  liquidationBonusAtBlock?: { bonusBps: number; protocolFeeBps: number };
}

/** Raw log → the fields the context needs, or null when the log is one this
 *  reader does not model. */
function decodePoolLog(log: RawLog, wallet: string): AaveV3DecodedRow | null {
  const base = {
    blockNumber: Number(log.blockNumber),
    txIndex: Number(log.transactionIndex),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash.toLowerCase(),
  };
  const topic0 = log.topics[0]?.toLowerCase();
  const dec = (): { eventName: string; args: Record<string, unknown> } =>
    decodeEventLog({
      abi: POOL_EVENTS_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    }) as { eventName: string; args: Record<string, unknown> };

  try {
    if (topic0 === TOPIC0.Supply) {
      const { args } = dec();
      return {
        ...base,
        kind: "supply",
        reserve: String(args.reserve).toLowerCase(),
        amount: args.amount as bigint,
        poolCaller: String(args.user).toLowerCase(),
      };
    }
    if (topic0 === TOPIC0.Withdraw) {
      const { args } = dec();
      // No poolCaller: Withdraw carries no msg.sender param (`to` is a
      // destination, not an actor) — the same NULL the MV has.
      return { ...base, kind: "withdraw", reserve: String(args.reserve).toLowerCase(), amount: args.amount as bigint };
    }
    if (topic0 === TOPIC0.Borrow) {
      const { args } = dec();
      return {
        ...base,
        kind: "borrow",
        reserve: String(args.reserve).toLowerCase(),
        amount: args.amount as bigint,
        poolCaller: String(args.user).toLowerCase(),
        interestRateMode: Number(args.interestRateMode),
        borrowRate: String(args.borrowRate),
      };
    }
    if (topic0 === TOPIC0.Repay) {
      const { args } = dec();
      return {
        ...base,
        kind: "repay",
        reserve: String(args.reserve).toLowerCase(),
        amount: args.amount as bigint,
        poolCaller: String(args.repayer).toLowerCase(),
        useATokens: Boolean(args.useATokens),
      };
    }
    if (topic0 === TOPIC0.LiquidationCall) {
      const { args } = dec();
      // The owner is topic3 on this event alone. Guard it: a sweep bug that
      // let someone else's liquidation through would attribute a seizure to a
      // wallet it never touched.
      if (String(args.user).toLowerCase() !== wallet) return null;
      return {
        ...base,
        kind: "liquidation",
        reserve: String(args.debtAsset).toLowerCase(),
        amount: args.debtToCover as bigint,
        collateralAsset: String(args.collateralAsset).toLowerCase(),
        liquidatedCollateralAmount: args.liquidatedCollateralAmount as bigint,
        liquidator: String(args.liquidator).toLowerCase(),
      };
    }
  } catch {
    // A log whose shape doesn't decode is not silently reshaped into an event.
  }
  return null;
}

/** aToken BalanceTransfer → a custody move on the supply axis.
 *
 *  The emitted `value` is the SCALED balance (the aToken divides by the
 *  liquidity index before emitting), so the underlying amount this moved is
 *  `value × index ÷ 1e27` — derived, not a raw log param, which is why these
 *  events carry no origin envelope. */
function decodeTransferLog(log: RawLog, wallet: string, underlying: string): AaveV3DecodedRow | null {
  try {
    const { args } = decodeEventLog({
      abi: ATOKEN_EVENTS_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    }) as { args: { from: string; to: string; value: bigint; index: bigint } };
    const from = args.from.toLowerCase();
    const to = args.to.toLowerCase();
    if (from === to) return null;
    if (from !== wallet && to !== wallet) return null;
    return {
      blockNumber: Number(log.blockNumber),
      txIndex: Number(log.transactionIndex),
      logIndex: Number(log.logIndex),
      txHash: log.transactionHash.toLowerCase(),
      kind: from === wallet ? "transfer_out" : "transfer_in",
      reserve: underlying,
      amount: (args.value * args.index) / RAY,
      counterparty: from === wallet ? to : from,
    };
  } catch {
    return null;
  }
}

// ── Per-event metadata ──────────────────────────────────────────────────────
// Timestamps and senders come from lib/sources/chain/sweep-metadata, paced at
// the rate the endpoints serve (the measurements that set the pace live there).
// Every swept reader on Base shares that one copy.

export interface LoadAaveV3ChainEventsParams {
  wallet: string;
  /** The market's Pool. */
  pool: string;
  chainId: ChainId;
  /** The Pool's own deployment block — the floor of a whole-life sweep. */
  deployBlock: number;
  /** The server's plumbing flag for this wallet, as the index answer carried
   *  it before it fell back here; the replay then states no peak (see
   *  AaveV3ReplayInput). */
  peakWithheld?: boolean;
}

/**
 * Read every Pool event this wallet is a party to, from the Pool's first block
 * to the chain head, and replay them into the shared timeline shape.
 */
export async function loadAaveV3EventsFromChain(p: LoadAaveV3ChainEventsParams): Promise<AaveV3ChainTimelineResult> {
  const wallet = p.wallet.toLowerCase();
  const pool = p.pool.toLowerCase();
  const logsClient = chainLogsClient(p.chainId);
  // Per-event metadata goes to the STATE endpoint. It was tried on the history
  // gateway — the natural home for a history read — and that gateway throttles
  // an address hard after a sweep has just run through it: 150 of 150 blocks
  // refused, for two and a half minutes of backoff. The metered provider takes
  // pacing; the free gateway does not.
  const stateClient = chainBatchClient(p.chainId);

  const head = Number(await stateClient.getBlockNumber());
  const range: BlockRange = { from: p.deployBlock, to: head };
  const walletTopic = addressTopic(wallet);

  // The Pool's reserves, and each one's aToken — the aToken set is what turns a
  // BalanceTransfer sweep (which matches every aToken on the chain) into THIS
  // market's custody moves.
  const reserves = (await stateClient.readContract({
    address: pool as `0x${string}`,
    abi: POOL_ABI,
    functionName: "getReservesList",
  })) as readonly string[];
  const reserveData = (await stateClient.multicall({
    allowFailure: true,
    contracts: reserves.map(
      (a) => ({ address: pool as `0x${string}`, abi: POOL_ABI, functionName: "getReserveData", args: [a] }) as const,
    ),
  })) as { status: string; result?: { aTokenAddress: string } }[];
  const underlyingOfAToken = new Map<string, string>();
  reserves.forEach((asset, i) => {
    const r = reserveData[i];
    if (r?.status === "success" && r.result?.aTokenAddress) {
      underlyingOfAToken.set(r.result.aTokenAddress.toLowerCase(), asset.toLowerCase());
    }
  });

  // Four sweeps, run together:
  //   1. the four Pool events that put the owner in topic2, as ONE query
  //      (topic0 is an OR list);
  //   2. LiquidationCall, whose owner is in topic3 — a separate query because
  //      no filter can OR across topic POSITIONS;
  //   3/4. aToken transfers out of and into the wallet. Deliberately NOT
  //      address-filtered: on Base a 15-address filter took 16.5s where the
  //      same sweep with no address filter took 5.5s for identical results, so
  //      the emitter is filtered here instead.
  const [poolSweep, liqSweep, outSweep, inSweep] = await Promise.all([
    sweepLogs(
      logsClient,
      { address: pool, topics: [[TOPIC0.Supply, TOPIC0.Withdraw, TOPIC0.Borrow, TOPIC0.Repay], null, walletTopic] },
      range,
    ),
    sweepLogs(logsClient, { address: pool, topics: [TOPIC0.LiquidationCall, null, null, walletTopic] }, range),
    sweepLogs(logsClient, { topics: [TOPIC0.BalanceTransfer, walletTopic] }, range),
    sweepLogs(logsClient, { topics: [TOPIC0.BalanceTransfer, null, walletTopic] }, range),
  ]);

  const decoded: AaveV3DecodedRow[] = [];
  for (const log of [...poolSweep.logs, ...liqSweep.logs]) {
    const d = decodePoolLog(log, wallet);
    if (d) decoded.push(d);
  }
  for (const log of [...outSweep.logs, ...inSweep.logs]) {
    const underlying = underlyingOfAToken.get(log.address.toLowerCase());
    if (!underlying) continue; // some other market's aToken, or a delisted one
    const d = decodeTransferLog(log, wallet, underlying);
    if (d) decoded.push(d);
  }

  decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // De-duplicate: the two transfer sweeps can both return a self-transfer, and
  // a chunk that was retried after a partial failure can repeat a log.
  const seen = new Set<string>();
  const rows = decoded.filter((d) => {
    const k = `${d.txHash}-${d.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Where the history actually starts, and what is missing from inside it.
  // A stretch unread at the FLOOR is a horizon (the sweep ran out of time
  // before reaching the Pool's first block, so the history simply starts
  // later); a stretch unread anywhere else is a hole. See splitCoverage.
  const { horizonTo, holes } = splitCoverage(
    [...poolSweep.gaps, ...liqSweep.gaps, ...outSweep.gaps, ...inSweep.gaps],
    range.from,
  );
  const floor = horizonTo != null ? horizonTo + 1 : range.from;

  // How many events get RENDERED. A wallet can be a strategy contract with tens
  // of thousands of Pool events (13,138 on one Seamless account), and drawing
  // them all costs a block timestamp and a transaction read per event — enough
  // of both to trip every endpoint's rate limit — plus a payload nobody
  // scrolls. The timeline shows 100 at a time and pages from there, so this is
  // two and a half pages.
  //
  // The number is set by the METADATA rate, not by the sweep: the free tier
  // sustains roughly twenty of these reads a second, so each 250 events costs
  // about fifteen seconds of paced requests. A provider without that cap could
  // raise this considerably; nothing else here would have to change. The replay below still runs over EVERY row, so the
  // running balances and the lifetime sums are complete — only the drawn list
  // is capped, and the coverage says by how much.
  const MAX_RENDERED_EVENTS = 250;
  const cutoff = Math.max(0, rows.length - MAX_RENDERED_EVENTS);
  const shown = rows.slice(cutoff);

  // Token metadata, block timestamps and tx senders — all batched. Metadata
  // covers every row (the replay needs it); timestamps and senders only the
  // rows that will be drawn.
  const addrs = new Set<string>();
  for (const d of rows) {
    addrs.add(d.reserve);
    if (d.collateralAsset) addrs.add(d.collateralAsset);
  }
  // The rendered rows' blocks, PLUS the very first row's — even when it is far
  // below the cutoff. The coverage line states when this position's history
  // actually begins, and taking that from the rendered slice would date the
  // start of a capped list as the start of the position.
  const blocks = [...new Set([...shown.map((d) => d.blockNumber), ...(rows.length > 0 ? [rows[0].blockNumber] : [])])];
  const [metas, timestamps, senders] = await Promise.all([
    resolveV3Tokens([...addrs], p.chainId),
    resolveBlockTimestamps(stateClient, blocks),
    resolveTxSenders(stateClient, [...new Set(shown.map((d) => d.txHash))]),
  ]);

  return replayAaveV3Rows({
    wallet,
    chainId: p.chainId,
    rows,
    metas,
    timestamps,
    senders,
    maxRendered: MAX_RENDERED_EVENTS,
    peakWithheld: p.peakWithheld ?? false,
    // The anchor is OFF on the sweep: it reads a sender only per DRAWN row,
    // and the sender is the one fact that says whether a row below the cut
    // anchors. Reading one for every elided row is the metadata cost the
    // 250-row cut above exists to avoid, so the sweep cuts by depth alone and
    // states no guarantee. The index reader carries every row's sender and
    // anchors (lib/sources/api/aave-v3-base-timeline.ts).
    anchorWalletRows: false,
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

// ── The replay, as its own step ─────────────────────────────────────────────
// Everything above this line is the CAPTURE (which logs, from where); this is
// the REPLAY, and it takes decoded rows from whichever store produced them.
// The chain sweep above calls it; so does lib/sources/api/aave-v3-base-timeline
// with rows the rails-server index hands over — same arithmetic, same context
// shape, same coverage grammar, so a page cannot tell the two apart except by
// the `source` the coverage names.

export interface AaveV3ReplayInput {
  /** Lowercased. */
  wallet: string;
  chainId: ChainId;
  /** Chain-ordered (block, tx, log) and de-duplicated. */
  rows: AaveV3DecodedRow[];
  /** Symbol/decimals for every reserve and collateral address the rows name. */
  metas: Map<string, V3TokenMeta>;
  /** Block → unix seconds, for at least the rows that will be drawn — the
   *  newest `maxRendered` and, with the anchor on, every wallet-signed row
   *  below that cut. A row whose block is absent here is replayed but not
   *  drawn (`undated`). */
  timestamps: Map<number, number>;
  /** Tx hash → sender, for the rows that will be drawn. With the anchor on it
   *  must cover EVERY row: the sender is the one fact that decides whether a
   *  row below the cut anchors, and a row whose sender is unknown here is
   *  elided as unsigned. */
  senders: Map<string, string>;
  /** How many of the NEWEST rows are drawn; the replay runs over all of them.
   *  Rows the wallet signed itself are ANCHORED — drawn however far below
   *  this cut they sit — so a stretch of keeper churn can never push the
   *  owner's own actions off the list (rails-ops
   *  reference/timeline-attention-budget.md, adjustment 1; ported from the
   *  Moonwell replay under decision 0019 leg F). */
  maxRendered: number;
  /** False turns the anchor OFF: the cut is a plain depth cut, every row below
   *  it is elided and neither `omitted.anchored` nor `omitted.anchoredComplete`
   *  rides. For a caller that does not hold the sender of every row — the
   *  sweep, which reads a sender per DRAWN row and would otherwise state a
   *  guarantee it cannot see. Default true, the Moonwell replay's own switch. */
  anchorWalletRows?: boolean;
  /** Set when the server flags this wallet as a router/relay or names it as
   *  protocol plumbing (rails-server migs 258, 227). Its history is round
   *  trips inside one transaction, so a running maximum over it pairs two
   *  unrelated mid-transaction swings into a balance it never held: the
   *  replay states no peak (rails-ops decision 0024). */
  peakWithheld?: boolean;
  /** A HEAVY wallet's elided history, as the state it left behind at a cut
   *  (see AaveV3ReplaySeed). Every per-reserve accumulator opens from it
   *  instead of from zero and `rows` is the tail at or after the cut. Absent
   *  — a sweep, or an index read that answered in full — the replay is
   *  exactly as it was. */
  seed?: AaveV3ReplaySeed;
  /** The span the rows are a complete record of; the replay adds what it
   *  learns (first event's date, what was omitted or undated). */
  coverage: Pick<
    ChainTimelineCoverage,
    "fromBlock" | "toBlock" | "fromDeployment" | "deployBlock" | "gaps" | "source" | "fill"
  >;
}

/** The replay's whole state at a block-boundary cut, raw and exact — what the
 *  API sends a heavy wallet beside its tail (rails-server
 *  api/src/services/baseTimelineSeeds.ts `aaveFullSeedSql`, payload v1),
 *  parsed to bigints. Per reserve: the clamped running principal on each
 *  axis after the last row before the cut (`b = S − least(0, min S)` over the
 *  ordered rows — the closed form of `bump`'s floor), the highest each
 *  reached (a max over that same walk), and the six lifetime lanes as plain
 *  raw sums. Per wallet: the row count, the DISTINCT own transactions
 *  (liquidations excluded, the replay's own predicate) and the first and
 *  last block and stamp. The one accumulator a seed cannot hand over is the
 *  own-transaction SET — it carries the set's size, and the tail's own set
 *  is counted beside it; the cut is a block boundary and a transaction never
 *  spans blocks, so the two never share a member. */
export interface AaveV3ReplaySeed {
  wallet: {
    /** Rows before the cut. 0 means the wallet had NO row before the cut:
     *  `reserves` is then empty and the block/stamp fields are 0, not facts. */
    events: number;
    txCount: number;
    firstBlock: number;
    firstTimestamp: number;
    lastBlock: number;
    lastTimestamp: number;
  };
  reserves: AaveV3ReplaySeedReserve[];
}

export interface AaveV3ReplaySeedReserve {
  /** Lowercase underlying address. */
  reserve: string;
  supply: bigint;
  debt: bigint;
  peakSupply: bigint;
  peakDebt: bigint;
  lifetime: AaveV3LifetimeRaw;
}

const newLifetimeRaw = (): AaveV3LifetimeRaw => ({
  supplied: ZERO,
  withdrawn: ZERO,
  borrowed: ZERO,
  repaid: ZERO,
  liquidatedCollateral: ZERO,
  liquidatedDebt: ZERO,
});

export function replayAaveV3Rows(p: AaveV3ReplayInput): AaveV3ChainTimelineResult {
  const { wallet, rows } = p;
  const cutoff = Math.max(0, rows.length - p.maxRendered);
  const anchorRows = p.anchorWalletRows !== false;
  const tsOf = p.timestamps;
  const fromOf = p.senders;
  // The signature fact that anchors a row through the render cut: the wallet
  // signed the transaction itself. Never the event KIND, and never the Pool's
  // `user` param — a liquidation names the liquidator, and a routed supply
  // names the gateway. The rule and its rationale: rails-ops
  // reference/timeline-attention-budget.md.
  const signedByWallet = (d: AaveV3DecodedRow): boolean => fromOf.get(d.txHash) === wallet;
  const meta = (a: string | undefined): V3TokenMeta | undefined => (a == null ? undefined : p.metas.get(a));

  // ── The replay ────────────────────────────────────────────────────────────
  // Per (reserve, axis) running sums of the emitted amounts, floored at zero —
  // the same arithmetic mig 160 does in SQL. Principal, not rebased balance.
  const supplyRaw = new Map<string, bigint>();
  const debtRaw = new Map<string, bigint>();
  const bump = (m: Map<string, bigint>, key: string, delta: bigint): { before: bigint; after: bigint } => {
    const before = m.get(key) ?? ZERO;
    const raw = before + delta;
    const after = raw < ZERO ? ZERO : raw;
    m.set(key, after);
    return { before, after };
  };

  const amt = (raw: bigint | undefined, m: V3TokenMeta | undefined): string | undefined =>
    raw == null || m == null ? undefined : String(scaleV3(raw, m.decimals));

  const originVal = (event: string, param: string, m: V3TokenMeta | undefined, raw: bigint | undefined) =>
    raw == null || m == null ? undefined : ({ event, param, raw: raw.toString(), scale: m.decimals } as OriginEnvelope);

  // Lifetime gross flows, accumulated over EVERY row as the replay walks them
  // — as BIGINTS in raw units, per reserve ADDRESS, so the total is the exact
  // sum and not a chain of roundings in row order. A seed can then carry it,
  // and a SQL sum over the same rows lands on the same integer. The
  // symbol-keyed, scaled shape the tower reads (`ChainLifetimeFlows`) is
  // built from these once, at the edge; until then it holds only the symbol,
  // the address, the decimals and the peaks.
  const rawFlows = new Map<string, AaveV3LifetimeRaw>();
  const rawFlowsOf = (reserve: string): AaveV3LifetimeRaw => {
    let cur = rawFlows.get(reserve);
    if (!cur) {
      cur = newLifetimeRaw();
      rawFlows.set(reserve, cur);
    }
    return cur;
  };
  const lifetime = new Map<string, ChainLifetimeFlows>();
  const flowsFor = (symbol: string | undefined, address: string | undefined): ChainLifetimeFlows | null => {
    if (!symbol) return null;
    let cur = lifetime.get(symbol);
    if (!cur) {
      cur = {
        symbol,
        supplied: 0,
        withdrawn: 0,
        borrowed: 0,
        repaid: 0,
        liquidatedCollateral: 0,
        liquidatedDebt: 0,
        writtenOff: 0,
      };
      lifetime.set(symbol, cur);
    }
    if (address && !cur.address) cur.address = address;
    return cur;
  };
  // The highest running principal on each axis — noted after every bump, so a
  // closed account's card can say what it held at its height. Same replay,
  // same rows; only the maximum is kept beside the sums. Keyed by SYMBOL: two
  // reserves sharing one take the higher of the two.
  const notePeak = (side: "supply" | "debt", m: V3TokenMeta | undefined, after: bigint): void => {
    const f = flowsFor(m?.symbol, m?.address);
    if (!f || !m) return;
    if (f.decimals == null) f.decimals = m.decimals;
    if (p.peakWithheld) return;
    const cur = side === "supply" ? f.peakSuppliedRaw : f.peakBorrowedRaw;
    if (cur != null && BigInt(cur) >= after) return;
    if (side === "supply") {
      f.peakSuppliedRaw = after.toString();
      f.peakSupplied = scaleV3(after, m.decimals);
    } else {
      f.peakBorrowedRaw = after.toString();
      f.peakBorrowed = scaleV3(after, m.decimals);
    }
  };
  // The wallet's own transactions over EVERY row: a liquidation is the
  // liquidator's transaction, not the position owner's. A seeded wallet's
  // count is this set's size plus the seed's — the cut is a block boundary,
  // so no member of the seed's set can reappear here.
  const ownTxs = new Set<string>();
  let liquidationCount = 0;

  // A seeded wallet opens with the state the elided rows left, BEFORE the
  // walk — so a reserve whose whole history sits before the cut still has
  // its balance, its peaks and its flows, and every accumulator the tail
  // advances starts where the whole list's walk would have it at the cut.
  // Nothing downstream knows the difference. A seeded peak of zero is not
  // noted: the walk itself notes a zero only for an axis a row touched, which
  // the seed cannot tell apart from one it never did, and no reader draws a
  // zero peak either way.
  const seed = p.seed;
  const seedEvents = seed?.wallet.events ?? 0;
  const seededTxs = seed?.wallet.txCount ?? 0;
  for (const r of seed?.reserves ?? []) {
    const m = meta(r.reserve);
    supplyRaw.set(r.reserve, r.supply < ZERO ? ZERO : r.supply);
    debtRaw.set(r.reserve, r.debt < ZERO ? ZERO : r.debt);
    const lt = rawFlowsOf(r.reserve);
    for (const lane of LIFETIME_LANES) lt[lane] = r.lifetime[lane];
    if (m) {
      const f = flowsFor(m.symbol, m.address);
      if (f && f.decimals == null) f.decimals = m.decimals;
      if (r.peakSupply > ZERO) notePeak("supply", m, r.peakSupply);
      if (r.peakDebt > ZERO) notePeak("debt", m, r.peakDebt);
    }
  }

  // ── The cut, for the boundary card (rails-ops decision 0019) ─────────────
  // The position AFTER the newest elided row — read once, the moment the walk
  // reaches the first drawn row and before that row moves anything — and the
  // elided rows counted by kind and by symbol as they pass. With a seed the
  // seed's rows are elided too and carry no breakdown, so the histograms are
  // withheld rather than stated short; the state still holds, because the
  // seed IS the state at its own cut and the walk advances from it.
  const cutTypes = new Map<string, number>();
  const cutAssets = new Map<string, number>();
  let cutState: BoundaryStateLine[] | null | undefined;
  const snapshotAtCut = (): BoundaryStateLine[] | null => {
    const out: BoundaryStateLine[] = [];
    for (const [reserve, v] of supplyRaw) {
      const m = meta(reserve);
      if (v > ZERO && m)
        out.push({ label: `${m.symbol} supply`, value: String(scaleV3(v, m.decimals)), unit: m.symbol });
    }
    for (const [reserve, v] of debtRaw) {
      const m = meta(reserve);
      if (v > ZERO && m) out.push({ label: `${m.symbol} debt`, value: String(scaleV3(v, m.decimals)), unit: m.symbol });
    }
    return out.length > 0 ? out : null;
  };

  const events: BaseActivityEvent[] = [];
  let undated = 0;
  // The render cut's ledger. Below the cut, a wallet-signed row is anchored
  // (drawn anyway, counted in `anchoredDrawn`); an unsigned one is elided
  // (counted in `elided`, its block noted — rows arrive ascending, so the
  // last note is the newest elided block, which is what the disclosure names).
  let anchoredDrawn = 0;
  let elided = 0;
  let elidedUpToBlock = 0;
  rows.forEach((d, i) => {
    if (i === cutoff && cutState === undefined) cutState = snapshotAtCut();
    // The anchor decision first, because only an ELIDED row belongs in the
    // histograms: a row counted here AND drawn would make the boundary's pills
    // sum to more than `omitted.count` (decision 0019 leg A).
    const anchored = i < cutoff && anchorRows && signedByWallet(d);
    if (i < cutoff && !anchored) {
      elided++;
      elidedUpToBlock = d.blockNumber;
      cutTypes.set(d.kind, (cutTypes.get(d.kind) ?? 0) + 1);
      const sym = meta(d.reserve)?.symbol ?? "?";
      cutAssets.set(sym, (cutAssets.get(sym) ?? 0) + 1);
      if (d.kind === "liquidation" && d.collateralAsset) {
        const cs = meta(d.collateralAsset)?.symbol ?? "?";
        if (cs !== sym) cutAssets.set(cs, (cutAssets.get(cs) ?? 0) + 1);
      }
    }
    if (d.kind !== "liquidation") ownTxs.add(d.txHash);
    else liquidationCount++;
    // Every row advances the replay; rows past the cutoff are rendered, and
    // so is every older row the wallet signed itself (the anchor) — but only
    // those whose block could actually be dated. An event with no timestamp
    // has no place on a timeline, and inventing one is the failure this whole
    // module is written against.
    const drawn = i >= cutoff || anchored;
    const render = drawn && tsOf.has(d.blockNumber);
    if (drawn && !tsOf.has(d.blockNumber)) undated++;
    if (render && anchored) anchoredDrawn++;
    const rMeta = meta(d.reserve);
    const base = {
      id: `${d.txHash}-${d.logIndex}`,
      txHash: d.txHash,
      blockNumber: d.blockNumber,
      // Never absent on a RENDERED row — `render` requires the timestamp to
      // exist. Rows that are not rendered build this object and discard it, so
      // their zero never reaches a page.
      timestamp: tsOf.get(d.blockNumber) ?? 0,
      wallet,
      etherscanUrl: explorerUrl(p.chainId, "tx-logs", d.txHash),
    };

    if (d.kind === "liquidation") {
      const collMeta = meta(d.collateralAsset);
      const coll = bump(supplyRaw, d.collateralAsset ?? "", -(d.liquidatedCollateralAmount ?? ZERO));
      const debt = bump(debtRaw, d.reserve, -d.amount);
      notePeak("supply", collMeta, coll.after);
      notePeak("debt", rMeta, debt.after);
      // One liquidation, two lanes on two reserves — the collateral seized on
      // the collateral asset, the debt covered on the debt asset. Both raw.
      if (d.collateralAsset) rawFlowsOf(d.collateralAsset).liquidatedCollateral += d.liquidatedCollateralAmount ?? ZERO;
      rawFlowsOf(d.reserve).liquidatedDebt += d.amount;
      const ctx: AaveV3Context = {
        eventType: "liquidation",
        reserveSymbol: rMeta?.symbol,
        collateralAsset: collMeta?.address,
        collateralSymbol: collMeta?.symbol,
        debtToCover: amt(d.amount, rMeta),
        liquidatedCollateralAmount: amt(d.liquidatedCollateralAmount, collMeta),
        liquidator: d.liquidator,
        ...(d.collateralPrice ? { collateralPrice: d.collateralPrice } : {}),
        ...(d.debtPrice ? { debtPrice: d.debtPrice } : {}),
        ...(d.liquidationBonusAtBlock ? { liquidationBonusAtBlock: d.liquidationBonusAtBlock } : {}),
        supplyBefore: amt(coll.before, collMeta),
        supplyAfter: amt(coll.after, collMeta),
        debtBefore: amt(debt.before, rMeta),
        debtAfter: amt(debt.after, rMeta),
        raw: {
          debtToCover: d.amount.toString(),
          liquidatedCollateralAmount: d.liquidatedCollateralAmount?.toString(),
          supplyBefore: coll.before.toString(),
          supplyAfter: coll.after.toString(),
          debtBefore: debt.before.toString(),
          debtAfter: debt.after.toString(),
        },
        origin: {
          debtToCover: originVal("LiquidationCall", "debtToCover", rMeta, d.amount),
          liquidatedCollateralAmount: originVal(
            "LiquidationCall",
            "liquidatedCollateralAmount",
            collMeta,
            d.liquidatedCollateralAmount,
          ),
        },
      };
      if (render)
        events.push({
          ...base,
          actionType: d.kind,
          actionLabel: LABELS[d.kind],
          flows: [] as AssetFlow[],
          context: { protocol: "aave-v3" as const, data: ctx },
        });
      return;
    }

    // aToken moves ride the SUPPLY axis — debt tokens are non-transferable, and
    // reading a transfer onto the debt axis would reshape a custody move into a
    // borrow.
    const isTransfer = d.kind === "transfer_in" || d.kind === "transfer_out";
    const isSupplySide = d.kind === "supply" || d.kind === "withdraw" || isTransfer;
    const delta = d.kind === "supply" || d.kind === "borrow" || d.kind === "transfer_in" ? d.amount : -d.amount;
    const run = bump(isSupplySide ? supplyRaw : debtRaw, d.reserve, delta);
    notePeak(isSupplySide ? "supply" : "debt", rMeta, run.after);
    // Pool flows only — a transfer is a custody move, deliberately neither a
    // deposit nor a withdrawal (the tower's provenance says so, and a
    // transfer-fed reserve then fails its conservation gates rather than
    // silently absorbing the inflow as a supply).
    // (A reserve a transfer alone touched still gets its zero entry, so
    // `lifetimeRaw` names every reserve the wallet ever moved.)
    const lt = rawFlowsOf(d.reserve);
    if (d.kind === "supply") lt.supplied += d.amount;
    else if (d.kind === "withdraw") lt.withdrawn += d.amount;
    else if (d.kind === "borrow") lt.borrowed += d.amount;
    else if (d.kind === "repay") lt.repaid += d.amount;
    // "in" = toward the wallet, "out" = toward the protocol.
    const dir: "in" | "out" = d.kind === "supply" || d.kind === "repay" || d.kind === "transfer_out" ? "out" : "in";
    const flows = rMeta ? [flowV3(rMeta, d.amount, dir)] : [];
    const txFrom = fromOf.get(d.txHash);

    const ctx: AaveV3Context = {
      eventType: d.kind,
      amount: amt(d.amount, rMeta),
      reserveSymbol: rMeta?.symbol,
      ...(d.price ? { price: d.price } : {}),
      ...(d.kind === "borrow" ? { interestRateMode: d.interestRateMode, borrowRate: d.borrowRate } : {}),
      ...(d.kind === "repay" ? { useATokens: d.useATokens } : {}),
      ...(isTransfer && d.counterparty ? { counterparty: d.counterparty } : {}),
      ...(txFrom && d.poolCaller ? { txFrom, poolCaller: d.poolCaller } : {}),
      ...(isSupplySide
        ? { supplyBefore: amt(run.before, rMeta), supplyAfter: amt(run.after, rMeta) }
        : { debtBefore: amt(run.before, rMeta), debtAfter: amt(run.after, rMeta) }),
      raw: {
        amount: d.amount.toString(),
        ...(isSupplySide
          ? { supplyBefore: run.before.toString(), supplyAfter: run.after.toString() }
          : { debtBefore: run.before.toString(), debtAfter: run.after.toString() }),
      },
      origin: {
        // A transfer's amount is DERIVED (scaled value × the emitted index),
        // not one untouched log param, so it gets no envelope.
        amount: isTransfer ? undefined : originVal(AMOUNT_EVENT[d.kind] ?? d.kind, "amount", rMeta, d.amount),
      },
    };
    if (render)
      events.push({
        ...base,
        actionType: d.kind,
        actionLabel: LABELS[d.kind],
        flows,
        context: { protocol: "aave-v3" as const, data: ctx },
      });
  });

  // ── The edge: scale ONCE ──────────────────────────────────────────────────
  // Each symbol's six lanes are the raw sums of the reserves that carry that
  // symbol, scaled once. Where those reserves all share one decimals figure
  // — every real case — the raw sums are added first and scaled once, so the
  // figure is the correctly-rounded total. Where they do not (two tokens
  // sharing a ticker at different scales — nothing on either Base Pool does),
  // there is no one raw sum to scale: each reserve is scaled on its own
  // decimals and the doubles are added, and that is the one place a rounding
  // can enter. A reserve the replay had no metadata for has no symbol to sit
  // under, so it appears in `lifetimeRaw` alone, as before it appeared in
  // neither.
  const lifetimeRaw: AaveV3ReserveLifetimeRaw[] = [];
  const bySymbol = new Map<
    string,
    { decimals: Set<number>; reserves: { raw: AaveV3LifetimeRaw; decimals: number }[] }
  >();
  for (const [reserve, raw] of rawFlows) {
    const m = meta(reserve);
    lifetimeRaw.push({
      reserve,
      ...(m ? { symbol: m.symbol, decimals: m.decimals } : {}),
      supplied: raw.supplied.toString(),
      withdrawn: raw.withdrawn.toString(),
      borrowed: raw.borrowed.toString(),
      repaid: raw.repaid.toString(),
      liquidatedCollateral: raw.liquidatedCollateral.toString(),
      liquidatedDebt: raw.liquidatedDebt.toString(),
    });
    if (!m) continue;
    let group = bySymbol.get(m.symbol);
    if (!group) {
      group = { decimals: new Set(), reserves: [] };
      bySymbol.set(m.symbol, group);
    }
    group.decimals.add(m.decimals);
    group.reserves.push({ raw, decimals: m.decimals });
  }
  for (const f of lifetime.values()) {
    const group = bySymbol.get(f.symbol);
    if (!group) continue;
    for (const lane of LIFETIME_LANES) {
      if (group.decimals.size === 1) {
        const sum = group.reserves.reduce((acc, r) => acc + r.raw[lane], ZERO);
        f[lane] = scaleV3(sum, group.reserves[0].decimals);
      } else {
        f[lane] = group.reserves.reduce((acc, r) => acc + scaleV3(r.raw[lane], r.decimals), 0);
      }
    }
  }

  // Every seeded row is omitted from the drawn list — it was replayed into
  // the seed, not sent — and with a seed the wallet's first event sits
  // before the cut, so it is the seed's own first stamp. The last stamp is
  // the tail's newest row, or, for a wallet dormant since before the cut (an
  // empty tail), the seed's.
  const seeded = seed != null && seedEvents > 0;
  // Omitted is the ELIDED rows plus the seed's: an anchored row below the cut
  // is drawn, so it is neither omitted nor in the histograms above.
  const omittedCount = seedEvents + elided;
  const omittedUpTo = elided > 0 ? elidedUpToBlock : (seed?.wallet.lastBlock ?? 0);
  // An empty tail behind a seed never reached the first drawn row: the state
  // at the cut is the seed's own. Withheld where anchoring drew wallet-signed
  // rows from BELOW the cut — the drawn list is then not contiguous with the
  // cut and no one block is "before the oldest drawn row".
  if (cutState === undefined) cutState = snapshotAtCut();
  const cutSummary: TimelineCutSummary = {
    stateAtCut: anchoredDrawn > 0 ? null : cutState,
    byType: seeded ? null : bucketsOf(cutTypes),
    byAsset: seeded ? null : bucketsOf(cutAssets),
    firstAt: seeded ? seed.wallet.firstTimestamp : rows.length > 0 ? (tsOf.get(rows[0].blockNumber) ?? null) : null,
    lastAt: elided > 0 ? (tsOf.get(elidedUpToBlock) ?? null) : seeded ? seed.wallet.lastTimestamp : null,
  };
  return {
    wallet,
    events,
    totalEvents: events.length,
    lifetime: [...lifetime.values()],
    lifetimeRaw,
    txCount: seededTxs + ownTxs.size,
    liquidationCount,
    lastActivityAt:
      rows.length > 0
        ? (tsOf.get(rows[rows.length - 1].blockNumber) ?? null)
        : seeded
          ? seed.wallet.lastTimestamp
          : null,
    coverage: {
      ...p.coverage,
      firstEventAt: seeded
        ? seed.wallet.firstTimestamp
        : rows.length > 0
          ? (tsOf.get(rows[0].blockNumber) ?? null)
          : null,
      // `anchored` rides whenever the anchor is on — even at 0, and even
      // beside a seed: it is the count of wallet-signed rows this replay drew
      // from below the cut, and the anchor stays on over the tail behind a
      // seed. Whether that count is the WHOLE set — the guarantee "everything
      // the wallet signed is drawn" — is `anchoredComplete`: true when every
      // row below the cut was here to anchor, false beside a seed, whose rows
      // were replayed into it and never here, so a wallet-signed row among
      // them is not drawn (lib/api/fetch-chain-timeline.ts states both).
      ...(omittedCount > 0
        ? {
            omitted: {
              count: omittedCount,
              upToBlock: omittedUpTo,
              summary: cutSummary,
              ...(anchorRows ? { anchored: anchoredDrawn, anchoredComplete: !seeded } : {}),
            },
          }
        : {}),
      ...(undated > 0 ? { undated } : {}),
    },
  };
}
