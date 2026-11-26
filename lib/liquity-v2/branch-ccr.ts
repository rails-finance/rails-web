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
//   SCR × debt ÷ coll;
// - closeTrove takes the Trove's entire collateral and entire debt
//   (getLatestTroveData) out of the branch and calls _requireNewTCRisAboveCCR
//   on what is left, at the price fetchPrice returns
//   (BorrowerOperations.closeTrove, _getNewTCRFromTroveChange), so the close
//   goes through while (branch coll − Trove coll) × price ÷ (branch debt −
//   Trove debt) ≥ CCR;
// - a Trove in a batch keeps ICR ≥ MCR + BCR on every adjustment
//   (_requireICRisAboveMCRPlusBCR); BCR is BorrowerOperations.BCR().
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
  /** BorrowerOperations.BCR(): a batched Trove's margin above the MCR; null where it did not answer. */
  bcrRaw: string | null;
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
  /** BCR as a ratio; null where the read did not answer. */
  bcr: number | null;
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
    bcr: read.bcrRaw == null ? null : num(BigInt(read.bcrRaw)),
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

/** One Trove's entire collateral and entire debt (TroveManager.getLatestTroveData),
 *  as integer strings (1e18 scale). */
export interface TroveCloseInput {
  collRaw: string;
  debtRaw: string;
}

/** Whether closeTrove's _requireNewTCRisAboveCCR passes: the branch's TCR with
 *  this Trove's collateral and debt taken out, against the CCR. */
export interface TroveCloseCheck extends TroveCloseInput {
  /** The branch's TCR after the close, the contract's integer (1e18 = 100%). */
  newTcrRaw: string;
  newTcr: number;
  /** newTCR ≥ CCR, compared on the integers as the contract compares them. */
  closes: boolean;
}

/** The close check for one Trove on a settled branch. A Trove with no debt (a
 *  fully redeemed dormant Trove) gets an answer: its close removes collateral
 *  only, so below the CCR it never passes. Null where the Trove's figures are
 *  missing; where the close would leave the branch with no debt, which stands
 *  in for the last-Trove case, since TroveManager refuses to close a branch's
 *  only Trove (OnlyOneTroveLeft), so the card gives no answer there; and where
 *  the price is lastGoodPrice: closeTrove calls fetchPrice, and a fetchPrice that
 *  failed in simulation may shut the branch down instead. */
export function troveCloseCheck(
  s: LiquityV2BranchCcr,
  trove: TroveCloseInput | null | undefined,
): TroveCloseCheck | null {
  if (!trove || s.priceCall !== "fetchPrice") return null;
  const tColl = BigInt(trove.collRaw);
  const tDebt = BigInt(trove.debtRaw);
  const coll = BigInt(s.collRaw) - tColl;
  const debt = BigInt(s.debtRaw) - tDebt;
  if (tDebt < ZERO || coll < ZERO || debt <= ZERO) return null;
  // LiquityMath._computeCR on what the close leaves, at the read's price.
  const newTcr = (coll * BigInt(s.priceRaw)) / debt;
  return {
    collRaw: trove.collRaw,
    debtRaw: trove.debtRaw,
    newTcrRaw: newTcr.toString(),
    newTcr: num(newTcr),
    closes: newTcr >= BigInt(s.ccrRaw),
  };
}

/** Whether a dormant (zombie) Trove has to borrow to change at all below the
 *  CCR: adjustTrove and its one-way siblings revert for it
 *  (_requireTroveIsActive), and adjustZombieTrove must leave its debt at or
 *  above MIN_DEBT (_adjustTrove's _requireAtLeastMinDebt). True while its
 *  entire debt is under `minDebt` (whole BOLD), or unread, since the index
 *  marks a Trove dormant for debt under the minimum. */
export function zombieMustBorrow(trove: TroveCloseInput | null | undefined, minDebt: number): boolean {
  if (!trove) return true;
  return BigInt(trove.debtRaw) < BigInt(minDebt) * BigInt("1000000000000000000");
}

/** The notice draws while TCR < CCR on a branch that reads as not shut down;
 *  a shut-down branch draws its own state (ui-jobs 612). */
export function ccrNoticeShown(s: LiquityV2BranchCcr | null | undefined): s is LiquityV2BranchCcr {
  return s != null && s.belowCcr && s.shutDown === false;
}

/** A TCR as the notice prints it, from the contract's integer (1e18 = 100%),
 *  floored to hundredths of a percent so a ratio just under the CCR never
 *  prints as the CCR: 1.49996e18 reads "149.99%". */
export function tcrPercentText(tcrRaw: string): string {
  const hundredths = BigInt(tcrRaw) / BigInt("100000000000000");
  const whole = hundredths / BigInt(100);
  const frac = (hundredths % BigInt(100)).toString().padStart(2, "0");
  return `${whole.toLocaleString("en-US")}.${frac}%`;
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
