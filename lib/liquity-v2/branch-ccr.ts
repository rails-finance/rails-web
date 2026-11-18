// A Liquity V2 branch below its critical ratio (rails-ops TO-DO-ui-jobs 747):
// the read's shape, and how its raw integers settle into the figures the
// notice states. The sibling of a branch's shutdown (lib/liquity-fork/shutdown.ts).
//
// Rules, from liquity/bold contracts/src:
// - TCR = branch coll × price ÷ branch debt (LiquityBase._getTCR, at the price
//   fetchPrice returns, which every borrower operation uses);
// - the branch is below its critical threshold while TCR < CCR
//   (LiquityBase._checkBelowCriticalThreshold);
// - shutdown() is callable by anyone while TCR < SCR (BorrowerOperations.shutdown),
//   so the price at which TCR meets the SCR at this collateral and debt is
//   SCR × debt ÷ coll.
//
// Pure: imports nothing, so the unit test reads it (scripts/test).

export const LIQUITY_V2_CCR_BRANCHES = ["WETH", "wstETH", "rETH"] as const;
export type LiquityV2CcrBranch = (typeof LIQUITY_V2_CCR_BRANCHES)[number];

/** The price call that answered: fetchPrice simulated by eth_call, else lastGoodPrice. */
export type CcrPriceCall = "fetchPrice" | "lastGoodPrice";

/** One branch's raw answers at one block, as integer strings (1e18 scale). */
export interface LiquityV2BranchCcrRead {
  branch: LiquityV2CcrBranch;
  troveManager: string;
  borrowerOperations: string;
  priceFeed: string;
  /** TroveManager.getEntireBranchColl() */
  collRaw: string;
  /** TroveManager.getEntireBranchDebt() */
  debtRaw: string;
  priceRaw: string;
  priceCall: CcrPriceCall;
  /** BorrowerOperations.CCR(), SCR(), MCR() */
  ccrRaw: string;
  scrRaw: string;
  mcrRaw: string;
  /** BorrowerOperations.hasBeenShutDown(); null where it did not answer. */
  shutDown: boolean | null;
}

/** Every branch at one block. A branch whose reads failed is null. */
export interface LiquityV2BranchCcrResponse {
  blockNumber: number;
  blockTimestamp: number;
  branches: Record<LiquityV2CcrBranch, LiquityV2BranchCcrRead | null>;
}

/** One branch settled: the figures the notice states. */
export interface LiquityV2BranchCcr extends LiquityV2BranchCcrRead {
  blockNumber: number;
  blockTimestamp: number;
  tcrRaw: string;
  shutdownPriceRaw: string;
  tcr: number;
  ccr: number;
  scr: number;
  mcr: number;
  price: number;
  coll: number;
  debt: number;
  /** The collateral price at which TCR meets the SCR at this collateral and debt. */
  shutdownPrice: number;
  /** TCR < CCR, compared on the integers as the contract compares them. */
  belowCcr: boolean;
}

const ZERO = BigInt(0);
const num = (raw: bigint) => Number(raw) / 1e18;

/** The figures from one branch's read; null where a figure cannot be formed. */
export function settleBranchCcr(
  read: LiquityV2BranchCcrRead | null | undefined,
  at: { blockNumber: number; blockTimestamp: number },
): LiquityV2BranchCcr | null {
  if (!read) return null;
  const coll = BigInt(read.collRaw);
  const debt = BigInt(read.debtRaw);
  const price = BigInt(read.priceRaw);
  const ccr = BigInt(read.ccrRaw);
  const scr = BigInt(read.scrRaw);
  if (coll <= ZERO || debt <= ZERO || price <= ZERO || ccr <= ZERO || scr <= ZERO) return null;
  // LiquityMath._computeCR: coll × price ÷ debt, floored.
  const tcr = (coll * price) / debt;
  const shutdownPrice = (scr * debt) / coll;
  return {
    ...read,
    ...at,
    tcrRaw: tcr.toString(),
    shutdownPriceRaw: shutdownPrice.toString(),
    tcr: num(tcr),
    ccr: num(ccr),
    scr: num(scr),
    mcr: num(BigInt(read.mcrRaw)),
    price: num(price),
    coll: num(coll),
    debt: num(debt),
    shutdownPrice: num(shutdownPrice),
    belowCcr: tcr < ccr,
  };
}

/** Every branch that settled, by symbol. */
export function settleAllBranchCcr(
  res: LiquityV2BranchCcrResponse | null | undefined,
): Partial<Record<LiquityV2CcrBranch, LiquityV2BranchCcr>> {
  const out: Partial<Record<LiquityV2CcrBranch, LiquityV2BranchCcr>> = {};
  if (!res || res.blockNumber <= 0) return out;
  for (const b of LIQUITY_V2_CCR_BRANCHES) {
    const s = settleBranchCcr(res.branches[b], res);
    if (s) out[b] = s;
  }
  return out;
}

/** The notice draws while TCR < CCR on a branch that reads as not shut down;
 *  a shut-down branch draws its own state (ui-jobs 612). */
export function ccrNoticeShown(s: LiquityV2BranchCcr | null | undefined): s is LiquityV2BranchCcr {
  return s != null && s.belowCcr && s.shutDown === false;
}

/** The block a development server pins the read to (LIQUITY_V2_CCR_AT_BLOCK),
 *  so a past Safety Mode can be drawn; null in any other NODE_ENV, and the
 *  route takes no block from the request. */
export function ccrPinBlock(nodeEnv: string | undefined, pin: string | undefined): number | null {
  if (nodeEnv !== "development") return null;
  const n = Number(pin);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The branch as the routes key it, from any case; null where it names none. */
export function normalizeCcrBranch(raw: string | null | undefined): LiquityV2CcrBranch | null {
  const lower = (raw ?? "").toLowerCase();
  return LIQUITY_V2_CCR_BRANCHES.find((b) => b.toLowerCase() === lower) ?? null;
}
