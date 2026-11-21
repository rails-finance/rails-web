// The arithmetic of a Liquity V1 stability-pool deposit, on the raw integers
// the index and the chain answer (rails-ops reference/liquity-v1-stability-pool.md).
// Pure: no imports, so scripts/test/liquity-v1-sp.test.mjs loads it directly.
//
// At every touch the index's row satisfies
//   deposit_after = deposit_before − deposit_loss + top_up_or_withdrawal
// so over a life: deposited − withdrawn − burned = the deposit recorded at the
// last touch (deposits(depositor).initialValue). The pool pays the ETH and
// LQTY gains out at every touch, so nothing is stashed. Between touches,
// liquidations burn the deposit and pay ETH in, and the community issuance
// pays LQTY in: the pool's getCompoundedLUSDDeposit, getDepositorETHGain and
// getDepositorLQTYGain state them.

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

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** A front-end tag that names a front end (not the zero address). */
export const isTagged = (frontEnd: string | null | undefined): boolean =>
  !!frontEnd && frontEnd.toLowerCase() !== ZERO_ADDRESS;

/** The deposit's fraction of its pool: getCompoundedLUSDDeposit over
 *  getTotalLUSDDeposits, divided in integers to 1e-12 before it becomes a
 *  number. Null for an empty pool. */
export function poolShare(deposit: bigint, total: bigint): number | null {
  if (total <= ZERO) return null;
  const scale = BigInt("1000000000000");
  return Number((deposit * scale) / total) / 1e12;
}

export interface DepositLifetime {
  deposited: bigint;
  withdrawn: bigint;
  burned: bigint;
  /** The deposit recorded at the last touch. */
  recorded: bigint;
  /** ETH paid at touches. */
  ethGain: bigint;
  /** LQTY paid to the depositor at touches. */
  lqtyGain: bigint;
}

export function depositLifetime(row: {
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  eth_gain_raw: string;
  lqty_gain_raw: string;
  deposit_raw: string;
}): DepositLifetime {
  return {
    deposited: big(row.deposited_raw),
    withdrawn: big(row.withdrawn_raw),
    burned: big(row.burned_raw),
    recorded: big(row.deposit_raw),
    ethGain: big(row.eth_gain_raw),
    lqtyGain: big(row.lqty_gain_raw),
  };
}

/** deposited − withdrawn − burned − recorded: zero on every row the index
 *  serves (the deposit identity). */
export const depositGap = (l: DepositLifetime): bigint => l.deposited - l.withdrawn - l.burned - l.recorded;

/** The pool's getters at head, as raw integer strings. */
export interface DepositChainFigures {
  /** getCompoundedLUSDDeposit(depositor). */
  compoundedRaw: string;
  /** deposits(depositor).initialValue: the deposit recorded at the last touch. */
  recordedRaw: string;
  /** deposits(depositor).frontEndTag. */
  frontEnd: string;
  /** getDepositorETHGain(depositor): ETH paid in since the last touch. */
  ethGainRaw: string;
  /** getDepositorLQTYGain(depositor): LQTY issued to the deposit since the last touch. */
  lqtyGainRaw: string;
}

export interface DepositNow {
  /** getCompoundedLUSDDeposit. */
  now: bigint;
  /** recorded − now: burned since the last touch. */
  pendingLoss: bigint;
  /** getDepositorETHGain: what the next touch pays out in ETH. */
  pendingEth: bigint;
  /** getDepositorLQTYGain: the LQTY the deposit has accrued; the next touch
   *  pays this and the issuance it triggers. */
  pendingLqty: bigint;
}

/** The pending figures from the chain read alone: the card's headlines, which
 *  stand whether or not the index has served the deposit's last touch. */
export function depositNowFromChain(chain: DepositChainFigures): DepositNow {
  const now = big(chain.compoundedRaw);
  return {
    now,
    pendingLoss: max0(big(chain.recordedRaw) - now),
    pendingEth: big(chain.ethGainRaw),
    pendingLqty: big(chain.lqtyGainRaw),
  };
}

/** A listing card's Deposit headline: the head read where one is handed (the
 *  wallet page), else the deposit recorded at the last touch, approximate. */
export function listingDeposit(
  recordedRaw: string,
  now: DepositNow | null | undefined,
): { raw: bigint; approx: boolean; at: "head" | "last-touch" } {
  return now ? { raw: now.now, approx: false, at: "head" } : { raw: big(recordedRaw), approx: true, at: "last-touch" };
}

/** The same figures laid over the index, or null where the chain has seen a
 *  touch the index has not (its recorded deposit differs), so the two would
 *  not add up. */
export function depositNow(l: DepositLifetime, chain: DepositChainFigures): DepositNow | null {
  if (big(chain.recordedRaw) !== l.recorded) return null;
  return depositNowFromChain(chain);
}

/** The figures of one touch that the Lifetime flows read. */
export interface DepositOp {
  top_up_or_withdrawal: string | null;
  deposit_loss: string | null;
  eth_gain: string | null;
  lqty_gain: string | null;
  deposit_after: string | null;
}

/** One touch's legs. LUSD: deposit before + deposited − withdrawn − burned =
 *  deposit after. ETH and LQTY: paid in and paid out at the touch. */
export interface DepositLegs {
  deposited: bigint;
  withdrawn: bigint;
  burned: bigint;
  eth: bigint;
  lqty: bigint;
  deposit: bigint;
}

export function depositLegs(r: DepositOp): DepositLegs {
  const ch = big(r.top_up_or_withdrawal);
  return {
    deposited: max0(ch),
    withdrawn: max0(-ch),
    burned: big(r.deposit_loss),
    eth: big(r.eth_gain),
    lqty: big(r.lqty_gain),
    deposit: big(r.deposit_after),
  };
}

/** The PriceFeed's price (1e18, USD per ETH) as a number. */
export const priceUnits = (raw: string | null | undefined): number | null => {
  const v = big(raw);
  return v > ZERO ? units(v) : null;
};

/** The LUSD bar's total from the legs alone, oldest first: deposited −
 *  withdrawn − burned. On a whole life it equals the last row's
 *  deposit_after (the identity the Lifetime flows rest on). */
export function barTotal(legs: DepositLegs[]): bigint {
  let deposit = ZERO;
  for (const g of legs) deposit += g.deposited - g.withdrawn - g.burned;
  return deposit;
}
