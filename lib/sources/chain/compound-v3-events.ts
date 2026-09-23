// A wallet's WHOLE LIFE across a Compound V3 deployment, read from the chain's
// own logs.
// ----------------------------------------------------------------------------
// The Ethereum explorer gets this from an index: rails-server captures each
// Comet's events and `mv_compound_v3_events` (mig 053) replays the running
// balances in SQL, and the web route only does presentation. On Base this
// module is BOTH halves — the capture (a chunked sweep,
// lib/sources/chain/log-sweep) and the replay (`replayCometRows`) — emitting
// the exact same `CompoundContext` the MV route emits, so the event card, its
// detail grid, its explainer and the economics tower are the Ethereum ones,
// reused rather than forked. The replay half is also where the INDEX reader
// (lib/sources/api/compound-base-timeline.ts) ends: the Sieve indexer holds
// the same events, and once it holds the whole life the route serves them
// from there through this same arithmetic. The Aave V3 reader
// (aave-v3-events.ts) is the pattern; what differs is Comet's own grammar.
//
// Where the two lanes must agree, they agree deliberately, and the MV is the
// reference:
//
//   • BASE is one SIGNED principal per (market, account): Supply +amount,
//     Withdraw −amount, AbsorbDebt +basePaidOut, account-to-account Transfer
//     ±amount. NOT clamped — negative is debt. Comet has no Borrow or Repay
//     event: a withdraw past the balance IS the borrow and a supply against a
//     negative balance IS the repayment, which is why the lifetime flows below
//     are split at the running balance's zero crossings and not by event kind.
//   • COLLATERAL is one non-earning balance per (market, account, asset):
//     SupplyCollateral +, WithdrawCollateral −, AbsorbCollateral −,
//     TransferCollateral ±. Clamped at zero, as the MV does.
//   • Comet emits an ERC20 `Transfer` with a zero side on every base supply
//     (mint, from 0x0), withdraw (burn, to 0x0) and absorb (mint) — AND on
//     every account-to-account base transfer, which `transferBase` logs as a
//     burn from src plus a mint to dst, never as Transfer(src, dst). So a
//     zero-address leg is either a companion of a Supply / Withdraw /
//     AbsorbDebt row already in the lane, or half of a transfer. The rule is
//     mainnet's (server migs 190 / 233) and the Base index's (rails-server
//     routes/baseComet.ts): per (market, tx, direction) rank the wallet's
//     zero-address legs by log index; the first N are the companions of its N
//     Supply + AbsorbDebt rows (a mint) or Withdraw rows (a burn), and every leg
//     past N is kept as transfer_in / transfer_out (keepCometTransferLegs). The
//     other side is the other kept leg of the transaction, read off its receipt
//     for the drawn rows only (pairCometTransferLegs). Until 2026-09-21 every
//     zero-address leg was dropped, so no base transfer was ever drawn.
//   • `txFrom` + `funder` ride only the Supply / SupplyCollateral rows (the
//     event's own `from` is the funder); a Withdraw's counterparty is a
//     recipient, not an actor, and never marks the card. Same NULLs as the MV.
//
// Principal, not present value. The base replay is the running sum of what the
// logs emitted; interest accrues by index with no log to replay, so the sum
// sits apart from the Comet's own `balanceOf` / `borrowBalanceOf` by exactly
// the interest — and that gap is what the economics tower's principal /
// accrued split is built on. Collateral does not accrue, so its replay must
// match `collateralBalanceOf` EXACTLY, and the page checks that it does.
//
// One shape worth knowing before reading the sweep: a deployment is FIVE
// Comets, and the owner sits in topic1 on some events and topic2 on others.
// Measured on Base (2026-08-25), one query naming all five Comets costs about
// the same as one query naming one — so the whole life is two queries (one per
// owner topic position), not ten. The alternative of no address filter is not
// available here the way it was for aTokens: `Transfer` is the ERC20 event, and
// unfiltered it matches every token transfer on the chain.
//
// SERVER-ONLY.

import { decodeEventLog, encodeEventTopics, parseAbi } from "viem";
import { chainBatchClient, chainLogsClient } from "./rpc";
import { addressTopic, splitCoverage, sweepLogs, type BlockRange, type RawLog } from "./log-sweep";
import { inPacedGroups, resolveBlockTimestamps, resolveTxSenders } from "./sweep-metadata";
import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "./erc20-meta";
import { bucketsOf, type BoundaryStateLine, type TimelineCutSummary } from "@/lib/shared/timeline-boundary";
import { COMPOUND_EVENT_LABELS, fmtUnits } from "@/lib/sources/api/compound-timeline";
import type { CometDeployment, CometMarket } from "@/lib/compound/asset-catalog";
import {
  addCompoundCollateralFlow,
  compoundCollateralFlowsOf,
  compoundLifetimeRawToWire,
  newCompoundLifetimeRaw,
  scaleCompoundLifetime,
  splitCompoundBaseFlow,
  type CompoundLifetimeFlows,
  type CompoundLifetimeRaw,
  type CompoundLifetimeRawWire,
} from "@/lib/compound/economics";
import type { CompoundAssetAmount } from "@/lib/sources/api/compound-positions";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { ChainTimelineCoverage, ChainTimelineEnvelope } from "@/lib/api/fetch-chain-timeline";
import type { AssetFlow, BaseActivityEvent, CompoundContext, CompoundEventType } from "@/lib/shared/types/event-shape";

// The deployed forms, on-chain-validated (a sample of each Base Comet's own logs
// carries these exact topic-0s; see the server's mig 149 for the same check on
// Ethereum — the vendored interface's uint128 TransferCollateral and 2-indexed
// collateral events compute selectors that match nothing).
const COMET_EVENTS_ABI = parseAbi([
  "event Supply(address indexed from, address indexed dst, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event Withdraw(address indexed src, address indexed to, uint256 amount)",
  "event SupplyCollateral(address indexed from, address indexed dst, address indexed asset, uint256 amount)",
  "event TransferCollateral(address indexed from, address indexed to, address indexed asset, uint256 amount)",
  "event WithdrawCollateral(address indexed src, address indexed to, address indexed asset, uint256 amount)",
  "event AbsorbDebt(address indexed absorber, address indexed borrower, uint256 basePaidOut, uint256 usdValue)",
  "event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)",
]);

// Topic-0 of each event, DERIVED from the ABI at module load rather than pasted
// as literals — a signature edit can then never leave a stale hash silently
// filtering for an event that no longer exists.
const topic0 = (eventName: string): string =>
  encodeEventTopics({ abi: COMET_EVENTS_ABI, eventName } as never)[0] as string;

const TOPIC0 = {
  Supply: topic0("Supply"),
  Transfer: topic0("Transfer"),
  Withdraw: topic0("Withdraw"),
  SupplyCollateral: topic0("SupplyCollateral"),
  TransferCollateral: topic0("TransferCollateral"),
  WithdrawCollateral: topic0("WithdrawCollateral"),
  AbsorbDebt: topic0("AbsorbDebt"),
  AbsorbCollateral: topic0("AbsorbCollateral"),
} as const;

/** Events whose OWNER is the first indexed param (topic1): the account that is
 *  debited. */
const OWNER_IN_TOPIC1 = [TOPIC0.Withdraw, TOPIC0.WithdrawCollateral, TOPIC0.Transfer, TOPIC0.TransferCollateral];
/** Events whose OWNER is the second indexed param (topic2): the account that is
 *  credited, or — on the absorbs — the borrower. */
const OWNER_IN_TOPIC2 = [
  TOPIC0.Supply,
  TOPIC0.SupplyCollateral,
  TOPIC0.Transfer,
  TOPIC0.TransferCollateral,
  TOPIC0.AbsorbDebt,
  TOPIC0.AbsorbCollateral,
];

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// The signed-base axis; everything else is a collateral axis. Same partition
// as the MV transform's BASE_ACTIONS.
const BASE_KINDS = new Set<CompoundEventType>(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);
// Value LEAVING this account (supply, a seize, a sent transfer leg) — the
// flow's direction from the account's own point of view.
const OUT_KINDS = new Set<CompoundEventType>([
  "supply",
  "supply_collateral",
  "absorb_debt",
  "transfer_out",
  "transfer_collateral_out",
]);

/** How many events get RENDERED. The replay walks every row regardless; only
 *  the drawing is capped, and the coverage says by how much. The number is set
 *  by the metadata rate (see aave-v3-events.ts, where it was measured), not by
 *  the sweep. */
const MAX_RENDERED_EVENTS = 250;

/** The replayed end state of one market the wallet touched — the position-card
 *  and tower inputs an indexed explorer would read from its listing row. Sent
 *  beside the events because the event list is capped and this is not. */
export interface CometMarketReplay {
  market: string;
  marketLabel: string;
  comet: string;
  /** THIS market's rows before the wallet-wide trim — its seed's count plus
   *  its elided tail rows — with the state the elided rows left on this
   *  market and, without a seed, the elided rows by kind and asset. The page
   *  draws one timeline per market, so each states its own boundary
   *  (rails-ops decision 0019); `coverage.omitted` stays the wallet-wide sum.
   *  `anchored` — how many wallet-signed rows this market drew from below the
   *  cut — and `anchoredComplete` — whether that is the whole set, false
   *  beside THIS market's seed — ride exactly as they do on `coverage.omitted`. */
  omitted?: {
    count: number;
    upToBlock: number;
    anchored?: number;
    anchoredComplete?: boolean;
    summary?: TimelineCutSummary;
  };
  /** Signed base PRINCIPAL at the head of the sweep (> 0 lent, < 0 borrowed). */
  base: { amount: number; amountRaw: string };
  /** Replayed collateral per asset, > 0 only. Exact when the sweep was whole. */
  collateral: CompoundAssetAmount[];
  /** Highest recorded amounts, dust-clamped the way mig 054 clamps them. */
  peak: {
    lentBase: number;
    lentBaseRaw: string;
    borrowedBase: number;
    borrowedBaseRaw: string;
    collateral: CompoundAssetAmount[];
  };
  /** Absorptions (one AbsorbDebt per absorption). */
  liquidationCount: number;
  everLiquidated: boolean;
  /** Distinct transactions of the account's own — the absorb legs, done TO the
   *  account, are excluded. */
  txCount: number;
  /** Unix seconds of the market's FIRST event — this position's own start,
   *  resolved from its oldest row even when that row is far below the
   *  rendered cutoff. The coverage's `firstEventAt` is the wallet's oldest
   *  event across every market, which is not the same date. Null when the
   *  block could not be dated. */
  firstEventAt: number | null;
  /** Unix seconds of the market's latest event; null when its block could not
   *  be dated. */
  lastActivityAt: number | null;
  /** Lifetime sums over EVERY row of this market, not the rendered slice. */
  lifetime: CompoundLifetimeFlows;
  /** The same sums before scaling — raw token units as decimal strings, exact.
   *  A seed at a cut sends this shape (CometReplaySeed.lifetime) and the
   *  tail's walk adds to it; `lifetime` above is this scaled once. */
  lifetimeRaw: CompoundLifetimeRawWire;
}

export interface CometChainTimelineResult extends ChainTimelineEnvelope {
  /** The rendered slice, every market's rows in one chain-ordered list. */
  events: BaseActivityEvent[];
  /** One entry per market the wallet has ever touched, roster order. */
  markets: CometMarketReplay[];
}

/** One row of a wallet's history, whichever capture produced it: a decoded
 *  log from the sweep, or an index row the API handed over. Signed the way the
 *  MV signs it. */
export interface CometDecodedRow {
  market: CometMarket;
  blockNumber: number;
  txIndex: number;
  logIndex: number;
  txHash: string;
  kind: CompoundEventType;
  /** The touched token: the market's base for base events, else the collateral. */
  asset: string;
  /** Signed delta on the touched axis — the MV's base_delta / coll_delta. */
  delta: bigint;
  /** The MV's counterparty column: the funder on a supply, the recipient on a
   *  withdraw, the absorber on an absorb, the other account on a transfer. */
  counterparty: string;
  /** Absorbs only — the event's own oracle reckoning, 8-dec USD. */
  usdValue?: bigint;
  /** A base Transfer leg with the zero address on its other side: a mint or a
   *  burn, which keepCometTransferLegs keeps (a transfer) or drops (the
   *  companion of a Supply / Withdraw / AbsorbDebt row). */
  zeroLeg?: "mint" | "burn";
}

/** Raw log → the MV row(s) it stands for, for THIS wallet. A peer-to-peer
 *  transfer the wallet is on both sides of yields both legs, as the MV does. */
function decodeCometLog(log: RawLog, wallet: string, market: CometMarket): CometDecodedRow[] {
  const base = {
    market,
    blockNumber: Number(log.blockNumber),
    txIndex: Number(log.transactionIndex),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash.toLowerCase(),
  };
  const t0 = log.topics[0]?.toLowerCase();
  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: COMET_EVENTS_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    }) as { eventName: string; args: Record<string, unknown> };
  } catch {
    // A log whose shape doesn't decode is not silently reshaped into an event.
    return [];
  }
  const a = decoded.args;
  const addr = (v: unknown): string => String(v).toLowerCase();
  const baseToken = market.baseToken.toLowerCase();

  // Every branch guards the owner against the wallet even though the topic
  // filter already did: a sweep bug that let another account's event through
  // would otherwise be replayed into this wallet's balances.
  if (t0 === TOPIC0.Supply) {
    if (addr(a.dst) !== wallet) return [];
    return [{ ...base, kind: "supply", asset: baseToken, delta: a.amount as bigint, counterparty: addr(a.from) }];
  }
  if (t0 === TOPIC0.Withdraw) {
    if (addr(a.src) !== wallet) return [];
    return [{ ...base, kind: "withdraw", asset: baseToken, delta: -(a.amount as bigint), counterparty: addr(a.to) }];
  }
  if (t0 === TOPIC0.SupplyCollateral) {
    if (addr(a.dst) !== wallet) return [];
    return [
      {
        ...base,
        kind: "supply_collateral",
        asset: addr(a.asset),
        delta: a.amount as bigint,
        counterparty: addr(a.from),
      },
    ];
  }
  if (t0 === TOPIC0.WithdrawCollateral) {
    if (addr(a.src) !== wallet) return [];
    return [
      {
        ...base,
        kind: "withdraw_collateral",
        asset: addr(a.asset),
        delta: -(a.amount as bigint),
        counterparty: addr(a.to),
      },
    ];
  }
  if (t0 === TOPIC0.AbsorbDebt) {
    if (addr(a.borrower) !== wallet) return [];
    return [
      {
        ...base,
        kind: "absorb_debt",
        asset: baseToken,
        delta: a.basePaidOut as bigint,
        counterparty: addr(a.absorber),
        usdValue: a.usdValue as bigint,
      },
    ];
  }
  if (t0 === TOPIC0.AbsorbCollateral) {
    if (addr(a.borrower) !== wallet) return [];
    return [
      {
        ...base,
        kind: "absorb_collateral",
        asset: addr(a.asset),
        delta: -(a.collateralAbsorbed as bigint),
        counterparty: addr(a.absorber),
        usdValue: a.usdValue as bigint,
      },
    ];
  }
  if (t0 === TOPIC0.Transfer || t0 === TOPIC0.TransferCollateral) {
    const from = addr(a.from);
    const to = addr(a.to);
    const collateral = t0 === TOPIC0.TransferCollateral;
    // A base leg with a zero side is a candidate: keepCometTransferLegs decides
    // whether it is a transfer or a companion. Its counterparty is unknown
    // until pairCometTransferLegs reads the transaction. A collateral transfer
    // never has a zero side; one that did would not be a position move.
    if (from === ZERO_ADDR || to === ZERO_ADDR) {
      if (collateral || from === to) return [];
      if (from === ZERO_ADDR && to === wallet)
        return [
          {
            ...base,
            kind: "transfer_in",
            asset: baseToken,
            delta: a.amount as bigint,
            counterparty: "",
            zeroLeg: "mint",
          },
        ];
      if (to === ZERO_ADDR && from === wallet)
        return [
          {
            ...base,
            kind: "transfer_out",
            asset: baseToken,
            delta: -(a.amount as bigint),
            counterparty: "",
            zeroLeg: "burn",
          },
        ];
      return [];
    }
    const asset = collateral ? addr(a.asset) : baseToken;
    const amount = a.amount as bigint;
    const out: CometDecodedRow[] = [];
    if (from === wallet)
      out.push({
        ...base,
        kind: collateral ? "transfer_collateral_out" : "transfer_out",
        asset,
        delta: -amount,
        counterparty: to,
      });
    if (to === wallet)
      out.push({
        ...base,
        kind: collateral ? "transfer_collateral_in" : "transfer_in",
        asset,
        delta: amount,
        counterparty: from,
      });
    return out;
  }
  return [];
}

/** The keep rule over ONE account's decoded rows (any order): per (market, tx,
 *  direction), the account's zero-address legs ranked by log index; the first
 *  N are the companions of its N Supply + AbsorbDebt rows (a mint) or Withdraw
 *  rows (a burn) in that transaction and are dropped, every leg past N is half
 *  of a transfer and kept. Rows without a zeroLeg pass through. Pure. */
export function keepCometTransferLegs(rows: CometDecodedRow[]): CometDecodedRow[] {
  const key = (d: CometDecodedRow, leg: "mint" | "burn") => `${d.market.comet.toLowerCase()}:${d.txHash}:${leg}`;
  const budget = new Map<string, number>();
  for (const d of rows) {
    const leg = d.kind === "supply" || d.kind === "absorb_debt" ? "mint" : d.kind === "withdraw" ? "burn" : null;
    if (leg) budget.set(key(d, leg), (budget.get(key(d, leg)) ?? 0) + 1);
  }
  const legs = rows.filter((d) => d.zeroLeg).sort((a, b) => a.logIndex - b.logIndex);
  const drop = new Set<CometDecodedRow>();
  const used = new Map<string, number>();
  for (const d of legs) {
    const k = key(d, d.zeroLeg!);
    const n = used.get(k) ?? 0;
    if (n < (budget.get(k) ?? 0)) drop.add(d);
    used.set(k, n + 1);
  }
  return rows.filter((d) => !drop.has(d));
}

/** Names the other side of each kept zero-address leg in `rows`, from the full
 *  Comet logs of its transaction (`txLogs`, by lowercased tx hash — a receipt's
 *  logs; logs of other contracts are ignored). The other side is mig 233's: the
 *  other KEPT leg of the same transaction and Comet, of the other direction
 *  and another account, nearest by amount, then lowest log index. A leg with
 *  no such partner (its other half is a debt change Comet does not log), or
 *  whose transaction was not read, keeps an empty counterparty. Pure. */
export function pairCometTransferLegs(
  rows: CometDecodedRow[],
  wallet: string,
  txLogs: Map<string, RawLog[]>,
): CometDecodedRow[] {
  const keptByTx = new Map<string, { account: string; mint: boolean; amount: bigint; logIndex: number }[]>();
  const keptOf = (market: CometMarket, txHash: string) => {
    const k = `${market.comet.toLowerCase()}:${txHash}`;
    const hit = keptByTx.get(k);
    if (hit) return hit;
    const logs = (txLogs.get(txHash) ?? []).filter((l) => l.address.toLowerCase() === market.comet.toLowerCase());
    // Every account on a zero-address leg of this transaction, run through the
    // same keep rule as the wallet's own rows.
    const accounts = new Set<string>();
    for (const l of logs)
      if (l.topics[0]?.toLowerCase() === TOPIC0.Transfer && l.topics.length === 3)
        for (const t of [l.topics[1], l.topics[2]]) accounts.add(`0x${t.slice(26).toLowerCase()}`);
    accounts.delete(ZERO_ADDR);
    accounts.delete(wallet);
    const out: { account: string; mint: boolean; amount: bigint; logIndex: number }[] = [];
    for (const acct of accounts) {
      const theirs = keepCometTransferLegs(logs.flatMap((l) => decodeCometLog(l, acct, market)));
      for (const d of theirs)
        if (d.zeroLeg)
          out.push({
            account: acct,
            mint: d.zeroLeg === "mint",
            amount: d.delta < ZERO ? -d.delta : d.delta,
            logIndex: d.logIndex,
          });
    }
    keptByTx.set(k, out);
    return out;
  };
  return rows.map((d) => {
    if (!d.zeroLeg || !txLogs.has(d.txHash)) return d;
    const amount = d.delta < ZERO ? -d.delta : d.delta;
    const dist = (x: bigint) => (x > amount ? x - amount : amount - x);
    const best = keptOf(d.market, d.txHash)
      .filter((o) => o.mint !== (d.zeroLeg === "mint"))
      .sort((a, b) =>
        dist(a.amount) < dist(b.amount) ? -1 : dist(a.amount) > dist(b.amount) ? 1 : a.logIndex - b.logIndex,
      )[0];
    return best ? { ...d, counterparty: best.account } : d;
  });
}

/** Below this raw magnitude a replayed base residue reads as zero — the
 *  interest-dust threshold mig 054 applies (1e14 wei on an 18-dec base, 1e4 on
 *  a 6-dec one), generalised as 10^(decimals − 4). */
const dustOf = (decimals: number): bigint => BigInt(10) ** BigInt(Math.max(0, decimals - 4));

export interface LoadCometChainEventsParams {
  wallet: string;
  deployment: CometDeployment;
  /** The earliest Comet's first block — the floor of the whole-life sweep. */
  deployBlock: number;
  /** Markets where the server flags this account as a router/relay, as the
   *  index answer named them before it fell back here; the replay states no
   *  peak for them (see CometReplayInput). */
  peakWithheldMarkets?: string[];
}

/**
 * Read every Comet event this wallet is a party to, across every market of the
 * deployment, from the earliest Comet's first block to the chain head, and
 * replay them into the shared timeline shape plus a per-market end state.
 */
export async function loadCometEventsFromChain(p: LoadCometChainEventsParams): Promise<CometChainTimelineResult> {
  const wallet = p.wallet.toLowerCase();
  const chainId = p.deployment.chainId;
  const logsClient = chainLogsClient(chainId);
  // Per-event metadata goes to the STATE endpoint, paced — see aave-v3-events.
  const stateClient = chainBatchClient(chainId);
  const marketByComet = new Map(p.deployment.markets.map((m) => [m.comet.toLowerCase(), m]));
  const comets = [...marketByComet.keys()];

  const head = Number(await stateClient.getBlockNumber());
  const range: BlockRange = { from: p.deployBlock, to: head };
  const walletTopic = addressTopic(wallet);

  // Two sweeps, all five Comets each: the events that put the owner in topic1
  // and the ones that put them in topic2. No filter can OR across topic
  // POSITIONS, so the split is forced; the address list is not (see the header).
  const [t1Sweep, t2Sweep] = await Promise.all([
    sweepLogs(logsClient, { address: comets, topics: [OWNER_IN_TOPIC1, walletTopic] }, range),
    sweepLogs(logsClient, { address: comets, topics: [OWNER_IN_TOPIC2, null, walletTopic] }, range),
  ]);

  const decoded: CometDecodedRow[] = [];
  for (const log of [...t1Sweep.logs, ...t2Sweep.logs]) {
    const market = marketByComet.get(log.address.toLowerCase());
    if (!market) continue;
    decoded.push(...decodeCometLog(log, wallet, market));
  }
  decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);

  // De-duplicate on the MV's own event_key (action:tx:logIndex): a peer-to-peer
  // Transfer with the wallet on one side is returned by BOTH sweeps, and a chunk
  // retried after a partial failure can repeat a log.
  const seen = new Set<string>();
  const deduped = decoded.filter((d) => {
    const k = `${d.kind}:${d.txHash}:${d.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Zero-address legs: companions dropped, transfer halves kept (see header).
  let rows = keepCometTransferLegs(deduped);

  // Where the history actually starts, and what is missing from inside it —
  // a horizon at the floor versus holes in the span. See splitCoverage.
  const { horizonTo, holes } = splitCoverage([...t1Sweep.gaps, ...t2Sweep.gaps], range.from);
  const floor = horizonTo != null ? horizonTo + 1 : range.from;

  // The other side of each DRAWN transfer leg, off its transaction's receipt:
  // one paced read per transaction, never for the elided rows (the same budget
  // the timestamps keep). A receipt that will not read leaves the leg's
  // counterparty empty rather than guessed.
  {
    const drawnTxs = [
      ...new Set(
        rows
          .slice(Math.max(0, rows.length - MAX_RENDERED_EVENTS))
          .filter((d) => d.zeroLeg)
          .map((d) => d.txHash),
      ),
    ];
    if (drawnTxs.length) {
      const txLogs = new Map<string, RawLog[]>();
      await inPacedGroups(drawnTxs, async (h) => {
        const receipt = await stateClient.getTransactionReceipt({ hash: h as `0x${string}` });
        txLogs.set(
          h,
          receipt.logs.map((l) => ({
            address: l.address,
            topics: l.topics as string[],
            data: l.data,
            blockNumber: String(l.blockNumber),
            logIndex: String(l.logIndex),
            transactionHash: l.transactionHash,
            transactionIndex: String(l.transactionIndex),
          })),
        );
      });
      rows = pairCometTransferLegs(rows, wallet, txLogs);
    }
  }

  const cutoff = Math.max(0, rows.length - MAX_RENDERED_EVENTS);
  const shown = rows.slice(cutoff);

  // Collateral token metadata for every row (the replay needs decimals); block
  // timestamps for the rendered rows PLUS the very first row (the coverage
  // states when the history begins, and that must not be the start of a capped
  // slice) PLUS each market's first and last rows (the position's own "active
  // since" and "last activity", for the same reason); tx
  // senders for the rendered supply-side rows only — the only rows whose card
  // can mark a third-party actor.
  const collAddrs = new Set<string>();
  for (const d of rows) if (!BASE_KINDS.has(d.kind)) collAddrs.add(d.asset);
  const firstRowByMarket = new Map<string, CometDecodedRow>();
  const lastRowByMarket = new Map<string, CometDecodedRow>();
  for (const d of rows) {
    if (!firstRowByMarket.has(d.market.key)) firstRowByMarket.set(d.market.key, d);
    lastRowByMarket.set(d.market.key, d);
  }
  const blocks = [
    ...new Set([
      ...shown.map((d) => d.blockNumber),
      ...(rows.length > 0 ? [rows[0].blockNumber] : []),
      ...[...firstRowByMarket.values(), ...lastRowByMarket.values()].map((d) => d.blockNumber),
    ]),
  ];
  const funderTxs = [
    ...new Set(shown.filter((d) => d.kind === "supply" || d.kind === "supply_collateral").map((d) => d.txHash)),
  ];
  const [metas, tsOf, fromOf] = await Promise.all([
    resolveErc20Meta([...collAddrs], chainId),
    resolveBlockTimestamps(stateClient, blocks),
    resolveTxSenders(stateClient, funderTxs),
  ]);

  return replayCometRows({
    wallet,
    chainId,
    deployment: p.deployment,
    rows,
    metas,
    timestamps: tsOf,
    senders: fromOf,
    maxRendered: MAX_RENDERED_EVENTS,
    peakWithheldMarkets: p.peakWithheldMarkets ?? [],
    // The anchor is OFF on the sweep: it reads a sender only for the drawn
    // supply-side rows, and the sender is the one fact that says whether a
    // row below the cut anchors. Reading one for every elided row is the
    // metadata cost the 250-row cut exists to avoid, so the sweep cuts by
    // depth alone and states no guarantee. The index reader carries every
    // row's sender and anchors (lib/sources/api/compound-base-timeline.ts).
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

/** What the replay takes, from either capture: the wallet's rows in chain
 *  order (deduplicated — a peer-to-peer transfer is one row per leg), the
 *  collateral metadata, the timestamps and senders each capture resolved for
 *  the rows it means to draw, how many newest rows to draw, optionally the
 *  seeds a heavy wallet's elided history travels as, and the coverage the
 *  capture can vouch for. The sweep (above) and the index reader
 *  (lib/sources/api/compound-base-timeline.ts) both end here, so the events,
 *  the running balances, the peaks and the lifetime flows are the same
 *  arithmetic whichever captured the rows — only `coverage.source` differs. */
export interface CometReplayInput {
  wallet: string;
  chainId: ChainId;
  deployment: CometDeployment;
  rows: CometDecodedRow[];
  metas: Map<string, Erc20Meta>;
  /** Block → unix seconds, for at least the rows that will be drawn — the
   *  newest `maxRendered` and, with the anchor on, every wallet-signed row
   *  below that cut. A row whose block is absent is replayed but not drawn. */
  timestamps: Map<number, number>;
  /** Tx hash → sender. With the anchor on it must cover EVERY row: the sender
   *  is the one fact that decides whether a row below the cut anchors, and a
   *  row whose sender is unknown here is elided as unsigned. */
  senders: Map<string, string>;
  /** How many of the NEWEST rows are drawn; the replay runs over all of them.
   *  Rows the wallet signed itself are ANCHORED — drawn however far below
   *  this cut they sit (rails-ops reference/timeline-attention-budget.md,
   *  adjustment 1; ported from the Moonwell replay under decision 0019 leg F). */
  maxRendered: number;
  /** Markets where the server flags this account as a router/relay (rails-
   *  server mig 223). Its history there is round trips inside one
   *  transaction, so a running maximum over it pairs two unrelated
   *  mid-transaction swings into a balance it never held: the replay states
   *  no peak for these markets (rails-ops decision 0024). */
  peakWithheldMarkets?: string[];
  /** False turns the anchor OFF: the cut is a plain depth cut, every row below
   *  it is elided and neither `omitted.anchored` nor `omitted.anchoredComplete`
   *  rides. For a caller that does not hold the sender of every row — the
   *  sweep, which reads a sender only for the drawn supply-side rows. Default
   *  true, the Moonwell replay's own switch. */
  anchorWalletRows?: boolean;
  /** A HEAVY wallet's elided history, as the state it left behind — one per
   *  market the wallet touched before the cut (see CometReplaySeed). Each
   *  seeded market's accumulators open from its seed instead of from zero
   *  and `rows` is the tail after the cut. Absent — a sweep, or an index
   *  read that answered in full — the replay is exactly as it was. */
  seeds?: CometReplaySeed[];
  coverage: Pick<ChainTimelineCoverage, "fromBlock" | "toBlock" | "fromDeployment" | "deployBlock" | "gaps" | "source">;
}

/** One market's replay state at a cut, raw and exact — what the API sends a
 *  heavy wallet beside its tail (api/src/routes/baseComet.ts TimelineSeed),
 *  parsed to bigints. Every field is the accumulator it names in
 *  `MarketState`, so a replay that opens from it and walks the tail lands
 *  where a replay over the whole list lands, to the wei: the base is an
 *  unclamped sum, the peaks a running max over it, the collateral its
 *  clamped walk in closed form, the counts counts, and the lifetime flows
 *  the same zero-crossing split run in SQL over the raw deltas. The one
 *  accumulator a seed cannot hand over is the own-transaction SET — it
 *  carries the set's size, and the tail's own set is counted beside it; the
 *  cut is a transaction boundary, so the two never share a member. */
export interface CometReplaySeed {
  market: CometMarket;
  /** Signed running base after the last row before the cut (> 0 lent, < 0
   *  borrowed), raw base-token units. */
  base: bigint;
  /** Highest `base` / highest `−base` reached before the cut, floored at 0.
   *  Raw and NOT dust-clamped — the clamp is applied once, at the edge, on
   *  the whole life. */
  peakLend: bigint;
  peakBorrow: bigint;
  /** Per collateral asset (lowercase address) the wallet ever moved in this
   *  market before the cut: the clamped running balance at the cut and the
   *  highest it reached. */
  collateral: Record<string, { balance: bigint; peak: bigint }>;
  /** AbsorbDebt rows before the cut. */
  absorbs: number;
  /** Distinct own transactions before the cut, the absorb legs excluded. */
  txCount: number;
  /** Rows before the cut, in this replay's own grain (a self-transfer is two). */
  eventCount: number;
  firstBlock: number;
  firstTimestamp: number;
  lastBlock: number;
  lastTimestamp: number;
  /** Gross lifetime flows before the cut, raw, split at the running base's
   *  zero crossings exactly as `splitCompoundBaseFlow` splits them. */
  lifetime: {
    deposited: bigint;
    withdrawn: bigint;
    borrowed: bigint;
    repaid: bigint;
    absorbedDebt: bigint;
    collateral: Record<
      string,
      { supplied: bigint; withdrawn: bigint; absorbed: bigint; received: bigint; sent: bigint }
    >;
  };
}

/**
 * Replay a wallet's decoded Comet rows into the shared timeline shape plus a
 * per-market end state. Every row advances the balances; only the newest
 * `maxRendered` rows whose block was dated are drawn.
 */
export function replayCometRows(p: CometReplayInput): CometChainTimelineResult {
  const { wallet, chainId, rows, metas, timestamps: tsOf, senders: fromOf } = p;
  const cutoff = Math.max(0, rows.length - p.maxRendered);
  const anchorRows = p.anchorWalletRows !== false;
  // The signature fact that anchors a row through the render cut: the wallet
  // signed the transaction itself. Never the event KIND — an absorb is the
  // absorber's transaction, a transfer in is the sender's — and never the
  // counterparty column. The rule and its rationale: rails-ops
  // reference/timeline-attention-budget.md.
  const signedByWallet = (d: CometDecodedRow): boolean => fromOf.get(d.txHash) === wallet;
  const fallback = (address: string): Erc20Meta => ({
    address,
    symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
    decimals: 18,
  });
  const metaOf = (d: CometDecodedRow): Erc20Meta =>
    BASE_KINDS.has(d.kind)
      ? { address: d.market.baseToken.toLowerCase(), symbol: d.market.baseSymbol, decimals: d.market.baseDecimals }
      : (metas.get(d.asset) ?? fallback(d.asset));

  // ── The replay ────────────────────────────────────────────────────────────
  // Per market: the signed base (unclamped) and per-asset collateral (clamped
  // at zero) — the same arithmetic mig 053 does in SQL — plus everything a
  // listing row would carry: peaks, counts, lifetime flows.
  interface MarketState {
    market: CometMarket;
    base: bigint;
    coll: Map<string, bigint>;
    peakLend: bigint;
    peakBorrow: bigint;
    peakColl: Map<string, bigint>;
    absorbs: number;
    /** The own transactions THIS walk saw. A seeded market's count is this
     *  set's size plus `seededTxs`: the cut is a transaction boundary, so no
     *  member of the seed's set can reappear here. */
    txs: Set<string>;
    seededTxs: number;
    first: CometDecodedRow | null;
    last: CometDecodedRow | null;
    /** The seed this market opened from, when it did — its first and last
     *  stamps stand in where the tail has no row to take them from. */
    seed: CometReplaySeed | null;
    lifetime: CompoundLifetimeRaw;
    /** The boundary card's facts for THIS market (rails-ops decision 0019). */
    cutState?: BoundaryStateLine[] | null;
    cutTypes: Map<string, number>;
    cutAssets: Map<string, number>;
    elided: number;
    elidedUpTo: number;
    /** Wallet-signed rows this market drew from below the cut (the anchor). */
    anchoredDrawn: number;
  }
  const states = new Map<string, MarketState>();
  const stateOf = (m: CometMarket): MarketState => {
    let s = states.get(m.key);
    if (!s) {
      s = {
        market: m,
        base: ZERO,
        coll: new Map(),
        peakLend: ZERO,
        peakBorrow: ZERO,
        peakColl: new Map(),
        absorbs: 0,
        txs: new Set(),
        seededTxs: 0,
        first: null,
        last: null,
        seed: null,
        lifetime: newCompoundLifetimeRaw(m.baseDecimals),
        cutTypes: new Map(),
        cutAssets: new Map(),
        elided: 0,
        elidedUpTo: 0,
        anchoredDrawn: 0,
      };
      states.set(m.key, s);
    }
    return s;
  };

  // Seeded markets open with the state the elided rows left, BEFORE the walk
  // — so a market whose whole history sits before the cut is still a
  // position, and every accumulator the tail advances starts where the whole
  // list's walk would have it at the cut. Nothing downstream knows the
  // difference: the positions, the peaks, the counts and the flows read the
  // same fields either way.
  const seeds = p.seeds ?? [];
  for (const seed of seeds) {
    const s = stateOf(seed.market);
    s.base = seed.base;
    s.peakLend = seed.peakLend < ZERO ? ZERO : seed.peakLend;
    s.peakBorrow = seed.peakBorrow < ZERO ? ZERO : seed.peakBorrow;
    for (const [addr, c] of Object.entries(seed.collateral)) {
      s.coll.set(addr, c.balance < ZERO ? ZERO : c.balance);
      s.peakColl.set(addr, c.peak < ZERO ? ZERO : c.peak);
    }
    s.absorbs = seed.absorbs;
    s.seededTxs = seed.txCount;
    s.seed = seed;
    const lt = seed.lifetime;
    s.lifetime.base.deposited = lt.deposited;
    s.lifetime.base.withdrawn = lt.withdrawn;
    s.lifetime.base.borrowed = lt.borrowed;
    s.lifetime.base.repaid = lt.repaid;
    s.lifetime.base.absorbedDebt = lt.absorbedDebt;
    for (const [addr, c] of Object.entries(lt.collateral)) {
      const meta = metas.get(addr) ?? fallback(addr);
      const acc = compoundCollateralFlowsOf(s.lifetime, addr, meta.symbol, meta.decimals);
      acc.supplied = c.supplied;
      acc.withdrawn = c.withdrawn;
      acc.absorbed = c.absorbed;
      acc.received = c.received;
      acc.sent = c.sent;
    }
  }
  const seedEvents = seeds.reduce((n, seed) => n + seed.eventCount, 0);
  const seedLastBlock = seeds.reduce((b, seed) => (seed.lastBlock > b ? seed.lastBlock : b), 0);
  const seedFirstAt = seeds.length > 0 ? Math.min(...seeds.map((seed) => seed.firstTimestamp)) : null;

  // Comet absorbs the whole account in one call — one AbsorbDebt plus one
  // AbsorbCollateral per seized asset, same tx. The debt card states the full
  // absorption, so the collateral legs are grouped by (market, tx) up front.
  const absorbCollByTx = new Map<string, CometDecodedRow[]>();
  for (const d of rows) {
    if (d.kind !== "absorb_collateral") continue;
    const k = `${d.market.key}:${d.txHash}`;
    const list = absorbCollByTx.get(k) ?? [];
    list.push(d);
    absorbCollByTx.set(k, list);
  }
  const usdOf = (raw: bigint | undefined): string | undefined => (raw == null ? undefined : fmtUnits(raw, 8));

  // ── The cut, for the boundary card (rails-ops decision 0019) ─────────────
  // The position after the newest elided row, read the moment the walk reaches
  // the first drawn row and before that row moves anything; the elided rows
  // counted by kind and symbol as they pass. Seeded markets carry a count and
  // no breakdown, so the histograms are withheld rather than stated short.
  const cutTypes = new Map<string, number>();
  const cutAssets = new Map<string, number>();
  let cutState: BoundaryStateLine[] | null | undefined;
  const snapshotMarket = (st: MarketState): BoundaryStateLine[] => {
    const out: BoundaryStateLine[] = [];
    const mk = st.market;
    const dust = dustOf(mk.baseDecimals);
    if (st.base > dust)
      out.push({
        label: `${mk.baseSymbol} supply`,
        value: String(scaleRaw(st.base, mk.baseDecimals)),
        unit: mk.baseSymbol,
      });
    else if (-st.base > dust)
      out.push({
        label: `${mk.baseSymbol} debt`,
        value: String(scaleRaw(-st.base, mk.baseDecimals)),
        unit: mk.baseSymbol,
      });
    for (const [addr, v] of st.coll) {
      if (v <= ZERO) continue;
      const cm = metas.get(addr) ?? fallback(addr);
      // Named by market too: a wallet on two Comets can hold the same
      // collateral in both, and two identical labels would read as one.
      out.push({
        label: `${cm.symbol} collateral · ${mk.label}`,
        value: String(scaleRaw(v, cm.decimals)),
        unit: cm.symbol,
      });
    }
    return out;
  };
  const snapshotAtCut = (): BoundaryStateLine[] | null => {
    const out = [...states.values()].flatMap(snapshotMarket);
    return out.length > 0 ? out : null;
  };

  const events: BaseActivityEvent[] = [];
  let undated = 0;
  // The wallet-wide render cut's ledger, beside each market's own. Below the
  // cut, a wallet-signed row is anchored (drawn anyway, counted in
  // `anchoredDrawn`); an unsigned one is elided (counted in `elided`, its
  // block noted — rows arrive ascending, so the last note is the newest
  // elided block, which is what the disclosure names).
  let anchoredDrawn = 0;
  let elided = 0;
  let elidedUpToBlock = 0;
  rows.forEach((d, i) => {
    const s = stateOf(d.market);
    const meta = metaOf(d);
    const isBase = BASE_KINDS.has(d.kind);
    const m = d.market;
    if (i === cutoff && cutState === undefined) cutState = snapshotAtCut();
    // The anchor decision first, because only an ELIDED row belongs in the
    // ledgers and the histograms: a row counted here AND drawn would make the
    // boundary's pills sum to more than `omitted.count` (decision 0019 leg A).
    const anchored = i < cutoff && anchorRows && signedByWallet(d);
    if (i < cutoff && !anchored) {
      elided++;
      elidedUpToBlock = d.blockNumber;
      cutTypes.set(d.kind, (cutTypes.get(d.kind) ?? 0) + 1);
      cutAssets.set(meta.symbol, (cutAssets.get(meta.symbol) ?? 0) + 1);
      s.elided++;
      s.elidedUpTo = d.blockNumber;
      s.cutTypes.set(d.kind, (s.cutTypes.get(d.kind) ?? 0) + 1);
      s.cutAssets.set(meta.symbol, (s.cutAssets.get(meta.symbol) ?? 0) + 1);
    } else if (i >= cutoff && s.cutState === undefined) {
      // This market's first drawn row past the cut: the state its elided rows
      // left, before this row moves anything. (An anchored row below the cut
      // is not that row — and a market that anchored any withholds the state
      // at its summary, since its drawn list is not contiguous with the cut.)
      const lines = snapshotMarket(s);
      s.cutState = lines.length > 0 ? lines : null;
    }

    // Advance the axis this row touches. Base is signed and unclamped;
    // collateral is clamped — the MV's GREATEST(…, 0).
    let baseAfter: bigint;
    let collAfter: bigint | undefined;
    if (isBase) {
      const before = s.base;
      baseAfter = before + d.delta;
      s.base = baseAfter;
      // Lifetime base flows, split at the zero crossings — Comet's own
      // semantics (a supply into a negative balance repays first; a withdraw
      // past the balance is a borrow) — in raw units, so the split is exact
      // and a whole life is a seed plus a tail. Same decomposition
      // economics.ts runs over the rendered events on Ethereum, here over
      // every row.
      splitCompoundBaseFlow(s.lifetime.base, d.kind, before, d.delta);
    } else {
      const before = s.coll.get(d.asset) ?? ZERO;
      const raw = before + d.delta;
      collAfter = raw < ZERO ? ZERO : raw;
      s.coll.set(d.asset, collAfter);
      baseAfter = s.base;
      addCompoundCollateralFlow(
        compoundCollateralFlowsOf(s.lifetime, d.asset, meta.symbol, meta.decimals),
        d.kind,
        d.delta,
      );
      const peak = s.peakColl.get(d.asset) ?? ZERO;
      if (collAfter > peak) s.peakColl.set(d.asset, collAfter);
    }
    if (baseAfter > s.peakLend) s.peakLend = baseAfter;
    if (-baseAfter > s.peakBorrow) s.peakBorrow = -baseAfter;
    if (d.kind === "absorb_debt") s.absorbs++;
    if (d.kind !== "absorb_debt" && d.kind !== "absorb_collateral") s.txs.add(d.txHash);
    if (!s.first) s.first = d;
    s.last = d;

    // Every row advances the replay; rows past the cutoff are rendered, and
    // so is every older row the wallet signed itself (the anchor) — but only
    // those whose block could actually be dated. An event with no timestamp
    // has no place on a timeline, and inventing one is the failure this whole
    // module is written against.
    const drawn = i >= cutoff || anchored;
    const render = drawn && tsOf.has(d.blockNumber);
    if (drawn && !tsOf.has(d.blockNumber)) undated++;
    if (!render) return;
    if (anchored) {
      anchoredDrawn++;
      s.anchoredDrawn++;
    }

    const txFrom = fromOf.get(d.txHash);
    const ctx: CompoundContext = {
      eventType: d.kind,
      market: m.key,
      marketLabel: m.label,
      assetSymbol: meta.symbol,
      isBase,
      assetsDelta: fmtUnits(d.delta, meta.decimals),
      // The account's running signed base rides on collateral rows too, as it
      // does in the MV, so a collateral card can state the debt its stack
      // stands behind.
      baseAfter: fmtUnits(baseAfter, m.baseDecimals),
      ...(collAfter != null ? { collateralAfter: fmtUnits(collAfter, meta.decimals) } : {}),
      // The wallet's opening row. With a seed the opening row sits before
      // the cut, and no row of the tail is it.
      isOpen: i === 0 && seeds.length === 0,
      ...((d.kind === "supply" || d.kind === "supply_collateral") && txFrom ? { txFrom, funder: d.counterparty } : {}),
      ...(d.kind === "transfer_in" ||
      d.kind === "transfer_out" ||
      d.kind === "transfer_collateral_in" ||
      d.kind === "transfer_collateral_out"
        ? { counterparty: d.counterparty }
        : {}),
      ...(d.kind === "absorb_debt" || d.kind === "absorb_collateral" ? { usdValue: usdOf(d.usdValue) } : {}),
      ...(d.kind === "absorb_debt"
        ? {
            absorbedCollateral: (absorbCollByTx.get(`${m.key}:${d.txHash}`) ?? []).flatMap((leg) => {
              const legMeta = metaOf(leg);
              const legUsd = usdOf(leg.usdValue);
              if (legUsd == null) return [];
              return [{ symbol: legMeta.symbol, amount: fmtUnits(-leg.delta, legMeta.decimals), usdValue: legUsd }];
            }),
          }
        : {}),
    };

    const mag = d.delta < ZERO ? -d.delta : d.delta;
    const flows: AssetFlow[] =
      mag !== ZERO
        ? [
            {
              token: meta.address,
              tokenSymbol: meta.symbol,
              tokenDecimals: meta.decimals,
              amount: mag.toString(),
              amountFormatted: Number(fmtUnits(mag, meta.decimals)),
              direction: OUT_KINDS.has(d.kind) ? "out" : "in",
            },
          ]
        : [];

    events.push({
      id: `${d.txHash}-${d.logIndex}-${d.kind}`,
      txHash: d.txHash,
      blockNumber: d.blockNumber,
      // Never absent on a rendered row — `render` requires it to exist.
      timestamp: tsOf.get(d.blockNumber) ?? 0,
      wallet,
      etherscanUrl: explorerUrl(chainId, "tx-logs", d.txHash),
      actionType: d.kind,
      actionLabel: COMPOUND_EVENT_LABELS[d.kind] ?? d.kind,
      flows,
      context: { protocol: "compound" as const, data: ctx },
    });
  });

  // Per-market end state, in roster order.
  const assetLine = (address: string, raw: bigint): CompoundAssetAmount => {
    const meta = metas.get(address) ?? fallback(address);
    return {
      symbol: meta.symbol,
      address,
      decimals: meta.decimals,
      amount: scaleRaw(raw, meta.decimals),
      amountRaw: raw.toString(),
    };
  };
  const markets: CometMarketReplay[] = p.deployment.markets
    .map((m) => states.get(m.key))
    .filter((s): s is MarketState => s != null)
    .map((s) => {
      const m = s.market;
      const dust = dustOf(m.baseDecimals);
      const clamp = (v: bigint): bigint => (v <= dust ? ZERO : v);
      const withheld = p.peakWithheldMarkets?.includes(m.key) ?? false;
      const peakLend = withheld ? ZERO : clamp(s.peakLend);
      const peakBorrow = withheld ? ZERO : clamp(s.peakBorrow);
      const marketOmitted = (s.seed?.eventCount ?? 0) + s.elided;
      if (s.cutState === undefined) {
        // Never reached a drawn row: the state at the cut is the state now.
        const lines = snapshotMarket(s);
        s.cutState = lines.length > 0 ? lines : null;
      }
      const marketSummary: TimelineCutSummary = {
        // Withheld where this market anchored rows from below the cut: its
        // drawn list is then not contiguous with the cut.
        stateAtCut: s.anchoredDrawn > 0 ? null : (s.cutState ?? null),
        byType: s.seed ? null : bucketsOf(s.cutTypes),
        byAsset: s.seed ? null : bucketsOf(s.cutAssets),
        firstAt: s.seed ? s.seed.firstTimestamp : s.first ? (tsOf.get(s.first.blockNumber) ?? null) : null,
        lastAt: s.elided > 0 ? (tsOf.get(s.elidedUpTo) ?? null) : (s.seed?.lastTimestamp ?? null),
      };
      return {
        market: m.key,
        marketLabel: m.label,
        comet: m.comet,
        ...(marketOmitted > 0
          ? {
              omitted: {
                count: marketOmitted,
                upToBlock: s.elided > 0 ? s.elidedUpTo : (s.seed?.lastBlock ?? 0),
                summary: marketSummary,
                // Present even at 0 and even beside this market's seed —
                // the anchor stays on over the tail; the flag says whether
                // the count is the whole set, and it is not behind a seed,
                // whose rows were not here to anchor.
                ...(anchorRows ? { anchored: s.anchoredDrawn, anchoredComplete: s.seed == null } : {}),
              },
            }
          : {}),
        base: { amount: scaleRaw(s.base, m.baseDecimals), amountRaw: s.base.toString() },
        collateral: [...s.coll.entries()].filter(([, v]) => v > ZERO).map(([a, v]) => assetLine(a, v)),
        peak: {
          lentBase: scaleRaw(peakLend, m.baseDecimals),
          lentBaseRaw: peakLend.toString(),
          borrowedBase: scaleRaw(peakBorrow, m.baseDecimals),
          borrowedBaseRaw: peakBorrow.toString(),
          collateral: withheld
            ? []
            : [...s.peakColl.entries()].filter(([, v]) => v > ZERO).map(([a, v]) => assetLine(a, v)),
        },
        liquidationCount: s.absorbs,
        everLiquidated: s.absorbs > 0,
        txCount: s.seededTxs + s.txs.size,
        // The position's own first and last event. A seed carries both from
        // before the cut, and the tail can only push the last one forward.
        firstEventAt: s.seed ? s.seed.firstTimestamp : s.first ? (tsOf.get(s.first.blockNumber) ?? null) : null,
        lastActivityAt: s.last ? (tsOf.get(s.last.blockNumber) ?? null) : (s.seed?.lastTimestamp ?? null),
        // Scaled ONCE here, at the edge; the raw twin is the exact total.
        lifetime: scaleCompoundLifetime(s.lifetime),
        lifetimeRaw: compoundLifetimeRawToWire(s.lifetime),
      };
    });

  // Every seeded row is omitted from the drawn list — it was replayed into
  // the seed, not sent — and with seeds the wallet's first event sits before
  // the cut, so it is the earliest seeded market's own first stamp. Omitted is
  // the ELIDED rows plus the seeds': an anchored row below the cut is drawn,
  // so it is neither omitted nor in the histograms.
  const omitted = seedEvents + elided;
  const omittedUpTo = elided > 0 ? elidedUpToBlock : seedLastBlock;
  if (cutState === undefined) cutState = snapshotAtCut();
  const seedLastAt = seeds.length > 0 ? Math.max(...seeds.map((seed) => seed.lastTimestamp)) : null;
  const cutSummary: TimelineCutSummary = {
    // Withheld where anchoring drew wallet-signed rows from BELOW the cut —
    // the drawn list is then not contiguous with the cut and no one block is
    // "before the oldest drawn row".
    stateAtCut: anchoredDrawn > 0 ? null : cutState,
    byType: seeds.length > 0 ? null : bucketsOf(cutTypes),
    byAsset: seeds.length > 0 ? null : bucketsOf(cutAssets),
    firstAt: seedFirstAt ?? (rows.length > 0 ? (tsOf.get(rows[0].blockNumber) ?? null) : null),
    lastAt: elided > 0 ? (tsOf.get(elidedUpToBlock) ?? null) : seedLastAt,
  };
  const coverage: ChainTimelineCoverage = {
    ...p.coverage,
    firstEventAt: seedFirstAt ?? (rows.length > 0 ? (tsOf.get(rows[0].blockNumber) ?? null) : null),
    // `anchored` rides whenever the anchor is on — even at 0, and even beside
    // seeds: it is the count of wallet-signed rows this replay drew from
    // below the cut, and the anchor stays on over the tail behind a seed.
    // Whether that count is the WHOLE set — the guarantee "everything the
    // wallet signed is drawn" — is `anchoredComplete`: true when every row
    // below the cut was here to anchor, false beside any seed, whose rows
    // were replayed into it and never here, so a wallet-signed row among
    // them is not drawn (lib/api/fetch-chain-timeline.ts states both).
    ...(omitted > 0
      ? {
          omitted: {
            count: omitted,
            upToBlock: omittedUpTo,
            summary: cutSummary,
            ...(anchorRows ? { anchored: anchoredDrawn, anchoredComplete: seeds.length === 0 } : {}),
          },
        }
      : {}),
    ...(undated > 0 ? { undated } : {}),
  };

  return { wallet, events, totalEvents: events.length, markets, coverage };
}
