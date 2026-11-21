// The arithmetic of a Liquity V1 LQTY stake, on the raw integers the index
// and the chain answer. Pure: no imports, so
// scripts/test/liquity-v1-staking.test.mjs loads it directly.
//
// At every touch the index's row satisfies
//   stake_after = stake_before + stake_change
// so over a life: staked − unstaked = the stake after the last touch, which is
// LQTYStaking's stakes(staker) until the next one (a stake moves only at its
// touches). The fees accrue between touches without the staker acting:
// getPendingETHGain and getPendingLUSDGain state them, and every touch pays
// them out in full.

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

/** A raw 1e18 integer as an exact decimal string. */
export const exactUnits = (v: bigint): string => {
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

export const max0 = (v: bigint): bigint => (v > ZERO ? v : ZERO);

/** The stake's fraction of all LQTY staked, divided in integers to 1e-12
 *  before it becomes a number. Null for an empty pool. */
export function stakeShare(stake: bigint, total: bigint): number | null {
  if (total <= ZERO) return null;
  const scale = BigInt("1000000000000");
  return Number((stake * scale) / total) / 1e12;
}

export interface StakeLifetime {
  staked: bigint;
  unstaked: bigint;
  /** The stake after the last touch. */
  stake: bigint;
  /** LUSD fees paid at touches. */
  lusdGain: bigint;
  /** ETH fees paid at touches. */
  ethGain: bigint;
}

export function stakeLifetime(row: {
  staked_raw: string;
  unstaked_raw: string;
  stake_raw: string;
  lusd_gain_raw: string;
  eth_gain_raw: string;
}): StakeLifetime {
  return {
    staked: big(row.staked_raw),
    unstaked: big(row.unstaked_raw),
    stake: big(row.stake_raw),
    lusdGain: big(row.lusd_gain_raw),
    ethGain: big(row.eth_gain_raw),
  };
}

/** staked − unstaked − stake: zero on every row the index serves. */
export const stakeGap = (l: StakeLifetime): bigint => l.staked - l.unstaked - l.stake;

/** LQTYStaking's getters at head, as raw integer strings. */
export interface StakeChainFigures {
  /** stakes(staker). */
  stakeRaw: string;
  /** getPendingLUSDGain(staker): the borrowing fees paid in since the last touch. */
  lusdGainRaw: string;
  /** getPendingETHGain(staker): the redemption fees paid in since the last touch. */
  ethGainRaw: string;
}

export interface StakeNow {
  stake: bigint;
  pendingLusd: bigint;
  pendingEth: bigint;
}

/** The figures at head from the chain read alone: the card's headlines. */
export function stakeNowFromChain(chain: StakeChainFigures): StakeNow {
  return { stake: big(chain.stakeRaw), pendingLusd: big(chain.lusdGainRaw), pendingEth: big(chain.ethGainRaw) };
}

/** The same laid over the index, or null where the chain has seen a touch the
 *  index has not (its stake differs), so the two would not add up. */
export function stakeNow(l: StakeLifetime, chain: StakeChainFigures): StakeNow | null {
  if (big(chain.stakeRaw) !== l.stake) return null;
  return stakeNowFromChain(chain);
}

/** The figures of one touch that the Lifetime flows read. */
export interface StakeOp {
  stake_change: string | null;
  lusd_gain: string | null;
  eth_gain: string | null;
  stake_after: string | null;
}

/** One touch's legs. LQTY: stake before + staked − unstaked = stake after.
 *  LUSD and ETH: the fees paid out at the touch. */
export interface StakeLegs {
  staked: bigint;
  unstaked: bigint;
  lusd: bigint;
  eth: bigint;
  stake: bigint;
}

export function stakeLegs(r: StakeOp): StakeLegs {
  const ch = big(r.stake_change);
  return {
    staked: max0(ch),
    unstaked: max0(-ch),
    lusd: big(r.lusd_gain),
    eth: big(r.eth_gain),
    stake: big(r.stake_after),
  };
}

/** The PriceFeed's price (1e18, USD per ETH) as a number. */
export const priceUnits = (raw: string | null | undefined): number | null => {
  const v = big(raw);
  return v > ZERO ? units(v) : null;
};
