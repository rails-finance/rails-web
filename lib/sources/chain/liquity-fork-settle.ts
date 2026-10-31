// The Liquity-fork readers' arithmetic, apart from where the contract reads
// came from: the web's own chain read (liquity-fork-{position,branches,prices}.ts)
// or rails-server's read of the same calls at one block
// (lib/sources/api/liquity-fork-head.ts). Both paths settle through these, so
// an answer from either is the same for the same reads.
//
// SERVER-ONLY.

import type {
  LiquityForkBranchConfig,
  LiquityForkConfig,
  LiquityForkTroveChainResponse,
  LiquityForkTroveStatus,
} from "./liquity-fork-position";
import type {
  LiquityForkBranchState,
  LiquityForkBranchesResponse,
  LiquityForkQueueEntry,
} from "./liquity-fork-branches";
import type { LiquityForkBranchPrice } from "./liquity-fork-prices";

const STATUS: LiquityForkTroveStatus[] = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "zombie"];
const ZERO = BigInt(0);

/** The branch price the readers take: fetchPrice when above 0, else lastGoodPrice. */
export function branchPrice(
  b: LiquityForkBranchConfig,
  fetched: bigint | null,
  lastGood: bigint | null,
): { priceRaw: bigint | null; priceStale: boolean; priceUsd: number | null } {
  const priceScale = 10 ** (36 - b.decimals); // USD per whole token divisor
  const priceRaw = fetched != null && fetched > ZERO ? fetched : lastGood;
  const priceStale = !(fetched != null && fetched > ZERO) && lastGood != null;
  const priceUsd = priceRaw != null && priceRaw > ZERO ? Number(priceRaw) / priceScale : null;
  return { priceRaw, priceStale, priceUsd };
}

/** One branch's price for the listings and the wallet page; null where it is unpriced. */
export function settlePrice(
  b: LiquityForkBranchConfig,
  fetchedRaw: bigint | null,
  lastRaw: bigint | null,
): LiquityForkBranchPrice | null {
  const scale = 10 ** (36 - b.decimals); // USD-per-whole-token divisor
  const raw = fetchedRaw != null && fetchedRaw > ZERO ? fetchedRaw : lastRaw;
  if (raw == null || raw <= ZERO) return null; // unpriced — absence, never 0
  return { priceUsd: Number(raw) / scale, stale: !(fetchedRaw != null && fetchedRaw > ZERO) };
}

export interface TroveDataRead {
  entireDebt: bigint;
  entireColl: bigint;
  redistBoldDebtGain: bigint;
  redistCollGain: bigint;
  accruedInterest: bigint;
  recordedDebt: bigint;
  annualInterestRate: bigint;
  accruedBatchManagementFee: bigint;
}

/** What the Trove reader read: the branch's price, aggregates, the Trove, and
 *  (when priced) its ICR and the sorted list from its head. */
export interface TroveReads {
  blockNumber: number;
  /** fetchPrice's two answers, null where it reverted. */
  fetched: [bigint, boolean] | null;
  lastGood: bigint | null;
  data: TroveDataRead | null;
  statusNum: number | null;
  branchDebtRaw: bigint | null;
  branchCollRaw: bigint | null;
  /** getCurrentICR at the price; null where unread or reverted. */
  icrRaw: bigint | null;
  /** The sorted list from getFirst (at most the walk cap); null where the walk failed. */
  walk: bigint[] | null;
  /** A walked Trove's entire debt; null where its read failed. */
  entireDebtOf: (id: bigint) => bigint | null;
}

export function troveStub(
  cfg: LiquityForkConfig,
  b: LiquityForkBranchConfig,
  troveId: string,
): LiquityForkTroveChainResponse {
  return {
    protocol: cfg.protocol,
    branch: b.key,
    symbol: b.symbol,
    troveId,
    blockNumber: 0,
    status: "nonExistent",
    entireDebtRaw: "0",
    entireDebt: 0,
    entireCollRaw: "0",
    entireColl: 0,
    collDecimals: b.decimals,
    accruedInterest: 0,
    accruedBatchManagementFee: 0,
    redistDebtGain: 0,
    redistCollGain: 0,
    recordedDebt: 0,
    annualInterestRatePct: 0,
    annualInterestRateRaw: "0",
    priceUsd: null,
    priceStale: false,
    oracleDown: false,
    icr: null,
    mcr: b.mcr,
    ccr: b.ccr,
    scr: b.scr,
    liqPriceUsd: null,
    branchDebt: null,
    branchColl: null,
    branchTcr: null,
    inSortedList: false,
    debtInFront: null,
    trovesAhead: null,
    chainStale: true,
  };
}

/** One Trove's answer from its reads. */
export function settleTrove(
  cfg: LiquityForkConfig,
  b: LiquityForkBranchConfig,
  troveIdRaw: string,
  r: TroveReads,
): LiquityForkTroveChainResponse {
  const { data, statusNum } = r;
  if (!data || statusNum == null) return troveStub(cfg, b, troveIdRaw);
  const troveId = BigInt(troveIdRaw);
  const { priceRaw, priceStale, priceUsd } = branchPrice(b, r.fetched ? r.fetched[0] : null, r.lastGood);

  const debtScale = 1e18;
  const collScale = 10 ** b.decimals;
  const entireDebt = Number(data.entireDebt) / debtScale;
  const entireColl = Number(data.entireColl) / collScale;

  let icr: number | null = null;
  let debtInFront: number | null = null;
  let trovesAhead: number | null = null;
  let inSortedList = false;
  let queueLen: number | null = null;
  if (priceRaw != null && priceRaw > ZERO) {
    if (data.entireDebt > ZERO && r.icrRaw != null) {
      // The contract returns max-uint for debtless troves; guard on scale.
      icr = r.icrRaw < BigInt("0xffffffffffffffffffffffffffffffff") ? Number(r.icrRaw) / 1e18 : null;
    }
    // Debt-in-front for this trove = Σ entireDebt of troves AFTER it in the
    // head→tail walk (lower rates, redeemed first).
    if (r.walk) {
      const ids = r.walk;
      const idx = ids.findIndex((x) => x === troveId);
      queueLen = ids.length;
      inSortedList = idx >= 0;
      if (inSortedList) {
        const after = ids.slice(idx + 1);
        let sum = 0;
        let n = 0;
        for (const x of after) {
          const d = r.entireDebtOf(x);
          if (d == null) continue;
          sum += Number(d) / debtScale;
          n++;
        }
        debtInFront = sum;
        trovesAhead = n;
      } else if (statusNum === 4) {
        // Zombie: outside the list, redeemed before everything in it.
        debtInFront = 0;
        trovesAhead = 0;
      }
    }
  }

  const branchDebt = r.branchDebtRaw != null ? Number(r.branchDebtRaw) / debtScale : null;
  const branchColl = r.branchCollRaw != null ? Number(r.branchCollRaw) / collScale : null;

  return {
    protocol: cfg.protocol,
    branch: b.key,
    symbol: b.symbol,
    troveId: troveIdRaw,
    blockNumber: r.blockNumber,
    status: STATUS[statusNum] ?? "nonExistent",
    entireDebtRaw: data.entireDebt.toString(),
    entireDebt,
    entireCollRaw: data.entireColl.toString(),
    entireColl,
    collDecimals: b.decimals,
    accruedInterest: Number(data.accruedInterest) / debtScale,
    accruedBatchManagementFee: Number(data.accruedBatchManagementFee ?? ZERO) / debtScale,
    redistDebtGain: Number(data.redistBoldDebtGain) / debtScale,
    redistCollGain: Number(data.redistCollGain) / collScale,
    recordedDebt: Number(data.recordedDebt) / debtScale,
    annualInterestRatePct: Number(data.annualInterestRate) / 1e16,
    annualInterestRateRaw: data.annualInterestRate.toString(),
    priceUsd,
    priceStale,
    oracleDown: r.fetched != null ? r.fetched[1] : false,
    icr,
    mcr: b.mcr,
    ccr: b.ccr,
    scr: b.scr,
    liqPriceUsd: entireDebt > 0 && entireColl > 0 ? (entireDebt * b.mcr) / entireColl : null,
    branchDebt,
    branchColl,
    // A branch whose troves have all gone still reports DUST debt from its
    // aggregate interest bookkeeping, and dividing collateral by dust yields
    // a ratio in the quintillions — the branches lane's rule applies here
    // too: gate on the QUEUE, not on debt > 0 (a failed walk falls back to
    // a whole-token floor). An empty branch has no ratio to state.
    branchTcr:
      branchDebt != null &&
      branchColl != null &&
      priceUsd != null &&
      (queueLen != null ? queueLen > 0 && branchDebt > 0 : branchDebt >= 1)
        ? (branchColl * priceUsd) / branchDebt
        : null,
    inSortedList,
    debtInFront,
    trovesAhead,
    chainStale: false,
  };
}

export function emptyBranch(b: LiquityForkBranchConfig): LiquityForkBranchState {
  return {
    key: b.key,
    symbol: b.symbol,
    decimals: b.decimals,
    troveManager: b.troveManager,
    priceUsd: null,
    priceStale: false,
    oracleDown: false,
    branchDebt: null,
    branchColl: null,
    branchCollUsd: null,
    tcr: null,
    mcr: b.mcr,
    ccr: b.ccr,
    scr: b.scr,
    queue: [],
    listedCount: 0,
    queueCapped: false,
    idsTotal: null,
    idsCapped: false,
    zombieCount: 0,
    minRatePct: null,
    maxRatePct: null,
    avgRatePct: null,
    stale: true,
  };
}

export interface RosterTroveRead {
  entireDebt: bigint;
  entireColl: bigint;
  annualInterestRate: bigint;
}

/** What the roster reader read for one branch. */
export interface BranchReads {
  fetched: [bigint, boolean] | null;
  lastGood: bigint | null;
  branchDebtRaw: bigint | null;
  branchCollRaw: bigint | null;
  idsCount: bigint | null;
  listSize: bigint | null;
  /** The sorted list from its tail, at most the walk cap. */
  listed: bigint[];
  /** The ids array's Troves that answered, at most the ids cap. */
  allIds: bigint[];
  dataOf: (id: bigint) => RosterTroveRead | null;
  statusOf: (id: bigint) => number | null;
}

/** One branch of the roster from its reads (the caps are the reader's). */
export function settleBranch(b: LiquityForkBranchConfig, r: BranchReads, idsCap: number): LiquityForkBranchState {
  // Aggregates are the row's reason to exist — without them there is no
  // branch to show.
  if (r.branchDebtRaw == null || r.branchCollRaw == null) return emptyBranch(b);
  const { priceStale, priceUsd } = branchPrice(b, r.fetched ? r.fetched[0] : null, r.lastGood);

  const debtScale = 1e18;
  const collScale = 10 ** b.decimals;
  const branchDebt = Number(r.branchDebtRaw) / debtScale;
  const branchColl = Number(r.branchCollRaw) / collScale;
  const listed = r.listed;
  const queueCapped = r.listSize != null && Number(r.listSize) > listed.length;
  const idsCapped = r.idsCount != null && Number(r.idsCount) > idsCap;

  const listedSet = new Set(listed.map(String));
  const unlisted = r.allIds.filter((x) => !listedSet.has(String(x)));

  const entry = (id: bigint, zombie: boolean): LiquityForkQueueEntry | null => {
    const d = r.dataOf(id);
    if (!d) return null;
    // A trove with no debt left is in nobody's redemption path — observed
    // live on Ebisu's stcUSD branch, where a zombie sits at exactly zero.
    // It is real protocol state, but it is not queue state: it would add a
    // row that consumes nothing and is redeemed for nothing.
    if (d.entireDebt <= ZERO) return null;
    return {
      troveId: id.toString(),
      annualInterestRatePct: Number(d.annualInterestRate) / 1e16,
      entireDebt: Number(d.entireDebt) / debtScale,
      entireColl: Number(d.entireColl) / collScale,
      zombie,
      debtInFront: 0, // filled once the queue order is settled
    };
  };

  // Zombies (status 4) lead the queue — a partial redemption left them below
  // the minimum debt, and they are redeemed before the whole sorted list.
  // The COUNT takes every status-4 trove; the QUEUE keeps only those still
  // carrying debt (entry() drops zero-debt troves — nothing to redeem). A
  // zombie redeemed to exactly zero is real branch state holding real
  // collateral (asymmetry's scrvUSD zombie holds 40k), so it must count
  // even though it stands outside every redemption path.
  const zombies: LiquityForkQueueEntry[] = [];
  let zombieCount = 0;
  for (const id of unlisted) {
    if (r.statusOf(id) !== 4) continue; // closed / liquidated troves are not in any queue
    zombieCount++;
    const e = entry(id, true);
    if (e) zombies.push(e);
  }
  // The listed queue in REDEMPTION order — the tail-first walk already
  // yielded it lowest-rate (redeemed first) to highest.
  const active: LiquityForkQueueEntry[] = [];
  for (const id of listed) {
    const e = entry(id, false);
    if (e) active.push(e);
  }

  const queue = [...zombies, ...active];
  let running = 0;
  for (const e of queue) {
    e.debtInFront = running;
    running += e.entireDebt;
  }

  const rates = active.map((e) => e.annualInterestRatePct);
  const activeDebt = active.reduce((s, e) => s + e.entireDebt, 0);
  // A TCR needs debt that actually belongs to troves. A branch whose troves
  // have all gone still reports DUST from the aggregate interest bookkeeping
  // — Asymmetry's scrvUSD branch sits at 6,896 wei against 40k of collateral
  // — and dividing by that yields a ratio in the quintillions. Empty branch,
  // no ratio: gate on the queue, not on `debt > 0`.
  const tcr = queue.length > 0 && branchDebt > 0 && priceUsd != null ? (branchColl * priceUsd) / branchDebt : null;

  return {
    key: b.key,
    symbol: b.symbol,
    decimals: b.decimals,
    troveManager: b.troveManager,
    priceUsd,
    priceStale,
    oracleDown: r.fetched != null ? r.fetched[1] : false,
    branchDebt,
    branchColl,
    branchCollUsd: priceUsd != null ? branchColl * priceUsd : null,
    tcr,
    mcr: b.mcr,
    ccr: b.ccr,
    scr: b.scr,
    queue,
    listedCount: r.listSize != null ? Number(r.listSize) : active.length,
    queueCapped,
    idsTotal: r.idsCount != null ? Number(r.idsCount) : null,
    idsCapped,
    zombieCount,
    minRatePct: rates.length > 0 ? Math.min(...rates) : null,
    maxRatePct: rates.length > 0 ? Math.max(...rates) : null,
    avgRatePct:
      activeDebt > 0 ? active.reduce((s, e) => s + e.annualInterestRatePct * e.entireDebt, 0) / activeDebt : null,
    stale: false,
  };
}

/** The roster from its branches, at one block. */
export function settleBranches(
  cfg: LiquityForkConfig,
  blockNumber: number,
  branches: LiquityForkBranchState[],
): LiquityForkBranchesResponse {
  const answered = branches.filter((b) => !b.stale);
  const totalDebt = answered.reduce((sum, b) => sum + (b.branchDebt ?? 0), 0);
  // A USD total is only stated when EVERY branch priced — summing the priced
  // subset would understate the protocol without saying so.
  const priced = answered.filter((b) => b.branchCollUsd != null);
  const totalCollUsdComplete = answered.length > 0 && priced.length === answered.length;
  return {
    protocol: cfg.protocol,
    debtSymbol: cfg.debtSymbol,
    blockNumber,
    branches,
    totalDebt,
    totalCollUsd: totalCollUsdComplete ? priced.reduce((sum, b) => sum + (b.branchCollUsd ?? 0), 0) : null,
    totalCollUsdComplete,
    chainStale: answered.length === 0,
  };
}
