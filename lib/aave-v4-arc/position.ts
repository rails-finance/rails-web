// The figures of an Aave V4 spoke account on Arc (rails-ops ui-jobs 577), from
// rails-server's raw reads (lib/aave-v4-arc/types.ts). Pure, and imports
// nothing through `@/`, so scripts/test/aave-v4-arc.test.mjs runs it as is.
//
// - Amounts: the spoke's getUserSuppliedAssets / getUserTotalDebt, in whole tokens.
// - Dollars: the amount × the spoke oracle's getReservePrice at the same block
//   (rails-ops decision 0047), over the oracle's decimals.
// - Health factor: getUserAccountData's, over 1e18; none where the account owes nothing.
// - Borrow rate: the hub's drawn rate (a ray) as an APR; the account's premium
//   rides on top (riskPremium, basis points of the drawn debt).
// - 30-day interest: a position's shares are fixed between its own actions and
//   grow into tokens through the hub's indexes, so with the same shares at both
//   reads the interest is today's amount less the amount 30 days back. Where the
//   shares differ the figure is withheld and the reason named.

import type { ArcPositionRead, ArcPositionReserve, ArcUserPosition, ArcWalletRead } from "./types";

const RAY = 1e27;
/** getUserAccountData's health factor with no debt is uint256 max; anything above this is "no debt". */
const HF_NONE = 1e30;

export const tokens = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;
const priceOf = (raw: string | null, decimals: number) => (raw == null ? null : Number(raw) / 10 ** decimals);

export type ArcInterest =
  | { state: "ok"; amount: number; usd: number | null }
  | { state: "opened" | "changed" | "unread" };

export interface ArcReserveFigures {
  reserveId: number;
  symbol: string;
  underlying: string;
  decimals: number;
  supplied: number;
  debt: number;
  isCollateral: boolean;
  /** USD a token at the spoke oracle; null where it gave none. */
  price: number | null;
  suppliedUsd: number | null;
  debtUsd: number | null;
  /** A fraction, at the account's config key; null where unread. */
  collateralFactor: number | null;
  /** The bonus over 1, a fraction (0.05 for 105%). */
  maxLiquidationBonus: number | null;
  /** The hub's drawn rate as an APR fraction. */
  drawnApr: number | null;
  supplyInterest: ArcInterest | null;
  debtInterest: ArcInterest | null;
  paused: boolean;
  frozen: boolean;
}

export interface ArcPositionFigures {
  spoke: string;
  wallet: string;
  healthFactor: number | null;
  /** Fraction of the drawn debt (riskPremium bps ÷ 10,000). */
  riskPremium: number;
  reserves: ArcReserveFigures[];
  supplied: ArcReserveFigures[];
  borrowed: ArcReserveFigures[];
  suppliedUsd: number;
  collateralUsd: number;
  debtUsd: number;
  /** Symbols with a balance and no oracle price, left out of the totals. */
  unpriced: string[];
  /** Σ collateral × factor ÷ debt is the health factor; this is Σ collateral × factor in USD. */
  borrowLimitUsd: number;
}

const same = (a: string, b: string) => BigInt(a) === BigInt(b);
const zero = (a: string) => BigInt(a) === BigInt(0);

/** The 30-day interest of one side, or why it is withheld. */
export function interestOf(
  side: "supply" | "debt",
  r: Pick<ArcPositionReserve, "supplied" | "debt" | "position" | "past" | "decimals">,
  price: number | null,
): ArcInterest {
  if (!r.past) return { state: "unread" };
  const p: ArcUserPosition = r.past.position;
  const n: ArcUserPosition = r.position;
  const fixed =
    side === "supply"
      ? same(p.suppliedShares, n.suppliedShares)
      : same(p.drawnShares, n.drawnShares) &&
        same(p.premiumShares, n.premiumShares) &&
        same(p.premiumOffsetRay, n.premiumOffsetRay);
  if (!fixed) {
    const was = side === "supply" ? zero(p.suppliedShares) : zero(p.drawnShares) && zero(p.premiumShares);
    return { state: was ? "opened" : "changed" };
  }
  const now = side === "supply" ? r.supplied : r.debt;
  const then = side === "supply" ? r.past.supplied : r.past.debt;
  const amount = tokens((BigInt(now) - BigInt(then)).toString(), r.decimals);
  return { state: "ok", amount, usd: price == null ? null : amount * price };
}

export function arcPosition(r: ArcPositionRead): ArcPositionFigures {
  const pd = r.spoke.priceDecimals;
  const reserves: ArcReserveFigures[] = r.reserves.map((x) => {
    const price = priceOf(x.price, pd);
    const supplied = tokens(x.supplied, x.decimals);
    const debt = tokens(x.debt, x.decimals);
    return {
      reserveId: x.reserveId,
      symbol: x.symbol,
      underlying: x.underlying,
      decimals: x.decimals,
      supplied,
      debt,
      isCollateral: x.isCollateral,
      price,
      suppliedUsd: price == null ? null : supplied * price,
      debtUsd: price == null ? null : debt * price,
      collateralFactor: x.collateralFactor == null ? null : x.collateralFactor / 10_000,
      maxLiquidationBonus: x.maxLiquidationBonus == null ? null : Math.max(0, x.maxLiquidationBonus / 10_000 - 1),
      drawnApr: x.drawnRate == null ? null : Number(x.drawnRate) / RAY,
      supplyInterest: supplied > 0 ? interestOf("supply", x, price) : null,
      debtInterest: debt > 0 ? interestOf("debt", x, price) : null,
      paused: Boolean(x.paused),
      frozen: Boolean(x.frozen),
    };
  });
  const supplied = reserves.filter((x) => x.supplied > 0);
  const borrowed = reserves.filter((x) => x.debt > 0);
  const unpriced = reserves.filter((x) => (x.supplied > 0 || x.debt > 0) && x.price == null).map((x) => x.symbol);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const hf = Number(r.account.healthFactor) / 1e18;
  return {
    spoke: r.spoke.name,
    wallet: r.wallet,
    healthFactor: borrowed.length === 0 || !Number.isFinite(hf) || hf > HF_NONE ? null : hf,
    riskPremium: Number(r.account.riskPremium) / 10_000,
    reserves,
    supplied,
    borrowed,
    suppliedUsd: sum(supplied.map((x) => x.suppliedUsd)),
    collateralUsd: sum(supplied.filter((x) => x.isCollateral).map((x) => x.suppliedUsd)),
    debtUsd: sum(borrowed.map((x) => x.debtUsd)),
    unpriced,
    borrowLimitUsd: sum(
      supplied.filter((x) => x.isCollateral).map((x) => (x.suppliedUsd ?? 0) * (x.collateralFactor ?? 0)),
    ),
  };
}

export interface ArcWalletSpoke {
  key: string;
  name: string;
  address: string;
  healthFactor: number | null;
  supplied: { symbol: string; amount: number; usd: number | null }[];
  borrowed: { symbol: string; amount: number; usd: number | null }[];
  suppliedUsd: number;
  debtUsd: number;
}

/** The spokes a wallet holds something on, in the deployment's order. */
export function arcWalletSpokes(r: ArcWalletRead): ArcWalletSpoke[] {
  return r.spokes
    .map((s) => {
      const rows = s.reserves.map((x) => {
        const price = priceOf(x.price, s.priceDecimals);
        const sup = tokens(x.supplied, x.decimals);
        const debt = tokens(x.debt, x.decimals);
        return { symbol: x.symbol, sup, debt, price };
      });
      const supplied = rows
        .filter((x) => x.sup > 0)
        .map((x) => ({ symbol: x.symbol, amount: x.sup, usd: x.price == null ? null : x.sup * x.price }));
      const borrowed = rows
        .filter((x) => x.debt > 0)
        .map((x) => ({ symbol: x.symbol, amount: x.debt, usd: x.price == null ? null : x.debt * x.price }));
      const hf = Number(s.account.healthFactor) / 1e18;
      return {
        key: s.key,
        name: s.name,
        address: s.address,
        healthFactor: borrowed.length === 0 || hf > HF_NONE ? null : hf,
        supplied,
        borrowed,
        suppliedUsd: supplied.reduce((a, x) => a + (x.usd ?? 0), 0),
        debtUsd: borrowed.reduce((a, x) => a + (x.usd ?? 0), 0),
      };
    })
    .filter((s) => s.supplied.length > 0 || s.borrowed.length > 0);
}
