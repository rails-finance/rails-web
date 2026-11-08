// An illiquid MetaMorpho vault (rails-ops ui-jobs 540, Miles's ruling of
// 8 Nov 2026): the test, the arithmetic and the words, shared by the index,
// the rosters and the vault page.
// ----------------------------------------------------------------------------
// A vault is illiquid at a block when a market in its withdraw queue holds 10%
// or more of the queue's sum, is 99.9% or more borrowed, and has its
// AdaptiveCurveIRM's rate at target at the IRM's maximum. Every operand is a
// read at that one block: `position(id, vault)`, `market(id)`,
// `idToMarketParams(id)` and the IRM's `rateAtTarget(id)`.
//
// The stored rate at target is the one set when the market last settled. The
// IRM adapts it over the time since, `rateAtTarget × exp(speed × err × elapsed)`
// bounded to the IRM's range, and accrues on the adapted curve; the test takes
// the adapted rate at the block's timestamp. A market left full since its last
// settlement reaches the maximum from the minimum in about 55 days, so a stored
// figure at the minimum can sit under a market paying the ceiling.
//
// A leg's assets are Morpho Blue's stored totals (the market as last
// settled), the same figure V3 draws, and its share is over the queue's sum.
// What can be withdrawn is, per leg, the lesser of the vault's assets there
// and the market's free liquidity (supply less borrow), summed. Accrual adds
// the same interest to both sides of a market, so the free liquidity is the
// head's figure though the totals are stored.
//
// The borrow rate is the IRM's curve at the stored utilisation over the
// adapted rate at target: at its maximum it cannot adapt higher, and at full utilisation it is the ceiling,
// MAX_RATE_AT_TARGET × CURVE_STEEPNESS = 800% a year.
//
// Pure, with no imports: scripts/test/vault-illiquid.test.mjs reads it.

/** Morpho's AdaptiveCurveIRM on each chain, lowercased. */
export const ADAPTIVE_CURVE_IRM: Readonly<Record<number, string>> = {
  1: "0x870ac11d48b15db9a138cf899d20f13f79ba00bc",
  8453: "0x46415998764c29ab2a25cbea6254146d50d22687",
};

const WAD = BigInt("1000000000000000000");
const YEAR_SECONDS = 31_536_000;
/** ConstantsLib.MAX_RATE_AT_TARGET: 2.0 a year, per second, in WAD. */
export const MAX_RATE_AT_TARGET = (BigInt(2) * WAD) / BigInt(YEAR_SECONDS);
/** ConstantsLib.MIN_RATE_AT_TARGET: 0.1% a year, per second, in WAD. */
const MIN_RATE_AT_TARGET = WAD / BigInt(1000) / BigInt(YEAR_SECONDS);
/** ConstantsLib.ADJUSTMENT_SPEED: 50 a year, per second. */
const ADJUSTMENT_SPEED = 50 / YEAR_SECONDS;
const CURVE_STEEPNESS = 4;
const TARGET_UTILIZATION = 0.9;
/** The rate a market at full utilisation pays with its rate at target at the maximum. */
export const RATE_CEILING_YEARLY = (Number(MAX_RATE_AT_TARGET) * YEAR_SECONDS * CURVE_STEEPNESS) / 1e18;

/** The ruling's thresholds. */
export const ILLIQUID_MIN_SHARE = 0.1;
/** Utilisation at or above 999 / 1000. */
const UTIL_NUM = BigInt(999);
const UTIL_DEN = BigInt(1000);

/** One leg of the withdraw queue, as the reader hands it in. */
export interface IlliquidLegInput {
  id: string;
  /** Null on the idle market and where the token did not name itself. */
  collateralSymbol: string | null;
  isIdle: boolean;
  irm: string;
  lltv: number;
  /** The vault's assets in the market, on the stored totals. */
  vaultAssets: bigint;
  supplyAssets: bigint;
  borrowAssets: bigint;
  /** `market(id).lastUpdate`, a unix second. */
  lastUpdate: number;
  /** `rateAtTarget(id)` as stored, per second in WAD; null where it was not read. */
  rateAtTarget: bigint | null;
}

/** A market the test caught. Amounts are raw strings in the vault's asset. */
export interface IlliquidMarket {
  id: string;
  collateralSymbol: string | null;
  lltv: number;
  vaultAssets: string;
  /** Over the queue's sum, 0..1. */
  share: number;
  /** Borrow over supply, 0..1. */
  utilisation: number;
  /** The IRM's curve at `utilisation` over the adapted rate at target, a year, simple. */
  borrowRateYearly: number;
  lastUpdate: number;
}

export interface VaultIlliquid {
  block: number;
  /** In the queue's order. */
  markets: IlliquidMarket[];
  /** Σ over the caught markets' shares, 0..1. */
  share: number;
  /** Σ over the legs of min(vault's assets, supply − borrow), raw. */
  withdrawable: string;
}

/** Is a market's utilisation at or above 99.9%? A market with no supply is not. */
export const fullyBorrowed = (supply: bigint, borrow: bigint): boolean =>
  supply > BigInt(0) && borrow * UTIL_DEN >= supply * UTIL_NUM;

/** Does this leg need its `rateAtTarget` read: a borrowable market on the
 *  chain's AdaptiveCurveIRM at 99.9% or more? */
export const needsRateAtTarget = (
  chainId: number,
  leg: Pick<IlliquidLegInput, "isIdle" | "irm" | "supplyAssets" | "borrowAssets">,
): boolean =>
  !leg.isIdle &&
  leg.irm.toLowerCase() === ADAPTIVE_CURVE_IRM[chainId] &&
  fullyBorrowed(leg.supplyAssets, leg.borrowAssets);

const errAt = (utilisation: number) =>
  utilisation > TARGET_UTILIZATION
    ? (utilisation - TARGET_UTILIZATION) / (1 - TARGET_UTILIZATION)
    : (utilisation - TARGET_UTILIZATION) / TARGET_UTILIZATION;

/** The rate at target the IRM holds `elapsed` seconds after it stored
 *  `rateAtTarget` at `utilisation`: AdaptiveCurveIrm `_newRateAtTarget`, bounded
 *  to the IRM's range. */
export function adaptedRateAtTarget(rateAtTarget: bigint, utilisation: number, elapsed: number): bigint {
  const adapted = Number(rateAtTarget) * Math.exp(ADJUSTMENT_SPEED * errAt(utilisation) * Math.max(0, elapsed));
  if (adapted >= Number(MAX_RATE_AT_TARGET)) return MAX_RATE_AT_TARGET;
  if (adapted <= Number(MIN_RATE_AT_TARGET)) return MIN_RATE_AT_TARGET;
  return BigInt(Math.floor(adapted));
}

/** The AdaptiveCurveIRM's borrow rate at a utilisation, a year, simple. */
export function borrowRateYearly(rateAtTarget: bigint, utilisation: number): number {
  const err = errAt(utilisation);
  const curve = err < 0 ? (1 - 1 / CURVE_STEEPNESS) * err + 1 : (CURVE_STEEPNESS - 1) * err + 1;
  return ((Number(rateAtTarget) * YEAR_SECONDS) / 1e18) * curve;
}

/** The test over one vault's queue at one block, whose unix second is
 *  `timestamp`: null where no market is caught. */
export function vaultIlliquid(
  chainId: number,
  block: number,
  timestamp: number,
  legs: readonly IlliquidLegInput[],
): VaultIlliquid | null {
  const zero = BigInt(0);
  const sum = legs.reduce((s, l) => s + l.vaultAssets, zero);
  if (sum === zero) return null;
  const markets: IlliquidMarket[] = [];
  let withdrawable = zero;
  let caught = zero;
  for (const l of legs) {
    const free = l.supplyAssets > l.borrowAssets ? l.supplyAssets - l.borrowAssets : zero;
    withdrawable += l.vaultAssets < free ? l.vaultAssets : free;
    const share = Number((l.vaultAssets * BigInt(1_000_000)) / sum) / 1_000_000;
    if (share < ILLIQUID_MIN_SHARE || !needsRateAtTarget(chainId, l) || l.rateAtTarget == null) continue;
    const utilisation = Number((l.borrowAssets * BigInt(1_000_000)) / l.supplyAssets) / 1_000_000;
    const rateAtTarget = adaptedRateAtTarget(l.rateAtTarget, utilisation, timestamp - l.lastUpdate);
    if (rateAtTarget >= MAX_RATE_AT_TARGET) {
      caught += l.vaultAssets;
      markets.push({
        id: l.id,
        collateralSymbol: l.collateralSymbol,
        lltv: l.lltv,
        vaultAssets: l.vaultAssets.toString(),
        share,
        utilisation,
        borrowRateYearly: borrowRateYearly(rateAtTarget, utilisation),
        lastUpdate: l.lastUpdate,
      });
    }
  }
  if (markets.length === 0) return null;
  return {
    block,
    markets,
    share: Number((caught * BigInt(1_000_000)) / sum) / 1_000_000,
    withdrawable: withdrawable.toString(),
  };
}

// ── The words ───────────────────────────────────────────────────────────────

const pct = (x: number, digits: number) =>
  `${(Math.floor(x * 100 * 10 ** digits) / 10 ** digits).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;

/** "99.9%": a share or a utilisation, floored to one decimal, so a figure
 *  under 100% never prints as 100%. */
export const illiquidPct = (x: number): string => pct(x, 1);

/** "800%": a yearly rate, to the whole percent. */
export const ratePct = (yearly: number): string => `${Math.round(yearly * 100).toLocaleString("en-US")}%`;

/** A market by its collateral: "the RLP market", or its id's head where the
 *  token did not name itself. */
export const marketName = (m: Pick<IlliquidMarket, "collateralSymbol" | "id">): string =>
  m.collateralSymbol ?? `${m.id.slice(0, 10)}…`;

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The first sentence: which markets, how much of the vault, how borrowed.
 *  "The RLP market holds 99.9% of the vault, 100% borrowed at the rate
 *  ceiling (800% a year)." */
export function illiquidSentence(il: VaultIlliquid): string {
  const names = list(il.markets.map(marketName));
  const one = il.markets.length === 1;
  const utils = il.markets.map((m) => illiquidPct(m.utilisation));
  const low = il.markets.reduce((a, m) => Math.min(a, m.utilisation), 1);
  const high = il.markets.reduce((a, m) => Math.max(a, m.utilisation), 0);
  const borrowed = one
    ? utils[0]
    : illiquidPct(low) === illiquidPct(high)
      ? `each ${illiquidPct(low)}`
      : `${illiquidPct(low)} to ${illiquidPct(high)}`;
  return `The ${names} market${one ? " holds" : "s hold"} ${illiquidPct(il.share)} of the vault, ${borrowed} borrowed at the rate ceiling (${ratePct(RATE_CEILING_YEARLY)} a year).`;
}
