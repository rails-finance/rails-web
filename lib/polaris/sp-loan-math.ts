// The arithmetic of a Polaris stability-pool deposit and a reserve loan, on
// the raw integers the index and the chain answer (rails-ops
// TO-DO-stability-pool-deposits.md §2, TO-DO-polaris-scoping.md §8b). Pure:
// no imports, so scripts/test/polaris-sp-loans.test.mjs loads it directly.
//
// DEPOSIT. At every touch the index's row satisfies
//   deposit_before + topUpOrWithdrawal − loss + stableGainSince − stableGainClaimed = newDeposit,
// so over a life: deposited − withdrawn − burned + yield kept = the deposit
// recorded at the last touch, where yield kept is the stable gain the touches
// paid less what they claimed (the rest compounds into the deposit). Between
// touches the pool's P falls with each liquidation: the deposit now is
// floor(recorded × P ÷ snapshot P), and the gap is the loss pending since the
// last touch. pETH a touch did not claim is stashed; the pETH gained since
// the last touch is the pool's getDepositorBcTokenGain.
//
// LOAN. Each touch is signed (+ deposited / borrowed, − returned / repaid). The
// debt after a touch is ceil(shares × debt per share ÷ 1e27) at the FeesAccrued
// index in force, so the fees a loan has been charged up to its last touch are
// that debt less the net borrowed; the chain's getLoanDebt runs ahead of it
// (the index grows at every FeesAccrued, and past the stored index between
// them), and the difference is the fee accrued since the last touch.

const E18 = BigInt("1000000000000000000");
const E27 = BigInt("1000000000000000000000000000");
const ZERO = BigInt(0);

export const big = (raw: string | null | undefined): bigint => {
  if (raw == null || raw === "") return ZERO;
  // A loan's shares carry decimals; the integer part is what is summed.
  const i = raw.indexOf(".");
  return BigInt(i < 0 ? raw : raw.slice(0, i) || "0");
};

/** A raw 1e18 integer as a number of tokens. */
export const units = (v: bigint): number => {
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const n = Number(a / E18) + Number(a % E18) / 1e18;
  return neg ? -n : n;
};

/** A raw 1e18 integer as an exact decimal string ("1375.704987560019637555"). */
export const exactUnits = (v: bigint): string => {
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

const max0 = (v: bigint): bigint => (v > ZERO ? v : ZERO);

/** floor(recorded × P ÷ snapshot P): the deposit now on the index's figures. */
export function compounded(recordedRaw: string, snapshotP: string, p: string): bigint {
  const snap = big(snapshotP);
  if (snap === ZERO) return ZERO;
  return (big(recordedRaw) * big(p)) / snap;
}

export interface DepositLifetime {
  deposited: bigint;
  withdrawn: bigint;
  burned: bigint;
  /** Stable gain paid at touches less the part claimed: compounded into the deposit. */
  kept: bigint;
  /** The deposit recorded at the last touch. */
  recorded: bigint;
  stableGain: bigint;
  stableClaimed: bigint;
  bcGain: bigint;
  bcClaimed: bigint;
  /** pETH left unclaimed at earlier touches. */
  stashed: bigint;
}

export function depositLifetime(row: {
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  stable_gain_raw: string;
  stable_claimed_raw: string;
  bc_gain_raw: string;
  bc_claimed_raw: string;
  deposit_raw: string;
  stashed_bc_raw: string;
}): DepositLifetime {
  const stableGain = big(row.stable_gain_raw);
  const stableClaimed = big(row.stable_claimed_raw);
  return {
    deposited: big(row.deposited_raw),
    withdrawn: big(row.withdrawn_raw),
    burned: big(row.burned_raw),
    kept: stableGain - stableClaimed,
    recorded: big(row.deposit_raw),
    stableGain,
    stableClaimed,
    bcGain: big(row.bc_gain_raw),
    bcClaimed: big(row.bc_claimed_raw),
    stashed: big(row.stashed_bc_raw),
  };
}

/** deposited − withdrawn − burned + kept − recorded: zero on every row the
 *  index has served (the deposit identity). */
export const depositGap = (l: DepositLifetime): bigint => l.deposited - l.withdrawn - l.burned + l.kept - l.recorded;

export interface DepositNow {
  /** getCompoundedStableTokenDeposit. */
  now: bigint;
  /** recorded − now. */
  pendingLoss: bigint;
  /** getDepositorBcTokenGain + stashedBcTokens: what a touch would pay in pETH. */
  pendingPeth: bigint;
  /** pETH gained since the last touch. */
  bcSinceTouch: bigint;
  /** getDepositorStableTokenGainWithPending. */
  pendingStable: bigint;
}

/** The pending figures from the chain read, or null where the chain has seen
 *  a touch the index has not (its recorded deposit differs), so the two
 *  would not add up. */
export function depositNow(
  l: DepositLifetime,
  chain: { compoundedRaw: string; recordedRaw: string; stableGainRaw: string; bcGainRaw: string; stashedRaw: string },
): DepositNow | null {
  if (big(chain.recordedRaw) !== l.recorded || big(chain.stashedRaw) !== l.stashed) return null;
  const now = big(chain.compoundedRaw);
  const bc = big(chain.bcGainRaw);
  return {
    now,
    pendingLoss: max0(l.recorded - now),
    pendingPeth: bc + l.stashed,
    bcSinceTouch: bc,
    pendingStable: big(chain.stableGainRaw),
  };
}

/** The same figures from the chain read alone: the card's headlines, which
 *  stand whether or not the index has served the deposit's newest touch. */
export function depositNowFromChain(chain: {
  compoundedRaw: string;
  recordedRaw: string;
  stableGainRaw: string;
  bcGainRaw: string;
  stashedRaw: string;
}): DepositNow {
  const now = big(chain.compoundedRaw);
  const bc = big(chain.bcGainRaw);
  return {
    now,
    pendingLoss: max0(big(chain.recordedRaw) - now),
    pendingPeth: bc + big(chain.stashedRaw),
    bcSinceTouch: bc,
    pendingStable: big(chain.stableGainRaw),
  };
}

export interface LoanTouch {
  event_type: string;
  coll_change: string | null;
  debt_change: string | null;
  debt_per_share: string | null;
  shares_before: string | null;
  net_borrowed_to_here: string | null;
  debt_after: string | null;
}

export interface LoanLifetime {
  collDeposited: bigint;
  collReturned: bigint;
  borrowed: bigint;
  repaid: bigint;
  /** Fees charged up to the last touch: the debt after it less the net borrowed. */
  feesAtTouches: bigint;
  /** The debt after the last touch, at the index in force there. */
  debtAtLastTouch: bigint;
  netBorrowed: bigint;
}

/** The loan's touches summed, oldest first. */
export function loanLifetime(touches: LoanTouch[]): LoanLifetime {
  let collDeposited = ZERO;
  let collReturned = ZERO;
  let borrowed = ZERO;
  let repaid = ZERO;
  let last: LoanTouch | null = null;
  for (const l of touches) {
    if (l.event_type === "transfer") continue;
    const c = big(l.coll_change);
    const d = big(l.debt_change);
    if (c > ZERO) collDeposited += c;
    else collReturned -= c;
    if (d > ZERO) borrowed += d;
    else repaid -= d;
    last = l;
  }
  const debtAtLastTouch = last ? big(last.debt_after) : ZERO;
  const netBorrowed = last ? big(last.net_borrowed_to_here) : ZERO;
  return {
    collDeposited,
    collReturned,
    borrowed,
    repaid,
    feesAtTouches: debtAtLastTouch - netBorrowed,
    debtAtLastTouch,
    netBorrowed,
  };
}

/** The fees one touch's index charged on the shares held before it: the debt
 *  just before the touch at its index, less the debt after the previous touch.
 *  Null for the first touch. */
export function feeAtTouch(touch: LoanTouch, previous: LoanTouch | null): bigint | null {
  if (!previous || touch.debt_per_share == null) return null;
  const sharesBefore = big(touch.shares_before);
  if (sharesBefore === ZERO) return ZERO;
  const before = ceilDiv(sharesBefore * big(touch.debt_per_share), E27);
  return max0(before - big(previous.debt_after));
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - BigInt(1)) / b;

/** ceil(shares × debt per share ÷ 1e27): getLoanDebt at a FeesAccrued block. */
export const debtAt = (sharesRaw: string, dpsRaw: string): bigint => ceilDiv(big(sharesRaw) * big(dpsRaw), E27);

/** The collateral at the floor, in WETH: coll × floor ÷ 1e18. */
export const atFloor = (collRaw: string, floorRaw: string): bigint => (big(collRaw) * big(floorRaw)) / E18;

/** The fee accrued since the last touch: the debt now less the debt after it,
 *  never below zero (the replayed shares drift by a wei a touch). */
export const pendingFee = (debtNowRaw: string, l: LoanLifetime): bigint => max0(big(debtNowRaw) - l.debtAtLastTouch);
