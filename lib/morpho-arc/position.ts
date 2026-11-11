// The figures of a Morpho Blue position on Arc (rails-ops ui-jobs 577), from
// rails-server's raw reads (lib/morpho-arc/types.ts). Pure and client-safe.
//
// A market's totals are as Blue last settled them; the figures here bring them
// to the read's block the way Blue's MorphoBalancesLib does: the IRM's
// borrowRateView on the stored market, compounded over the seconds since the
// last update (MathLib.wTaylorCompounded), the fee's share minted to the fee
// recipient. Shares convert to assets with SharesMathLib's virtual shares and
// assets (1e6 and 1): supply rounds down, debt rounds up.
//
// Dollars (decision 0047): the loan token at its Chainlink feed on Arc at the
// same block; collateral at the market's oracle price into the loan token,
// then at that feed. A market whose loan token has no feed there has none.

import type {
  ArcMorphoMarket,
  ArcMorphoPosition,
  ArcMorphoPositionRead,
  ArcMorphoState,
  ArcMorphoToken,
  ArcMorphoWalletRead,
  ArcUsdFeed,
} from "./types";

// Relative imports and the zero address inline: scripts/test/morpho-arc.test.mjs loads this
// module under node's type stripping, which resolves no `@/` path.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const B = (v: string | number) => BigInt(v);
const WAD = B("1000000000000000000");
const VIRTUAL_SHARES = B(1000000);
const VIRTUAL_ASSETS = B(1);
const YEAR = 31_536_000;
const ORACLE_SCALE = 36;

const wMulDown = (x: bigint, y: bigint) => (x * y) / WAD;
const mulDivDown = (x: bigint, y: bigint, d: bigint) => (x * y) / d;
const mulDivUp = (x: bigint, y: bigint, d: bigint) => (x * y + (d - B(1))) / d;
/** MathLib.wTaylorCompounded: e^(x·n) − 1, three terms. */
export function wTaylorCompounded(x: bigint, n: bigint): bigint {
  const first = x * n;
  const second = (first * first) / (B(2) * WAD);
  const third = (second * first) / (B(3) * WAD);
  return first + second + third;
}
export const toAssetsDown = (shares: bigint, assets: bigint, total: bigint) =>
  mulDivDown(shares, assets + VIRTUAL_ASSETS, total + VIRTUAL_SHARES);
export const toAssetsUp = (shares: bigint, assets: bigint, total: bigint) =>
  mulDivUp(shares, assets + VIRTUAL_ASSETS, total + VIRTUAL_SHARES);
const toSharesDown = (assets: bigint, total: bigint, shares: bigint) =>
  mulDivDown(assets, shares + VIRTUAL_SHARES, total + VIRTUAL_ASSETS);

export interface Totals {
  supplyAssets: bigint;
  supplyShares: bigint;
  borrowAssets: bigint;
  borrowShares: bigint;
  /** The interest added since the last update, in loan units. */
  accrued: bigint;
  /** Seconds since the market last settled. */
  elapsed: number;
}

/** The market's totals at `time`: as stored, with the interest since its last update. */
export function accrue(s: ArcMorphoState, borrowRate: string | null, time: number): Totals {
  const elapsed = Math.max(0, time - Number(s.lastUpdate));
  let supplyAssets = B(s.totalSupplyAssets);
  let supplyShares = B(s.totalSupplyShares);
  let borrowAssets = B(s.totalBorrowAssets);
  const borrowShares = B(s.totalBorrowShares);
  let accrued = B(0);
  if (elapsed > 0 && borrowRate != null && borrowAssets > B(0)) {
    accrued = wMulDown(borrowAssets, wTaylorCompounded(B(borrowRate), B(elapsed)));
    borrowAssets += accrued;
    supplyAssets += accrued;
    const fee = B(s.fee);
    if (fee > B(0)) {
      const feeAmount = wMulDown(accrued, fee);
      supplyShares += toSharesDown(feeAmount, supplyAssets - feeAmount, supplyShares);
    }
  }
  return { supplyAssets, supplyShares, borrowAssets, borrowShares, accrued, elapsed };
}

export interface ArcTokenFacts {
  address: string;
  symbol: string;
  decimals: number;
}
export const tokenFacts = (address: string, tokens: Record<string, ArcMorphoToken>): ArcTokenFacts => {
  const t = tokens[address.toLowerCase()];
  return {
    address: address.toLowerCase(),
    symbol: t?.symbol ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
    decimals: t?.decimals ?? 18,
  };
};

/** The loan token's USD price at its feed, or null where Arc has none for it. */
export function loanUsd(loanToken: string, feeds: readonly ArcUsdFeed[]): { price: number; feed: ArcUsdFeed } | null {
  const f = feeds.find((x) => x.token === loanToken.toLowerCase());
  if (!f || f.answer == null || f.decimals == null) return null;
  const price = Number(f.answer) / 10 ** f.decimals;
  return price > 0 ? { price, feed: f } : null;
}

const scale = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;

export type ArcInterest =
  | { state: "ok"; amount: number; raw: bigint; usd: number | null }
  | { state: "opened" | "changed" | "unread" };

export interface ArcMorphoFigures {
  id: string;
  loan: ArcTokenFacts;
  collateralToken: ArcTokenFacts | null;
  isIdle: boolean;
  /** 0..1 */
  lltv: number;
  /** Supplied to lend, in loan units. */
  supplied: number;
  suppliedRaw: bigint;
  debt: number;
  debtRaw: bigint;
  collateral: number;
  collateralRaw: bigint;
  /** One whole collateral token in loan tokens, at the oracle; null with no price. */
  oraclePrice: number | null;
  /** The collateral's value in loan tokens. */
  collateralInLoan: number | null;
  /** debt ÷ collateral value, 0..1; null with no debt or no price. */
  ltv: number | null;
  /** collateral value × LLTV ÷ debt; null with no debt. */
  healthFactor: number | null;
  /** The debt the collateral can carry up to the LLTV, less the debt. */
  roomToBorrow: number | null;
  /** The collateral's price drop, 0..1, that takes the LTV to the LLTV. */
  liquidationDrop: number | null;
  /** Annual, simple: the per-second rate × a year. */
  borrowApr: number | null;
  supplyApr: number | null;
  utilization: number | null;
  /** The loan token's USD price; null where Arc has no feed for it. */
  usd: { price: number; feed: ArcUsdFeed } | null;
  suppliedUsd: number | null;
  debtUsd: number | null;
  collateralUsd: number | null;
  totals: Totals | null;
  lastUpdate: number;
}

/** A position's figures at the read's block. */
export function morphoArcFigures(
  m: ArcMorphoMarket,
  p: ArcMorphoPosition,
  time: number,
  tokens: Record<string, ArcMorphoToken>,
  feeds: readonly ArcUsdFeed[],
): ArcMorphoFigures {
  const loan = tokenFacts(m.loanToken, tokens);
  const isIdle = m.collateralToken === ZERO_ADDRESS;
  const coll = isIdle ? null : tokenFacts(m.collateralToken, tokens);
  const lltv = Number(m.lltv) / 1e18;
  const totals = m.state ? accrue(m.state, m.borrowRate, time) : null;
  const suppliedRaw = totals ? toAssetsDown(B(p.supplyShares), totals.supplyAssets, totals.supplyShares) : B(0);
  const debtRaw = totals ? toAssetsUp(B(p.borrowShares), totals.borrowAssets, totals.borrowShares) : B(0);
  const collateralRaw = B(p.collateral);
  const supplied = scale(suppliedRaw, loan.decimals);
  const debt = scale(debtRaw, loan.decimals);
  const collateral = coll ? scale(collateralRaw, coll.decimals) : 0;
  const oraclePrice =
    m.price != null && coll ? Number(m.price) / 10 ** (ORACLE_SCALE + loan.decimals - coll.decimals) : null;
  const collateralInLoan =
    m.price != null && coll ? scale((collateralRaw * B(m.price)) / B(10) ** B(ORACLE_SCALE), loan.decimals) : null;
  const ltv = debt > 0 && collateralInLoan ? debt / collateralInLoan : null;
  const healthFactor = debt > 0 && collateralInLoan != null ? (collateralInLoan * lltv) / debt : null;
  const utilization =
    totals && totals.supplyAssets > B(0) ? Number(totals.borrowAssets) / Number(totals.supplyAssets) : null;
  const borrowApr = m.borrowRate != null ? (Number(m.borrowRate) / 1e18) * YEAR : null;
  const fee = m.state ? Number(m.state.fee) / 1e18 : 0;
  const supplyApr = borrowApr != null && utilization != null ? borrowApr * utilization * (1 - fee) : null;
  const usd = loanUsd(m.loanToken, feeds);
  return {
    id: m.id,
    loan,
    collateralToken: coll,
    isIdle,
    lltv,
    supplied,
    suppliedRaw,
    debt,
    debtRaw,
    collateral,
    collateralRaw,
    oraclePrice,
    collateralInLoan,
    ltv,
    healthFactor,
    roomToBorrow: collateralInLoan != null && coll ? Math.max(0, collateralInLoan * lltv - debt) : null,
    liquidationDrop: ltv != null && lltv > 0 ? Math.max(0, 1 - ltv / lltv) : null,
    borrowApr,
    supplyApr,
    utilization,
    usd,
    suppliedUsd: usd ? supplied * usd.price : null,
    debtUsd: usd ? debt * usd.price : null,
    collateralUsd: usd && collateralInLoan != null ? collateralInLoan * usd.price : null,
    totals,
    lastUpdate: m.state ? Number(m.state.lastUpdate) : 0,
  };
}

export interface ArcMorphoPositionFigures extends ArcMorphoFigures {
  /** The interest the supply earned and the debt gathered over the 30 days, where the shares
   *  are the same at both reads. */
  supplyInterest: ArcInterest | null;
  debtInterest: ArcInterest | null;
  pastTotals: Totals | null;
}

/** One position, with the 30 days' interest from the market at the two blocks. */
export function morphoArcPosition(r: ArcMorphoPositionRead): ArcMorphoPositionFigures {
  const f = morphoArcFigures(r.market, r.position, r.head.time, r.tokens, r.usdFeeds);
  const past = r.past;
  const pastTotals = past ? accrue(past.state, past.borrowRate, r.then.time) : null;
  const side = (key: "supplyShares" | "borrowShares"): ArcInterest | null => {
    const now = B(r.position[key]);
    if (now === B(0)) return null;
    if (!past || !pastTotals || !f.totals) return { state: "unread" };
    const then = B(past.position[key]);
    if (then === B(0)) return { state: "opened" };
    if (then !== now) return { state: "changed" };
    const sup = key === "supplyShares";
    const a = sup
      ? toAssetsDown(now, f.totals.supplyAssets, f.totals.supplyShares) -
        toAssetsDown(now, pastTotals.supplyAssets, pastTotals.supplyShares)
      : toAssetsUp(now, f.totals.borrowAssets, f.totals.borrowShares) -
        toAssetsUp(now, pastTotals.borrowAssets, pastTotals.borrowShares);
    const amount = scale(a, f.loan.decimals);
    return { state: "ok", amount, raw: a, usd: f.usd ? amount * f.usd.price : null };
  };
  return { ...f, supplyInterest: side("supplyShares"), debtInterest: side("borrowShares"), pastTotals };
}

/** A wallet's positions, largest dollar value first (unpriced last, by creation). */
export function morphoArcWalletPositions(r: ArcMorphoWalletRead): (ArcMorphoFigures & { createdBlock: number })[] {
  return r.positions
    .map((m) => ({
      ...morphoArcFigures(m, m.position, r.head.time, r.tokens, r.usdFeeds),
      createdBlock: m.createdBlock,
    }))
    .sort((a, b) => {
      const va = (a.collateralUsd ?? 0) + (a.suppliedUsd ?? 0);
      const vb = (b.collateralUsd ?? 0) + (b.suppliedUsd ?? 0);
      return vb - va || a.createdBlock - b.createdBlock;
    });
}
