// The arithmetic of a Liquity V2 stability-pool deposit, on the raw integers
// the index and the chain answer (rails-ops
// reference/liquity-v2-stability-pool-deposits.md). Pure: no imports, so
// scripts/test/liquity-v2-sp.test.mjs loads it directly.
//
// At every touch the index's row satisfies
//   deposit_after = deposit_before − deposit_loss + top_up_or_withdrawal
//                   + yield_gain_since − yield_gain_claimed
//   stash_after   = stash_before + coll_gain_since − coll_gain_claimed
// so over a life: deposited − withdrawn − burned + yield kept = the deposit
// recorded at the last touch (`deposits(depositor)`), where yield kept is the
// BOLD yield the touches paid less what they sent out; and collateral paid in
// less claimed = the stash (`stashedColl(depositor)`). Between touches,
// liquidations burn the deposit and pay collateral in, and the branch's
// interest pays yield in: the pool's getCompoundedBoldDeposit,
// getDepositorCollGain and getDepositorYieldGainWithPending state them.

const E18 = BigInt("1000000000000000000");
const ZERO = BigInt(0);

export const big = (raw: string | null | undefined): bigint => {
  if (raw == null || raw === "") return ZERO;
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

export const max0 = (v: bigint): bigint => (v > ZERO ? v : ZERO);

export interface DepositLifetime {
  deposited: bigint;
  withdrawn: bigint;
  burned: bigint;
  /** BOLD yield paid at touches less the part sent out: it joined the deposit. */
  kept: bigint;
  /** The deposit recorded at the last touch. */
  recorded: bigint;
  yieldGain: bigint;
  yieldClaimed: bigint;
  collGain: bigint;
  collClaimed: bigint;
  /** Collateral paid in at touches and not yet sent. */
  stash: bigint;
}

export function depositLifetime(row: {
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  yield_gain_raw: string;
  yield_claimed_raw: string;
  coll_gain_raw: string;
  coll_claimed_raw: string;
  deposit_raw: string;
  stash_raw: string;
}): DepositLifetime {
  const yieldGain = big(row.yield_gain_raw);
  const yieldClaimed = big(row.yield_claimed_raw);
  return {
    deposited: big(row.deposited_raw),
    withdrawn: big(row.withdrawn_raw),
    burned: big(row.burned_raw),
    kept: yieldGain - yieldClaimed,
    recorded: big(row.deposit_raw),
    yieldGain,
    yieldClaimed,
    collGain: big(row.coll_gain_raw),
    collClaimed: big(row.coll_claimed_raw),
    stash: big(row.stash_raw),
  };
}

/** deposited − withdrawn − burned + kept − recorded: zero on every row the
 *  index serves (the deposit identity). */
export const depositGap = (l: DepositLifetime): bigint => l.deposited - l.withdrawn - l.burned + l.kept - l.recorded;

/** collateral paid in − claimed − stash: zero on every row (the stash identity). */
export const stashGap = (l: DepositLifetime): bigint => l.collGain - l.collClaimed - l.stash;

/** The pool's getters at head, as raw integer strings. */
export interface DepositChainFigures {
  /** getCompoundedBoldDeposit(depositor). */
  compoundedRaw: string;
  /** deposits(depositor): the deposit recorded at the last touch. */
  recordedRaw: string;
  /** getDepositorCollGain(depositor): collateral paid in since the last touch. */
  collGainRaw: string;
  /** stashedColl(depositor): collateral earlier touches left unsent. */
  stashRaw: string;
  /** getDepositorYieldGainWithPending(depositor): the BOLD yield a touch would pay. */
  yieldGainRaw: string;
}

export interface DepositNow {
  /** getCompoundedBoldDeposit. */
  now: bigint;
  /** recorded − now: burned since the last touch. */
  pendingLoss: bigint;
  /** getDepositorCollGain + stashedColl: what a claiming touch would send. */
  pendingColl: bigint;
  /** Collateral paid in since the last touch. */
  collSinceTouch: bigint;
  /** getDepositorYieldGainWithPending. */
  pendingYield: bigint;
}

/** The pending figures from the chain read alone: the card's headlines, which
 *  stand whether or not the index has served the deposit's newest touch. */
export function depositNowFromChain(chain: DepositChainFigures): DepositNow {
  const now = big(chain.compoundedRaw);
  const coll = big(chain.collGainRaw);
  return {
    now,
    pendingLoss: max0(big(chain.recordedRaw) - now),
    pendingColl: coll + big(chain.stashRaw),
    collSinceTouch: coll,
    pendingYield: big(chain.yieldGainRaw),
  };
}

/** The same figures laid over the index, or null where the chain has seen a
 *  touch the index has not (its recorded deposit or stash differs), so the two
 *  would not add up. */
export function depositNow(l: DepositLifetime, chain: DepositChainFigures): DepositNow | null {
  if (big(chain.recordedRaw) !== l.recorded || big(chain.stashRaw) !== l.stash) return null;
  return depositNowFromChain(chain);
}

/** The figures of one operation that the Lifetime flows read. */
export interface DepositOp {
  top_up_or_withdrawal: string | null;
  deposit_loss: string | null;
  yield_gain_since: string | null;
  yield_gain_claimed: string | null;
  coll_gain_since: string | null;
  coll_gain_claimed: string | null;
  deposit_after: string | null;
  stash_after: string | null;
}

/** One operation's legs on the two bars. BOLD: deposit before + deposited +
 *  yield in − withdrawn − burned − yield claimed = deposit after. Collateral:
 *  stash before + paid in − claimed = stash after. */
export interface DepositLegs {
  deposited: bigint;
  withdrawn: bigint;
  burned: bigint;
  yieldIn: bigint;
  yieldClaimed: bigint;
  collIn: bigint;
  collClaimed: bigint;
  deposit: bigint;
  stash: bigint;
}

export function depositLegs(r: DepositOp): DepositLegs {
  const ch = big(r.top_up_or_withdrawal);
  return {
    deposited: max0(ch),
    withdrawn: max0(-ch),
    burned: big(r.deposit_loss),
    yieldIn: big(r.yield_gain_since),
    yieldClaimed: big(r.yield_gain_claimed),
    collIn: big(r.coll_gain_since),
    collClaimed: big(r.coll_gain_claimed),
    deposit: big(r.deposit_after),
    stash: big(r.stash_after),
  };
}

/** The branch PriceFeed's price (1e18, USD per collateral token) as a number. */
export const priceUnits = (raw: string | null | undefined): number | null => {
  const v = big(raw);
  return v > ZERO ? units(v) : null;
};
