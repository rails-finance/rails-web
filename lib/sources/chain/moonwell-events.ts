// A wallet's WHOLE LIFE on a Moonwell deployment, read from the chain's own logs.
// ----------------------------------------------------------------------------
// The Ethereum explorer gets this from an index: rails-server captures every
// mToken event and `mv_moonwell_events` (mig 098) replays the three lanes —
// supply principal, the exact mToken balance, the emitted debt — and the web
// route only does presentation. On Base there is no index, so this module is
// both halves, and it emits the exact `MvRow` shape the index route emits, so
// the presentation transform, the event card, its detail grid, its explainer
// and the economics tower are the Ethereum ones, reused rather than forked.
//
// WHY THIS CANNOT BE THE AAVE SWEEP WITH DIFFERENT TOPICS
//
// A Compound v2 market indexes nothing on its own events. `Mint(minter, …)`,
// `Redeem(redeemer, …)`, `Borrow(borrower, …)`, `RepayBorrow(payer, borrower,
// …)` and `LiquidateBorrow(liquidator, borrower, …)` all carry the account in
// the DATA, and a log filter cannot see into data. Verified on this
// deployment's own logs (2026-08-25): every one of those events has exactly one
// topic. Only the mToken's ERC-20 `Transfer` indexes its parties, and a
// transfer is emitted for mints, redeems, seizes and custody moves — never for
// a borrow or a repayment. Sweeping the mTokens per wallet therefore finds the
// supply side and loses the debt side, and sweeping every mToken event on the
// chain and filtering by data is millions of logs per request.
//
// WHAT IS INDEXED INSTEAD
//
// Every account action on a Moonwell market passes through a Comptroller hook,
// and every hook asks the MultiRewardDistributor to settle the account's
// rewards for that market — on a mint, a redeem, a borrow, a repayment (for the
// BORROWER, whoever paid), a liquidation (for the borrower and the liquidator)
// and both sides of a transfer. The distributor emits
// `DisbursedSupplierRewards(mToken, account, emissionToken, amount)` and
// `DisbursedBorrowerRewards(…)` with the account INDEXED, once per reward
// config on the market, unconditionally. That is the anchor: one sweep of the
// distributor's logs for the wallet in topic 2 names every block and
// transaction in which the wallet's standing on any market moved. Each of
// those transactions is then expanded — its receipt read and every mToken log
// in it decoded — which is where the amounts come from.
//
// Measured against the alternative rather than reasoned about: over 100,000
// blocks (2,065 distinct accounts, 24,176 mToken logs read exhaustively), the
// anchor missed ZERO transactions. The catalog records the two facts that make
// it complete over the deployment's whole life — one distributor ever, and a
// reward config on every market from its listing block.
//
// WHAT THE REPLAY MEANS, lane by lane — the same grading as the index, because
// the receipts downstream state it:
//   • supply principal — Σ(mint − redeem) in underlying, clamped at zero. No
//     slot holds it; a full exit nets negative by exactly the interest earned.
//   • mToken balance — Σ over every Transfer touching the wallet, EXACT: it
//     equals the mToken's own `balanceOf` at every block. Checked here against
//     the head on real accounts (see the commit).
//   • debt — NOT summed. Borrow and RepayBorrow emit `accountBorrows`, the
//     contract's own reckoning of the total debt after the event with interest
//     to that moment included, and the row carries it verbatim.
//
// One thing the index does not do and this reader does: a liquidation seizes
// the borrower's collateral mTokens in TWO transfers — the liquidator's share,
// and the protocol's own cut, transferred to the mToken itself. The index
// excludes every wallet→mToken transfer as a redeem companion; that rule would
// drop the protocol's cut and leave the mToken lane above `balanceOf` after
// every liquidation. Here a wallet→mToken transfer in a transaction that
// liquidated this wallet on that collateral is kept, as a transfer out to the
// market, so the lane stays exact.
//
// Coverage travels with the data, as on every swept explorer, and it has one
// more edge than the Aave sweep: expansion is capped. A strategy contract with
// thousands of transactions cannot have every receipt read in one request, so
// the newest ones are expanded first and the cut is stated as a HORIZON — the
// history starts later than the deployment, and the page says from when.
//
// TWO HALVES. The CAPTURE (anchor sweep, receipt expansion, `rowsOfReceipt`)
// is this module's; the REPLAY (`replayMoonwellRows`) is shared with
// lib/sources/api/moonwell-base-timeline.ts, which takes the same decoded rows
// from the Base box's index instead of the chain. Same replay, same rows in →
// same events, running balances, lifetime flows, peaks and positions out;
// only `coverage.source` says which half captured them.
//
// SERVER-ONLY.

import { decodeEventLog, parseAbi, toEventSelector } from "viem";
import { chainBatchClient, chainLogsClient } from "./rpc";
import { addressTopic, mergeGaps, splitCoverage, sweepLogs, type BlockRange } from "./log-sweep";
import { resolveMoonwellRoster, type MoonwellRoster } from "./moonwell-roster";
import { inPacedGroups } from "./sweep-metadata";
import { buildMoonwellTimeline, type MvOracleAtBlock, type MvRow } from "@/lib/sources/api/moonwell-timeline";
import { bucketsOf, type BoundaryStateLine, type TimelineCutSummary } from "@/lib/shared/timeline-boundary";
import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import type { MoonwellDeployment, MoonwellMarket } from "@/lib/moonwell/asset-catalog";
import type {
  MoonwellChainTimelineResponse,
  MoonwellLifetimeFlows,
  MoonwellLifetimeFlowsRaw,
  MoonwellReplayedPosition,
} from "@/lib/moonwell-base/chain-timeline";
import type { MoonwellEventType } from "@/lib/shared/types/event-shape";

const MTOKEN_EVENTS_ABI = parseAbi([
  "event Mint(address minter, uint256 mintAmount, uint256 mintTokens)",
  "event Redeem(address redeemer, uint256 redeemAmount, uint256 redeemTokens)",
  "event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)",
  "event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)",
  "event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address mTokenCollateral, uint256 seizeTokens)",
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
]);

const COMPTROLLER_ABI = parseAbi(["function rewardDistributor() view returns (address)"]);

// Topic-0s DERIVED from the signatures rather than pasted, so an edited
// signature can never leave a stale hash silently matching nothing.
const TOPIC0 = {
  Mint: toEventSelector("Mint(address,uint256,uint256)"),
  Redeem: toEventSelector("Redeem(address,uint256,uint256)"),
  Borrow: toEventSelector("Borrow(address,uint256,uint256,uint256)"),
  RepayBorrow: toEventSelector("RepayBorrow(address,address,uint256,uint256,uint256)"),
  LiquidateBorrow: toEventSelector("LiquidateBorrow(address,address,uint256,address,uint256)"),
  Transfer: toEventSelector("Transfer(address,address,uint256)"),
  // The distributor's two account-indexed events — the sweep's anchor.
  DisbursedSupplierRewards: toEventSelector("DisbursedSupplierRewards(address,address,address,uint256)"),
  DisbursedBorrowerRewards: toEventSelector("DisbursedBorrowerRewards(address,address,address,uint256)"),
} as const;

const ZERO = BigInt(0);

/** How many anchored transactions get their receipts read. Set by the paced
 *  read rate (about twenty a second on the free tier), not by the sweep: 300
 *  receipts is roughly fifteen seconds. Every receipt is a whole transaction,
 *  so the rows this yields are typically several times this number. */
const MAX_EXPANDED_TXS = 300;

/** How many rows get RENDERED. The replay and the lifetime sums run over every
 *  expanded row; only the drawn list, which costs a block timestamp per row,
 *  is capped — and the coverage says by how much. */
const MAX_RENDERED_EVENTS = 250;

/** One event this wallet is the OWNER of, decoded — what the capture half
 *  hands the replay. The sweep decodes receipts into these; the index route
 *  hands them over already in this shape (with the gas Sieve holds). */
export interface MoonwellDecodedRow {
  blockNumber: number;
  txIndex: number;
  logIndex: number;
  txHash: string;
  txFrom: string;
  kind: MoonwellEventType;
  /** The mToken address — the market key on this deployment. */
  market: string;
  caller?: string;
  amount?: bigint;
  mTokens?: bigint;
  accountBorrows?: bigint;
  collateralMarket?: string;
  seizeTokens?: bigint;
  liquidator?: string;
  /** Known to the index (Sieve's receipt context); a receipt the sweep reads
   *  carries them too, but the sweep's rows never did and the cards do not
   *  need them, so they stay optional. */
  txGasUsed?: string | null;
  txGasPrice?: string | null;
  /** The Comptroller's own oracle state at this row's block (mig 195), when
   *  the index carries it; the sweep never does. Passed through to the card
   *  builder verbatim. */
  oracleAtBlock?: MvOracleAtBlock | null;
}
type Row = MoonwellDecodedRow;

/**
 * Which side of an mToken Transfer this wallet is on, and whether the row is
 * a custody move at all — the rule both captures apply to a raw transfer:
 *   • a wallet→mToken (or →router) transfer is the companion of a Redeem and
 *     is dropped — UNLESS `protocolCut` says this transaction liquidated the
 *     wallet on this very collateral, in which case it is the protocol's cut
 *     of the seize and the mToken lane needs it to stay exact;
 *   • an mToken→wallet (or router→) transfer is the mint leg, dropped;
 *   • a self-transfer moves nothing.
 * Returns null for a row the replay must not see.
 */
export function transferKind(p: {
  from: string;
  to: string;
  wallet: string;
  protocolLegs: ReadonlySet<string>;
  protocolCut: boolean;
}): "transfer_in" | "transfer_out" | null {
  if (p.from === p.to) return null;
  if (p.from === p.wallet) return p.protocolLegs.has(p.to) && !p.protocolCut ? null : "transfer_out";
  if (p.to === p.wallet) return p.protocolLegs.has(p.from) ? null : "transfer_in";
  return null;
}

/** The roster as the replay keys it — by mToken address, the market key on
 *  a swept deployment; the collateral factor is not this reader's to state. */
export function marketMapFromRoster(roster: MoonwellRoster): Map<string, MoonwellMarket> {
  return new Map<string, MoonwellMarket>(
    roster.markets.map((m) => [
      m.mtoken,
      {
        key: m.key,
        symbol: m.symbol,
        mSymbol: `m${m.symbol}`,
        mtoken: m.mtoken,
        underlying: m.underlying,
        decimals: m.decimals,
        // Not a fact this reader states; the position read carries the live one.
        collateralFactor: 0,
      },
    ]),
  );
}

interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
  logIndex: number;
  transactionIndex: number;
  blockNumber: bigint;
  transactionHash: string;
}

type DecodedArgs = Record<string, unknown>;

function decodeMTokenLog(log: ReceiptLog): { eventName: string; args: DecodedArgs } | null {
  try {
    return decodeEventLog({
      abi: MTOKEN_EVENTS_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    }) as { eventName: string; args: DecodedArgs };
  } catch {
    // A log whose shape doesn't decode is not silently reshaped into an event.
    return null;
  }
}

const lower = (a: unknown): string => String(a).toLowerCase();

/**
 * Every row this wallet is the OWNER of in one transaction — the mint/redeem
 * router resolution and the transfer-leg exclusions exactly as mig 098 does
 * them, plus the liquidation protocol-cut rule described at the top.
 */
function rowsOfReceipt(
  logs: ReceiptLog[],
  txFrom: string,
  wallet: string,
  mtokens: Set<string>,
  router: string,
): Row[] {
  const protocolLegs = new Set<string>([...mtokens, router]);
  const decoded: { log: ReceiptLog; eventName: string; args: DecodedArgs }[] = [];
  for (const log of logs) {
    if (!mtokens.has(log.address.toLowerCase())) continue;
    const d = decodeMTokenLog(log);
    if (d) decoded.push({ log, ...d });
  }
  decoded.sort((a, b) => a.log.logIndex - b.log.logIndex);

  const transfers = decoded.filter((d) => d.eventName === "Transfer");
  // Which collateral markets a liquidation of THIS wallet seized in this tx —
  // the one case a wallet→mToken transfer is not a redeem companion.
  const seizedFromWallet = new Set<string>();
  for (const d of decoded) {
    if (d.eventName === "LiquidateBorrow" && lower(d.args.borrower) === wallet) {
      seizedFromWallet.add(lower(d.args.mTokenCollateral));
    }
  }

  const rows: Row[] = [];
  for (const { log, eventName, args } of decoded) {
    const market = log.address.toLowerCase();
    const base = {
      blockNumber: Number(log.blockNumber),
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      txHash: log.transactionHash.toLowerCase(),
      txFrom,
      market,
    };
    switch (eventName) {
      case "Mint": {
        const minter = lower(args.minter);
        let owner = minter;
        if (minter === router) {
          // The router-leg Transfer AFTER the mint, router → owner.
          const leg = transfers.find(
            (t) =>
              t.log.address.toLowerCase() === market && lower(t.args.from) === router && t.log.logIndex > log.logIndex,
          );
          if (leg) owner = lower(leg.args.to);
        }
        if (owner !== wallet) break;
        rows.push({
          ...base,
          kind: "mint",
          caller: minter,
          amount: args.mintAmount as bigint,
          mTokens: args.mintTokens as bigint,
        });
        break;
      }
      case "Redeem": {
        const redeemer = lower(args.redeemer);
        let owner = redeemer;
        if (redeemer === router) {
          // The router-leg Transfer BEFORE the redeem, owner → router.
          const leg = [...transfers]
            .reverse()
            .find(
              (t) =>
                t.log.address.toLowerCase() === market && lower(t.args.to) === router && t.log.logIndex < log.logIndex,
            );
          if (leg) owner = lower(leg.args.from);
        }
        if (owner !== wallet) break;
        rows.push({
          ...base,
          kind: "redeem",
          caller: redeemer,
          amount: args.redeemAmount as bigint,
          mTokens: args.redeemTokens as bigint,
        });
        break;
      }
      case "Borrow": {
        if (lower(args.borrower) !== wallet) break;
        rows.push({
          ...base,
          kind: "borrow",
          amount: args.borrowAmount as bigint,
          accountBorrows: args.accountBorrows as bigint,
        });
        break;
      }
      case "RepayBorrow": {
        if (lower(args.borrower) !== wallet) break;
        rows.push({
          ...base,
          kind: "repay",
          caller: lower(args.payer),
          amount: args.repayAmount as bigint,
          accountBorrows: args.accountBorrows as bigint,
        });
        break;
      }
      case "LiquidateBorrow": {
        if (lower(args.borrower) !== wallet) break;
        const liquidator = lower(args.liquidator);
        rows.push({
          ...base,
          kind: "liquidation",
          caller: liquidator,
          amount: args.repayAmount as bigint,
          collateralMarket: lower(args.mTokenCollateral),
          seizeTokens: args.seizeTokens as bigint,
          liquidator,
        });
        break;
      }
      case "Transfer": {
        const from = lower(args.from);
        const to = lower(args.to);
        const amount = args.amount as bigint;
        // A wallet→mToken transfer is the companion of a Redeem — unless this
        // transaction liquidated the wallet on this very collateral, in which
        // case it is the protocol's cut of the seize and the lane needs it.
        const kind = transferKind({
          from,
          to,
          wallet,
          protocolLegs,
          protocolCut: to === market && seizedFromWallet.has(market),
        });
        if (kind === "transfer_out") rows.push({ ...base, kind, caller: to, mTokens: amount });
        else if (kind === "transfer_in") rows.push({ ...base, kind, caller: from, mTokens: amount });
        break;
      }
    }
  }
  return rows;
}

export interface LoadMoonwellChainEventsParams {
  wallet: string;
  deployment: MoonwellDeployment;
  /** The Comptroller's own first block — the floor of a whole-life sweep. */
  deployBlock: number;
  /** The MultiRewardDistributor the catalog names. The live one is read too
   *  and both are swept, so a governance swap widens the sweep. */
  rewardDistributor: string;
  /** The WETH Router whose emitted minter/redeemer means "routed". */
  router: string;
  /** The server's plumbing flag for this wallet, as the index answer carried
   *  it before it fell back here; the replay then states no peak (see
   *  MoonwellReplayInput). */
  peakWithheld?: boolean;
}

/**
 * Read every Moonwell event this wallet is the owner of, from the Comptroller's
 * first block to the chain head, and replay them into the shared timeline shape.
 */
export async function loadMoonwellEventsFromChain(
  p: LoadMoonwellChainEventsParams,
): Promise<MoonwellChainTimelineResponse> {
  const wallet = p.wallet.toLowerCase();
  const router = p.router.toLowerCase();
  const chainId = p.deployment.chainId;
  const logsClient = chainLogsClient(chainId);
  // Receipts and block timestamps go to the STATE endpoint, paced — the
  // history gateway throttles an address hard once a sweep has run through it.
  const stateClient = chainBatchClient(chainId);

  const roster = await resolveMoonwellRoster(p.deployment);
  if (!roster) throw new Error("Moonwell roster could not be read — the market list is the Comptroller's to state");
  const marketByMtoken = marketMapFromRoster(roster);
  const mtokens = new Set(marketByMtoken.keys());

  const [head, liveDistributor] = await Promise.all([
    stateClient.getBlockNumber().then(Number),
    stateClient
      .readContract({
        address: p.deployment.comptroller as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: "rewardDistributor",
      })
      .then((a) => String(a).toLowerCase())
      .catch(() => null),
  ]);
  const distributors = [...new Set([p.rewardDistributor.toLowerCase(), ...(liveDistributor ? [liveDistributor] : [])])];
  const range: BlockRange = { from: p.deployBlock, to: head };

  // ── The anchor sweep ─────────────────────────────────────────────────────
  const anchor = await sweepLogs(
    logsClient,
    {
      address: distributors,
      topics: [[TOPIC0.DisbursedSupplierRewards, TOPIC0.DisbursedBorrowerRewards], null, addressTopic(wallet)],
    },
    range,
  );

  // Transactions to expand, grouped by block and taken NEWEST FIRST, so that
  // when the cap bites what goes unread is the oldest stretch — a horizon the
  // page can state, not a hole in the middle. The cut lands on a block
  // boundary: half-expanding a block would leave that block's balances wrong.
  const txBlock = new Map<string, number>();
  for (const log of anchor.logs) txBlock.set(log.transactionHash.toLowerCase(), Number(log.blockNumber));
  const byBlock = new Map<number, string[]>();
  for (const [tx, b] of txBlock) byBlock.set(b, [...(byBlock.get(b) ?? []), tx]);
  const blocksDesc = [...byBlock.keys()].sort((a, b) => b - a);
  const expand: { tx: string; block: number }[] = [];
  let expansionFloor: number | null = null; // set only when the cap cut something off
  for (const b of blocksDesc) {
    const txs = byBlock.get(b)!;
    if (expand.length + txs.length > MAX_EXPANDED_TXS && expand.length > 0) {
      expansionFloor = expand[expand.length - 1].block;
      break;
    }
    for (const tx of txs) expand.push({ tx, block: b });
  }

  // ── Expansion: one receipt per transaction, paced ────────────────────────
  const receipts = new Map<string, { from: string; logs: ReceiptLog[] }>();
  const unexpanded = await inPacedGroups(expand, async ({ tx }) => {
    const r = await stateClient.getTransactionReceipt({ hash: tx as `0x${string}` });
    receipts.set(tx, {
      from: r.from.toLowerCase(),
      logs: r.logs.map((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: l.logIndex,
        transactionIndex: l.transactionIndex,
        blockNumber: l.blockNumber,
        transactionHash: l.transactionHash,
      })),
    });
  });

  const decoded: Row[] = [];
  for (const [, r] of receipts) decoded.push(...rowsOfReceipt(r.logs, r.from, wallet, mtokens, router));
  decoded.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
  const seen = new Set<string>();
  const rows = decoded.filter((d) => {
    const k = `${d.txHash}-${d.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ── Coverage ─────────────────────────────────────────────────────────────
  // The sweep's own horizon and holes, then the expansion cap on top: a capped
  // expansion moves the floor up to the oldest block that WAS expanded, and
  // any sweep hole below that floor no longer matters. A receipt that would
  // not answer is a hole at its own block — its events are missing from the
  // middle of the history.
  const { horizonTo, holes: sweepHoles } = splitCoverage(anchor.gaps, range.from);
  let floor = horizonTo != null ? horizonTo + 1 : range.from;
  if (expansionFloor != null && expansionFloor > floor) floor = expansionFloor;
  const holes = mergeGaps(
    [...sweepHoles, ...unexpanded.map(({ block }) => ({ from: block, to: block }))]
      .filter((g) => g.to >= floor)
      .map((g) => ({ from: Math.max(g.from, floor), to: g.to })),
  );

  // ── Dating: one block read per rendered row, paced ───────────────────────
  const tsOf = new Map<number, number>();
  await inPacedGroups(blocksToDate(rows, MAX_RENDERED_EVENTS, wallet), async (b) => {
    tsOf.set(b, Number((await stateClient.getBlock({ blockNumber: BigInt(b) })).timestamp));
  });

  return replayMoonwellRows({
    wallet,
    chainId,
    router,
    rows,
    marketByMtoken,
    timestamps: tsOf,
    maxRendered: MAX_RENDERED_EVENTS,
    peakWithheld: p.peakWithheld ?? false,
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

/** The signature fact that anchors a row through the render cut: the wallet
 *  signed the transaction itself. Never the event KIND — a seize is a
 *  transfer_out on the borrower that the borrower never signed, and a
 *  liquidation's repay leg names a payer the borrower never chose. The rule
 *  and its rationale: rails-ops reference/timeline-attention-budget.md. */
function signedByWallet(d: MoonwellDecodedRow, wallet: string): boolean {
  return d.txFrom.toLowerCase() === wallet;
}

/**
 * The blocks a replay over `rows` needs dated: every rendered row's — the
 * newest `maxRendered` plus every anchored (wallet-signed) row below that
 * cut — plus the first and last rows' so the coverage can name the earliest
 * event and the last activity whatever the cut.
 */
export function blocksToDate(rows: readonly MoonwellDecodedRow[], maxRendered: number, wallet: string): number[] {
  const cutoff = Math.max(0, rows.length - maxRendered);
  return [
    ...new Set([
      ...rows.slice(cutoff).map((d) => d.blockNumber),
      ...rows
        .slice(0, cutoff)
        .filter((d) => signedByWallet(d, wallet))
        .map((d) => d.blockNumber),
      ...(rows.length > 0 ? [rows[0].blockNumber, rows[rows.length - 1].blockNumber] : []),
    ]),
  ];
}

/** One market's DEBT LANE before the rows the index sent — what rails-server
 *  aggregates per request for a HEAVY wallet whose whole history it cannot
 *  read inside its statement timeout (api/src/routes/baseMoonwell.ts,
 *  `heavy.seeds`), and what it still sends beside a full seed.
 *
 *  This lane can be aggregated per request because of its own shape: a
 *  Compound v2 market emits `accountBorrows` — the debt after the event, with
 *  interest to that moment — on every Borrow and RepayBorrow, so the debt at
 *  the cut is the LAST such figure and the peak is a `max()`. Neither is a sum
 *  over the elided rows, so neither costs a walk of them. Every other lane
 *  here IS a running sum over every row (the supply principal, the mToken
 *  balance, the lifetime flows, the counts), and those the index cannot
 *  afford per request. When this is ALL that travels the reply is a HORIZON,
 *  and the coverage it arrives with says so — `fromDeployment: false` from
 *  the cut's block, which is the flag the page reads to withhold the peaks,
 *  the transaction count and the whole lifetime layer. */
export interface MoonwellReplaySeed {
  /** The mToken address, lowercase — the market key on this deployment. */
  market: string;
  /** `accountBorrows` at the last borrow or repayment before the cut. */
  debtRaw: bigint;
  /** The highest `accountBorrows` emitted before the cut. */
  peakDebtRaw: bigint;
}

/** The five lifetime legs as the replay accumulates them: raw underlying wei,
 *  exact. `repaid` is GROSS here — every RepayBorrow, the liquidations' own
 *  debt legs included; the carve-out that leaves only voluntary repayments is
 *  applied once, over the whole life, at the edge. */
export interface MoonwellLifetimeRaw {
  supplied: bigint;
  withdrawn: bigint;
  borrowed: bigint;
  repaid: bigint;
  liquidatedDebt: bigint;
}

/** One market's WHOLE replay state before the rows the index sent — what a
 *  stored seed carries (api/src/routes/baseMoonwell.ts `heavy.seed`, mig
 *  204), computed offline at a block-boundary cut where a per-request
 *  aggregate could not afford it. Every accumulator the tail advances opens
 *  from here: the supply principal and the mToken balance are the clamped
 *  walk in closed form (b = S − least(0, min S)) and their peaks its running
 *  max, the debt lane is the market's own last figure, the lifetime flows
 *  raw sums. A replay opened from this over the tail lands where a replay
 *  over the whole list lands, to the wei. */
export interface MoonwellReplaySeedMarket extends MoonwellReplaySeed {
  /** Σ mint − Σ redeem in underlying wei, clamped at zero after every row. */
  supplyRaw: bigint;
  /** The highest the clamped supply principal reached before the cut. */
  peakSupplyRaw: bigint;
  /** The mToken balance after the last row before the cut, over every
   *  custody move the reader keeps (8 dp). */
  mTokensRaw: bigint;
  lifetime: MoonwellLifetimeRaw;
}

/** The whole seed: the wallet-wide scalars plus every market's state. The
 *  one accumulator a seed cannot hand over is the own-transaction SET — it
 *  carries the set's size, and the tail's own set is counted beside it; the
 *  cut is a block boundary, so the two never share a member. */
export interface MoonwellReplayWholeSeed {
  /** Rows before the cut — every one of them omitted from the drawn list. 0
   *  means the wallet had no row before the cut: `markets` is then empty and
   *  the stamps below are not facts. */
  events: number;
  /** Distinct own transactions before the cut, liquidations excluded. */
  txCount: number;
  /** Liquidation rows before the cut. */
  liquidations: number;
  firstBlock: number;
  firstTimestamp: number;
  lastBlock: number;
  /** For a wallet dormant since before the cut (an empty tail): the replay's
   *  lastActivityAt is then this. */
  lastTimestamp: number;
  markets: MoonwellReplaySeedMarket[];
}

export interface MoonwellReplayInput {
  wallet: string;
  chainId: MoonwellDeployment["chainId"];
  /** The WETH Router, lowercased — the event card names a routed caller. */
  router: string;
  /** Every row the wallet owns, sorted (block, tx, log), deduplicated. With
   *  `seeds` or `seed`, the wallet's NEWEST rows only — the tail past the
   *  cut. */
  rows: MoonwellDecodedRow[];
  /** The debt lane's state per market before `rows`, when the index sent a
   *  tail from a horizon. Absent — the sweep, and every wallet the index
   *  answers in full — leaves the replay exactly as it was. Ignored when
   *  `seed` is given: the whole seed carries the same lane. */
  seeds?: MoonwellReplaySeed[];
  /** The replay's WHOLE state before `rows`, when the index sent a stored
   *  seed beside the tail. Every accumulator opens from it, the counts and
   *  the stamps include it, and the coverage the caller passes says
   *  `fromDeployment: true` — nothing is missing from the record, the elided
   *  part travelled as state. */
  seed?: MoonwellReplayWholeSeed;
  marketByMtoken: Map<string, MoonwellMarket>;
  /** Unix seconds by block, for at least `blocksToDate(rows, maxRendered)`;
   *  a rendered row whose block is missing here is counted `undated`. */
  timestamps: Map<number, number>;
  /** How many of the newest rows are drawn; the replay runs over all. Rows
   *  the wallet signed itself are ANCHORED — drawn however far below this cut
   *  they sit — so a stretch of keeper churn can never push the owner's own
   *  actions off the list (rails-ops reference/timeline-attention-budget.md). */
  maxRendered: number;
  /** False turns the anchor OFF: the cut is a plain depth cut, every row below
   *  it is elided and neither `omitted.anchored` nor `omitted.anchoredComplete`
   *  rides. Only for a caller whose
   *  cut is not a render budget at all — the grouped Moonwell Base answer, whose
   *  row cap already falls at a block boundary with every event above it served
   *  in a row or a folder (lib/moonwell-base/timeline-folders.ts). Default true. */
  anchorWalletRows?: boolean;
  /** Set when the server flags this wallet as a router/relay (rails-server mig
   *  269). Its history is round trips inside one transaction, so a running
   *  maximum over it pairs two unrelated mid-transaction swings into a balance
   *  it never held: the replay states no peak (rails-ops decision 0024). */
  peakWithheld?: boolean;
  /** What the capture is a complete record of — the replay adds the dated
   *  facts (firstEventAt, omitted, undated) on top. */
  coverage: Pick<
    ChainTimelineCoverage,
    "fromBlock" | "toBlock" | "fromDeployment" | "deployBlock" | "gaps" | "source" | "fill"
  >;
}

/**
 * Replay a wallet's decoded rows into the shared timeline shape — the three
 * lanes, the lifetime flows, the peaks, the positions and the rendered event
 * cards. Pure over its input: the sweep and the index read call this with
 * rows from different captures and get byte-identical results for the same
 * rows.
 */
export function replayMoonwellRows(p: MoonwellReplayInput): MoonwellChainTimelineResponse {
  const { wallet, chainId, router, rows, marketByMtoken, timestamps: tsOf } = p;
  const supplyRaw = new Map<string, bigint>();
  const mtokRaw = new Map<string, bigint>();
  const debtRaw = new Map<string, bigint>();
  const bump = (m: Map<string, bigint>, key: string, delta: bigint): { before: bigint; after: bigint } => {
    const before = m.get(key) ?? ZERO;
    const raw = before + delta;
    const after = raw < ZERO ? ZERO : raw;
    m.set(key, after);
    return { before, after };
  };

  // The lifetime flows accumulate as BIGINTS in raw underlying wei and are
  // scaled ONCE at the edge, so the totals are exact — which is what lets a
  // stored seed's raw sums open them, and a SQL SUM over the same rows land
  // on the same integers. Keyed by market key, the tower's own key.
  const lifetimeRaw = new Map<string, { market: MoonwellMarket; legs: MoonwellLifetimeRaw }>();
  const flowsFor = (m: MoonwellMarket): MoonwellLifetimeRaw => {
    let cur = lifetimeRaw.get(m.key);
    if (!cur) {
      cur = {
        market: m,
        legs: { supplied: ZERO, withdrawn: ZERO, borrowed: ZERO, repaid: ZERO, liquidatedDebt: ZERO },
      };
      lifetimeRaw.set(m.key, cur);
    }
    return cur.legs;
  };

  const cutoff = Math.max(0, rows.length - p.maxRendered);
  const anchorRows = p.anchorWalletRows !== false;

  // The highest running supply principal and the highest emitted debt per
  // market — noted after every row, so a closed account's card can say what
  // it held at its height — and the wallet's own transactions (a liquidation
  // is the liquidator's, not the owner's).
  const peakSupplyRaw = new Map<string, bigint>();
  const peakDebtRaw = new Map<string, bigint>();
  const ownTxs = new Set<string>();
  const notePeak = (m: Map<string, bigint>, key: string, v: bigint): void => {
    if ((m.get(key) ?? ZERO) < v) m.set(key, v);
  };

  // What travelled as state before the tail. Two shapes:
  //   • the WHOLE seed: every market opens with its supply principal, mToken
  //     balance, debt, both peaks and its raw lifetime legs, and the wallet's
  //     own counts and stamps carry over — the tail walks from there and
  //     lands where a replay over the whole list lands;
  //   • the debt-only seeds (a horizon): a seeded market opens with the debt
  //     the market itself emitted before the cut, so the first Borrow or
  //     RepayBorrow in the tail is read against the debt it was actually
  //     taken against — and a market whose borrowing all sits before the cut
  //     is still a position, with its debt and its peak stated. The supply
  //     and mToken lanes open at zero, the coverage this reply carries is a
  //     horizon, and the page's `sweptClean` gate withholds the lifetime
  //     layer that would read a window as a life.
  // A seeded market the roster does not name is dropped here as its rows are
  // dropped by the reader — a drift to notice, not to replay.
  const whole = p.seed;
  const seeded = whole != null && whole.events > 0;
  if (whole) {
    for (const s of whole.markets) {
      const m = marketByMtoken.get(s.market);
      if (!m) continue;
      supplyRaw.set(s.market, s.supplyRaw < ZERO ? ZERO : s.supplyRaw);
      mtokRaw.set(s.market, s.mTokensRaw < ZERO ? ZERO : s.mTokensRaw);
      debtRaw.set(s.market, s.debtRaw);
      notePeak(peakSupplyRaw, s.market, s.peakSupplyRaw);
      notePeak(peakDebtRaw, s.market, s.peakDebtRaw);
      const legs = flowsFor(m);
      legs.supplied = s.lifetime.supplied;
      legs.withdrawn = s.lifetime.withdrawn;
      legs.borrowed = s.lifetime.borrowed;
      legs.repaid = s.lifetime.repaid;
      legs.liquidatedDebt = s.lifetime.liquidatedDebt;
    }
  } else {
    for (const s of p.seeds ?? []) {
      if (!marketByMtoken.has(s.market)) continue;
      debtRaw.set(s.market, s.debtRaw);
      notePeak(peakDebtRaw, s.market, s.peakDebtRaw);
    }
  }
  const seedEvents = seeded ? whole.events : 0;
  const seededTxs = seeded ? whole.txCount : 0;

  const mvRows: MvRow[] = [];
  let undated = 0;
  let liquidationCount = seeded ? whole.liquidations : 0;
  // The render cut's ledger. Below the cut, a wallet-signed row is anchored
  // (drawn anyway, counted in `anchoredDrawn`); an unsigned one is elided
  // (counted in `elided`, its block noted — rows arrive ascending, so the
  // last note is the newest elided block, which is what the disclosure names).
  let anchoredDrawn = 0;
  let elided = 0;
  let elidedUpToBlock = 0;
  // ── The cut, for the boundary card (rails-ops decision 0019) ─────────────
  // The position after the newest elided row, read the moment the walk reaches
  // the cut and before that row moves anything; the elided rows counted by
  // kind and symbol as they pass. Withheld after the walk where anchoring drew
  // wallet-signed rows from BELOW the cut — the drawn list is then not
  // contiguous with the cut and no one block is "before the oldest drawn row".
  const cutTypes = new Map<string, number>();
  const cutAssets = new Map<string, number>();
  let cutState: BoundaryStateLine[] | null | undefined;
  const snapshotAtCut = (): BoundaryStateLine[] | null => {
    const out: BoundaryStateLine[] = [];
    for (const key of new Set([...supplyRaw.keys(), ...debtRaw.keys()])) {
      const mk = marketByMtoken.get(key);
      if (!mk) continue;
      const sup = supplyRaw.get(key) ?? ZERO;
      const debt = debtRaw.get(key) ?? ZERO;
      if (sup > ZERO)
        out.push({ label: `${mk.symbol} supply`, value: String(scaleUnits(sup, mk.decimals)), unit: mk.symbol });
      if (debt > ZERO)
        out.push({ label: `${mk.symbol} debt`, value: String(scaleUnits(debt, mk.decimals)), unit: mk.symbol });
    }
    return out.length > 0 ? out : null;
  };
  rows.forEach((d, i) => {
    const m = marketByMtoken.get(d.market)!;
    if (i === cutoff && cutState === undefined) cutState = snapshotAtCut();
    // The anchor decision comes FIRST, because only an ELIDED row belongs in
    // the histograms. Until decision 0019 leg A every row below the cut was
    // counted here and the anchor test ran later, so a wallet-signed row was
    // both drawn and in a pill: on the Base exploiter 0x719e…919d the pills
    // summed to 1,407 against an `omitted.count` of 1,386 — the 21 anchored
    // rows exactly. The pills now sum to the count on every wallet.
    const anchored = i < cutoff && anchorRows && signedByWallet(d, wallet);
    if (i < cutoff && !anchored) {
      cutTypes.set(d.kind, (cutTypes.get(d.kind) ?? 0) + 1);
      cutAssets.set(m.symbol, (cutAssets.get(m.symbol) ?? 0) + 1);
    }
    if (d.kind !== "liquidation") ownTxs.add(d.txHash);
    const supplyDelta = d.kind === "mint" ? d.amount! : d.kind === "redeem" ? -d.amount! : ZERO;
    const mtokDelta =
      d.kind === "mint" || d.kind === "transfer_in"
        ? d.mTokens!
        : d.kind === "redeem" || d.kind === "transfer_out"
          ? -d.mTokens!
          : ZERO;
    const s = bump(supplyRaw, d.market, supplyDelta);
    const t = bump(mtokRaw, d.market, mtokDelta);
    notePeak(peakSupplyRaw, d.market, s.after);
    if (d.kind === "borrow" || d.kind === "repay") {
      debtRaw.set(d.market, d.accountBorrows!);
      notePeak(peakDebtRaw, d.market, d.accountBorrows!);
    }
    if (d.kind === "liquidation") liquidationCount++;

    if (d.kind === "liquidation") flowsFor(m).liquidatedDebt += d.amount!;
    else if (d.kind === "mint") flowsFor(m).supplied += d.amount!;
    else if (d.kind === "redeem") flowsFor(m).withdrawn += d.amount!;
    else if (d.kind === "borrow") flowsFor(m).borrowed += d.amount!;
    else if (d.kind === "repay") flowsFor(m).repaid += d.amount!;

    // Rows past the cutoff are rendered, and so is every older row the wallet
    // signed itself (`anchored`, decided above). Either way only a row whose
    // block could be dated draws: an undated event has no place on a
    // timeline, and dating it to zero would put it in 1970.
    if (i < cutoff && !anchored) {
      elided++;
      elidedUpToBlock = d.blockNumber;
      return;
    }
    const ts = tsOf.get(d.blockNumber);
    if (ts == null) {
      undated++;
      return;
    }
    if (anchored) anchoredDrawn++;
    const collateral = d.collateralMarket ? marketByMtoken.get(d.collateralMarket) : undefined;
    mvRows.push({
      block_timestamp: String(ts),
      block_number: String(d.blockNumber),
      tx_index: d.txIndex,
      log_index: d.logIndex,
      tx_hash: d.txHash,
      tx_from: d.txFrom,
      tx_gas_used: d.txGasUsed ?? null,
      tx_gas_price: d.txGasPrice ?? null,
      action: d.kind,
      wallet,
      caller: d.caller ?? null,
      market: d.market,
      asset: m.underlying,
      amount: d.amount != null ? d.amount.toString() : null,
      mtokens: d.mTokens != null ? d.mTokens.toString() : null,
      account_borrows: d.accountBorrows != null ? d.accountBorrows.toString() : null,
      // A seized collateral market the roster no longer lists is stated by
      // address rather than dropped — the seize happened.
      collateral_market: d.collateralMarket ? (collateral?.key ?? d.collateralMarket) : null,
      seize_tokens: d.seizeTokens != null ? d.seizeTokens.toString() : null,
      liquidator: d.liquidator ?? null,
      supply_before: s.before.toString(),
      supply_after: s.after.toString(),
      mtokens_before: t.before.toString(),
      mtokens_after: t.after.toString(),
      debt_before:
        d.kind === "borrow"
          ? (d.accountBorrows! - d.amount!).toString()
          : d.kind === "repay"
            ? (d.accountBorrows! + d.amount!).toString()
            : null,
      debt_after: d.kind === "borrow" || d.kind === "repay" ? d.accountBorrows!.toString() : null,
      oracle_at_block: d.oracleAtBlock ?? null,
    });
  });

  // A liquidation's debt leg is ALSO a RepayBorrow (payer = liquidator), so it
  // landed in `repaid` too. Move it: repaid keeps only voluntary repayments —
  // the same rule the client-side reducer applies to the indexed stream.
  // Settled in the integer domain over the whole life (a seed's gross legs
  // and the tail's together), then scaled once per leg from the exact total.
  const lifetime: MoonwellLifetimeFlows[] = [];
  const lifetimeWire: MoonwellLifetimeFlowsRaw[] = [];
  for (const { market: m, legs } of lifetimeRaw.values()) {
    const repaid = legs.liquidatedDebt > ZERO ? maxBig(ZERO, legs.repaid - legs.liquidatedDebt) : legs.repaid;
    lifetime.push({
      market: m.key,
      symbol: m.symbol,
      address: m.underlying,
      supplied: scaleUnits(legs.supplied, m.decimals),
      withdrawn: scaleUnits(legs.withdrawn, m.decimals),
      borrowed: scaleUnits(legs.borrowed, m.decimals),
      repaid: scaleUnits(repaid, m.decimals),
      liquidatedDebt: scaleUnits(legs.liquidatedDebt, m.decimals),
    });
    lifetimeWire.push({
      market: m.key,
      supplied: legs.supplied.toString(),
      withdrawn: legs.withdrawn.toString(),
      borrowed: legs.borrowed.toString(),
      repaid: repaid.toString(),
      liquidatedDebt: legs.liquidatedDebt.toString(),
    });
  }

  const { events } = buildMoonwellTimeline(mvRows, wallet, {
    marketOf: (key) => marketByMtoken.get(key),
    chainId,
    router,
  });

  const positions: MoonwellReplayedPosition[] = [];
  for (const key of new Set([...supplyRaw.keys(), ...mtokRaw.keys(), ...debtRaw.keys()])) {
    const m = marketByMtoken.get(key)!;
    positions.push({
      market: key,
      symbol: m.symbol,
      supplyPrincipalRaw: (supplyRaw.get(key) ?? ZERO).toString(),
      mTokensRaw: (mtokRaw.get(key) ?? ZERO).toString(),
      debtRaw: (debtRaw.get(key) ?? ZERO).toString(),
      decimals: m.decimals,
      underlying: m.underlying,
      peakSupplyPrincipalRaw: p.peakWithheld ? "0" : (peakSupplyRaw.get(key) ?? ZERO).toString(),
      peakDebtRaw: p.peakWithheld ? "0" : (peakDebtRaw.get(key) ?? ZERO).toString(),
    });
  }

  // The wallet's stamps and counts. A whole seed carries the first stamp from
  // before the cut and the tail can only push the last one forward; its rows
  // are every one omitted from the drawn list, before the render cut's own.
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const tailFirstAt = rows.length > 0 ? (tsOf.get(rows[0].blockNumber) ?? null) : null;
  const tailLastAt = lastRow ? (tsOf.get(lastRow.blockNumber) ?? null) : null;
  const omitted = seedEvents + elided;
  const omittedUpToBlock = elided > 0 ? elidedUpToBlock : seeded ? whole.lastBlock : 0;
  if (cutState === undefined) cutState = snapshotAtCut();
  const cutSummary: TimelineCutSummary = {
    stateAtCut: anchoredDrawn > 0 ? null : cutState,
    byType: seeded ? null : bucketsOf(cutTypes),
    byAsset: seeded ? null : bucketsOf(cutAssets),
    firstAt: seeded ? whole.firstTimestamp : tailFirstAt,
    lastAt: elided > 0 ? (tsOf.get(elidedUpToBlock) ?? null) : seeded ? whole.lastTimestamp : null,
  };
  return {
    wallet,
    events,
    totalEvents: seedEvents + rows.length,
    txCount: seededTxs + ownTxs.size,
    liquidationCount,
    lastActivityAt: tailLastAt ?? (seeded ? whole.lastTimestamp : null),
    lifetime,
    lifetimeRaw: lifetimeWire,
    positions,
    coverage: {
      ...p.coverage,
      firstEventAt: seeded ? whole.firstTimestamp : tailFirstAt,
      // `anchored` rides whenever the anchor is on — even at 0, and even
      // beside a seed: it is the count of wallet-signed rows this replay drew
      // from below the cut, and the anchor stays on over the tail behind a
      // seed. Whether that count is the WHOLE set — the guarantee "everything
      // the wallet signed is drawn" — is `anchoredComplete`: true when every
      // row below the cut was here to anchor, false beside a seed, whose rows
      // were replayed into it and never here, so a wallet-signed row among
      // them is not drawn (lib/api/fetch-chain-timeline.ts states both).
      ...(omitted > 0
        ? {
            omitted: {
              count: omitted,
              upToBlock: omittedUpToBlock,
              summary: cutSummary,
              ...(anchorRows ? { anchored: anchoredDrawn, anchoredComplete: !seeded } : {}),
            },
          }
        : {}),
      ...(undated > 0 ? { undated } : {}),
    },
  };
}

const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** Raw → human, the one scaling every lifetime figure goes through: the whole
 *  part plus the fraction, each as a double — the same arithmetic as the
 *  Compound tower's `scaleUnits` and the opening balance's `scaleBaseUnits`. */
function scaleUnits(raw: bigint, decimals: number): number {
  if (raw === ZERO) return 0;
  if (decimals <= 0) return Number(raw);
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}
