// The figures of a Compound V3 account on Optimism (rails-ops ui-jobs 578), from
// rails-server's raw reads (lib/compound-v3-optimism/types.ts). Pure, and imports
// nothing through `@/`, so scripts/test/compound-v3-optimism.test.mjs runs it as is.
//
// - Base: balanceOf or borrowBalanceOf over 10^decimals, interest included.
// - Collateral: collateralBalanceOf over getAssetInfo's scale.
// - Prices: getPrice on each asset's feed over 10^8, in the Comet's quote unit
//   (dollars, or ETH in the WETH Comet). Dollars: the quote-unit value, times
//   the USDC Comet's WETH price in the WETH Comet (rails-ops decision 0047).
// - The account's terms, as Comet judges them and as the other chains' cards
//   state them (components/protocol/compound/compound-risk-slot.tsx):
//   borrow capacity Σ amount × price × borrowCollateralFactor, liquidation
//   capacity the same with liquidateCollateralFactor, debt value the borrow
//   times the base price; borrowing limit used is debt ÷ borrow capacity, the
//   absorb line reached is debt ÷ liquidation capacity, the drop it takes is
//   1 − debt ÷ liquidation capacity.
// - 30-day interest: an account's principal is fixed between its own actions
//   and grows into base through the Comet's supply or borrow index, so with the
//   same principal at both reads the interest is the balance now less the
//   balance 30 days back. Where the principal differs the figure is withheld
//   and the reason named.

import type { OpcAccount, OpcEthUsd, OpcPositionRead } from "./types";

const SECONDS_PER_YEAR = 31_536_000;
const ZERO = BigInt(0);

export const tokens = (raw: bigint | string, decimals: number) => Number(raw) / 10 ** decimals;
const scaled = (raw: string, scale: string) => Number(raw) / Number(scale);

export type OpcInterest =
  | { state: "ok"; amount: number; usd: number | null }
  | { state: "opened" | "changed" | "unread" };

export interface OpcCollateralFigures {
  asset: string;
  symbol: string;
  amount: number;
  /** One token in the quote unit. */
  price: number;
  value: number;
  usd: number | null;
  borrowFactor: number;
  liquidateFactor: number;
  liquidationFactor: number;
}

export interface OpcAccountFigures {
  key: string;
  label: string;
  comet: string;
  baseSymbol: string;
  baseToken: string;
  quoteUnit: "USD" | "ETH";
  /** Dollars per quote unit: 1, the ETH price, or null where it was not read. */
  fx: number | null;
  basePrice: number;
  supplied: number;
  borrowed: number;
  suppliedUsd: number | null;
  borrowedUsd: number | null;
  collateral: OpcCollateralFigures[];
  collateralValue: number;
  collateralUsd: number | null;
  borrowCapacity: number;
  liquidationCapacity: number;
  debtValue: number;
  /** debt ÷ borrow capacity; null with no debt. */
  limitUsed: number | null;
  /** debt ÷ liquidation capacity; null with no debt. */
  lineReached: number | null;
  /** Base the account can still borrow; null with no collateral. */
  roomToBorrow: number | null;
  /** The debt, in base, at which the Comet can absorb the account. */
  absorbedAt: number | null;
  /** The fall in collateral value, every asset together, that reaches the absorb line. */
  dropToLine: number | null;
  isBorrowCollateralized: boolean;
  isLiquidatable: boolean;
  /** Symbols held with a zero price, left out of the dollar totals. */
  unpriced: string[];
  held: boolean;
}

export interface OpcPositionFigures extends OpcAccountFigures {
  supplyApr: number;
  borrowApr: number;
  utilization: number;
  interest: OpcInterest | null;
  /** COMP owed by CometRewards, in tokens; null where the read failed. */
  rewardsOwed: number | null;
}

export function fxOf(quoteUnit: "USD" | "ETH", ethUsd: OpcEthUsd | null): number | null {
  if (quoteUnit === "USD") return 1;
  return ethUsd && ethUsd.price !== "0" ? Number(ethUsd.price) / 1e8 : null;
}

export function accountFigures(a: OpcAccount, ethUsd: OpcEthUsd | null): OpcAccountFigures {
  const fx = fxOf(a.quoteUnit, ethUsd);
  const basePrice = Number(a.basePrice) / 1e8;
  const supplied = tokens(a.supply, a.baseDecimals);
  const borrowed = tokens(a.borrow, a.baseDecimals);
  const collateral: OpcCollateralFigures[] = a.collateral
    .map((c) => {
      const amount = scaled(c.balance, c.scale);
      const price = Number(c.price) / 1e8;
      const value = amount * price;
      return {
        asset: c.asset,
        symbol: c.symbol,
        amount,
        price,
        value,
        usd: fx == null || price === 0 ? null : value * fx,
        borrowFactor: Number(c.borrowCollateralFactor) / 1e18,
        liquidateFactor: Number(c.liquidateCollateralFactor) / 1e18,
        liquidationFactor: Number(c.liquidationFactor) / 1e18,
      };
    })
    .sort((x, y) => y.value - x.value);
  const sum = (f: (c: OpcCollateralFigures) => number) => collateral.reduce((t, c) => t + f(c), 0);
  const borrowCapacity = sum((c) => c.value * c.borrowFactor);
  const liquidationCapacity = sum((c) => c.value * c.liquidateFactor);
  const collateralValue = sum((c) => c.value);
  const debtValue = borrowed * basePrice;
  const debt = debtValue > 0;
  const toBase = (v: number) => (basePrice > 0 ? v / basePrice : v);
  return {
    key: a.key,
    label: a.label,
    comet: a.comet,
    baseSymbol: a.baseSymbol,
    baseToken: a.baseToken,
    quoteUnit: a.quoteUnit,
    fx,
    basePrice,
    supplied,
    borrowed,
    suppliedUsd: fx == null ? null : supplied * basePrice * fx,
    borrowedUsd: fx == null ? null : debtValue * fx,
    collateral,
    collateralValue,
    collateralUsd: fx == null ? null : collateral.reduce((t, c) => t + (c.usd ?? 0), 0),
    borrowCapacity,
    liquidationCapacity,
    debtValue,
    limitUsed: debt && borrowCapacity > 0 ? debtValue / borrowCapacity : null,
    lineReached: debt && liquidationCapacity > 0 ? debtValue / liquidationCapacity : null,
    roomToBorrow: collateral.length ? Math.max(0, toBase(borrowCapacity - debtValue)) : null,
    absorbedAt: debt && liquidationCapacity > 0 ? toBase(liquidationCapacity) : null,
    dropToLine: debt && liquidationCapacity > debtValue ? 1 - debtValue / liquidationCapacity : null,
    isBorrowCollateralized: a.isBorrowCollateralized,
    isLiquidatable: a.isLiquidatable,
    unpriced: collateral.filter((c) => c.price === 0).map((c) => c.symbol),
    held: supplied > 0 || borrowed > 0 || collateral.length > 0,
  };
}

/** The 30-day interest on the base balance, or why it is withheld; null with no base balance. */
export function interestOf(r: OpcPositionRead, fx: number | null): OpcInterest | null {
  const a = r.account;
  const principal = BigInt(a.principal);
  if (principal === ZERO) return null;
  if (!r.past) return { state: "unread" };
  const then = BigInt(r.past.principal);
  if (then !== principal) return { state: then === ZERO ? "opened" : "changed" };
  const lend = principal > ZERO;
  const raw = lend ? BigInt(a.supply) - BigInt(r.past.supply) : BigInt(a.borrow) - BigInt(r.past.borrow);
  const amount = tokens(raw, a.baseDecimals);
  const basePrice = Number(a.basePrice) / 1e8;
  return { state: "ok", amount, usd: fx == null ? null : amount * basePrice * fx };
}

export function positionFigures(r: OpcPositionRead): OpcPositionFigures {
  const f = accountFigures(r.account, r.ethUsd);
  return {
    ...f,
    supplyApr: (Number(r.supplyRate) * SECONDS_PER_YEAR) / 1e18,
    borrowApr: (Number(r.borrowRate) * SECONDS_PER_YEAR) / 1e18,
    utilization: Number(r.utilization) / 1e18,
    interest: interestOf(r, f.fx),
    rewardsOwed: r.rewards ? tokens(r.rewards.owed, 18) : null,
  };
}
