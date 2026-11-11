// A Fluid vault position on Base, worked from rails-server's raw read
// (rails-ops ui-jobs 574; the read is lib/fluid-base/types.ts): amounts in each
// side's unit, the ratio and limits in the vault oracle's debt-per-collateral
// space (the engine's own, as on Ethereum: lib/sources/chain/fluid-position.ts),
// 30-day interest from the vault's exchange prices at the two reads, and dollar
// values at Aave V3 Base's oracle price at the head.
//
// Interest: a position's raw amounts are fixed between operations and become
// token amounts through the vault's exchange prices (raw × price ÷ 1e12), so
// with the same raw amounts at both reads the interest is today's amount less
// the raw amount at the past price. Where the raw amounts differ (an operation
// or a liquidation inside the window) or the NFT was minted inside it, no
// figure is stated.

import type { FluidBaseLeg, FluidBasePositionRead, FluidBaseRead } from "./types";
import { FLUID_BASE_DOLLARS } from "./dollars";

const PRECISION = BigInt(10) ** BigInt(12);

/** Raw integer → full-precision decimal string. */
export function exact(raw: bigint, decimals: number): string {
  const neg = raw < BigInt(0);
  const a = neg ? -raw : raw;
  const div = BigInt(10) ** BigInt(decimals);
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
const human = (raw: bigint, decimals: number) => Number(exact(raw, decimals));

/** Decimals of a side's amounts: the token's, 18 for DEX shares. */
export const legDecimals = (l: FluidBaseLeg): number => (l.kind === "shares" ? 18 : l.token.decimals);
/** What a side's amounts are counted in. */
export const legUnit = (l: FluidBaseLeg): string =>
  l.kind === "shares" ? `${l.token.symbol}·${l.token1?.symbol ?? "?"} shares` : l.token.symbol;

/** The position's raw amount on one side at a read: amount × 1e12 ÷ the vault's exchange price. */
export function rawOf(r: FluidBaseRead, side: "supply" | "borrow"): bigint {
  const amount = BigInt(side === "supply" ? r.supply : r.borrow);
  const price = BigInt(side === "supply" ? r.vaultSupplyExchangePrice : r.vaultBorrowExchangePrice);
  return price === BigInt(0) ? BigInt(0) : (amount * PRECISION) / price;
}

export type InterestWindow =
  | { state: "ok"; supply: bigint; borrow: bigint }
  | { state: "opened" }
  | { state: "changed" };

/** Interest over the window on each side, in raw token units, or why there is none. */
export function interestWindow(r: FluidBasePositionRead): InterestWindow {
  const past = r.past;
  if (!past) return { state: "opened" };
  const same = (side: "supply" | "borrow") => {
    const d = rawOf(r.now, side) - rawOf(past, side);
    return d >= BigInt(-1) && d <= BigInt(1);
  };
  if (!same("supply") || !same("borrow") || past.isLiquidated !== r.now.isLiquidated) return { state: "changed" };
  const earned = (side: "supply" | "borrow") => {
    const now = BigInt(side === "supply" ? r.now.supply : r.now.borrow);
    const pThen = BigInt(side === "supply" ? past.vaultSupplyExchangePrice : past.vaultBorrowExchangePrice);
    const then = (rawOf(r.now, side) * pThen) / PRECISION;
    const d = now - then;
    return d > BigInt(0) ? d : BigInt(0);
  };
  return { state: "ok", supply: earned("supply"), borrow: earned("borrow") };
}

export interface FluidBasePosition {
  id: string;
  vault: string;
  owner: string;
  supplyLeg: FluidBaseLeg;
  borrowLeg: FluidBaseLeg;
  colUnit: string;
  debtUnit: string;
  supply: number;
  supplyExact: string;
  borrow: number;
  borrowExact: string;
  hasDebt: boolean;
  isEmpty: boolean;
  isLiquidated: boolean;
  /** Debt per collateral, human scale. */
  priceOperate: number | null;
  priceLiquidate: number | null;
  /** borrow ÷ (supply × liquidate price); null without debt. */
  ratio: number | null;
  /** Fractions of 1. */
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationMaxLimit: number;
  liquidationPenalty: number;
  /** Debt the position can add before the collateral factor, in the debt unit. */
  borrowRoom: number | null;
  /** The debt-per-collateral price at which the ratio reaches the liquidation threshold. */
  liquidationPrice: number | null;
  /** Annual percent; null on a DEX-share side. */
  supplyRate: number | null;
  borrowRate: number | null;
  interest:
    | { state: "ok"; supply: number; supplyExact: string; borrow: number; borrowExact: string }
    | { state: "opened" }
    | { state: "changed" };
  /** Dollars at Aave V3 Base's oracle at the head; null where the side is unpriced. */
  usd: {
    supplyPrice: number | null;
    borrowPrice: number | null;
    supply: number | null;
    borrow: number | null;
    supplyInterest: number | null;
    borrowInterest: number | null;
  };
}

/** `dollars` is FLUID_BASE_DOLLARS (lib/fluid-base/dollars.ts); off, every dollar figure is null. */
export function fluidBasePosition(r: FluidBasePositionRead, dollars: boolean = FLUID_BASE_DOLLARS): FluidBasePosition {
  const cd = legDecimals(r.supplyLeg);
  const dd = legDecimals(r.borrowLeg);
  const n = r.now;
  const supplyRaw = BigInt(n.supply);
  const borrowRaw = BigInt(n.borrow);
  const supply = human(supplyRaw, cd);
  const borrow = human(borrowRaw, dd);
  const scale = 27 + dd - cd;
  const price = (raw: string) => (BigInt(raw) > BigInt(0) ? human(BigInt(raw), scale) : null);
  const priceOperate = price(n.oraclePriceOperate);
  const priceLiquidate = price(n.oraclePriceLiquidate);
  const frac = (x: number) => x / 1e4;
  const collateralFactor = frac(n.collateralFactor);
  const liquidationThreshold = frac(n.liquidationThreshold);
  const hasDebt = borrowRaw > BigInt(0);
  const ratio = hasDebt && supply > 0 && priceLiquidate != null ? borrow / (supply * priceLiquidate) : null;
  const borrowRoom =
    supply > 0 && priceLiquidate != null ? Math.max(0, supply * priceLiquidate * collateralFactor - borrow) : null;
  const liquidationPrice =
    hasDebt && supply > 0 && liquidationThreshold > 0 ? borrow / (supply * liquidationThreshold) : null;
  const rate = (raw: string, leg: FluidBaseLeg) => (leg.kind === "shares" ? null : Number(raw) / 100);
  const w = interestWindow(r);
  const interest: FluidBasePosition["interest"] =
    w.state === "ok"
      ? {
          state: "ok",
          supply: human(w.supply, cd),
          supplyExact: exact(w.supply, cd),
          borrow: human(w.borrow, dd),
          borrowExact: exact(w.borrow, dd),
        }
      : w;
  const unit = Number(r.usd.baseUnit) || 1e8;
  const usdPrice = (raw: string | null) => (!dollars || raw == null ? null : Number(raw) / unit);
  const supplyPrice = usdPrice(r.usd.supply);
  const borrowPrice = usdPrice(r.usd.borrow);
  const times = (a: number, p: number | null) => (p == null ? null : a * p);
  return {
    id: r.id,
    vault: r.vault,
    owner: n.owner,
    supplyLeg: r.supplyLeg,
    borrowLeg: r.borrowLeg,
    colUnit: legUnit(r.supplyLeg),
    debtUnit: legUnit(r.borrowLeg),
    supply,
    supplyExact: exact(supplyRaw, cd),
    borrow,
    borrowExact: exact(borrowRaw, dd),
    hasDebt,
    isEmpty: supplyRaw === BigInt(0) && borrowRaw === BigInt(0),
    isLiquidated: n.isLiquidated,
    priceOperate,
    priceLiquidate,
    ratio,
    collateralFactor,
    liquidationThreshold,
    liquidationMaxLimit: frac(n.liquidationMaxLimit),
    liquidationPenalty: frac(n.liquidationPenalty),
    borrowRoom,
    liquidationPrice,
    supplyRate: rate(n.supplyRateVault, r.supplyLeg),
    borrowRate: rate(n.borrowRateVault, r.borrowLeg),
    interest,
    usd: {
      supplyPrice,
      borrowPrice,
      supply: times(supply, supplyPrice),
      borrow: times(borrow, borrowPrice),
      supplyInterest: interest.state === "ok" ? times(interest.supply, supplyPrice) : null,
      borrowInterest: interest.state === "ok" ? times(interest.borrow, borrowPrice) : null,
    },
  };
}
