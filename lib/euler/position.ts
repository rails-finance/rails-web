// An Euler V2 holding's figures from rails-server's raw reads (lib/euler/types.ts).
// One account's holding in one vault: a deposit (shares, redeemed for the
// asset at the vault's share price) or a loan (the vault is the account's
// controller), at the head and at the window's past block.
//
// Dollars only from the vault's oracle at the head, and only where the vault's
// unit of account is USD (rails-ops decision 0047 point 7); otherwise in the
// unit's token, or none where the unit is not a token. The 30-day figures
// apply the change in the vault's share price, or its interest index, to what
// the account holds now, annualised simply over the days between the reads.
//
// Pure: imports nothing through `@/`, so scripts/test can load it.

import { EULER_DOLLARS, type EulerPositionRead, type EulerWalletRead, type Token } from "./types";

const DAY = 86_400;
const YEAR_SECONDS = 365 * DAY;
/** Euler's interest rate and accumulator are scaled by 10^27. */
const RAY = BigInt(10) ** BigInt(27);

/** A raw integer scaled down by 10^places, as a float. */
export function scaled(raw: string | bigint, places: number): number {
  const v = BigInt(raw);
  const neg = v < BigInt(0);
  const a = neg ? -v : v;
  const p = BigInt(10) ** BigInt(places);
  const whole = a / p;
  const frac = a % p;
  const n = Number(whole) + Number(frac) / Number(p);
  return neg ? -n : n;
}

/** How a figure in the vault's unit of account is shown: dollars, a token, or not at all; "off"
 *  where the unit is USD and EULER_DOLLARS is false. */
export type UnitShow = { kind: "usd" } | { kind: "token"; symbol: string } | { kind: "none" } | { kind: "off" };
export function unitShow(u: EulerPositionRead["vault"]["unit"]): UnitShow {
  if (u.usd) return EULER_DOLLARS ? { kind: "usd" } : { kind: "off" };
  if (u.symbol) return { kind: "token", symbol: u.symbol };
  return { kind: "none" };
}

export interface EulerWindow {
  /** Days between the two reads. */
  days: number;
  /** Share price growth over the window, as a fraction; null where the vault had no price then. */
  shareGrowth: number | null;
  /** That growth annualised simply. */
  supplyRateYear: number | null;
  /** Interest index growth over the window, as a fraction. */
  indexGrowth: number | null;
  borrowRateYear: number | null;
}

export interface EulerPosition {
  chainId: EulerPositionRead["chainId"];
  account: string;
  owner: string | null;
  index: number | null;
  vault: string;
  vaultSymbol: string;
  asset: Token;
  unit: UnitShow;
  /** The holding's kind: a loan where the vault is the account's controller, a deposit otherwise. */
  kind: "loan" | "deposit";
  /** The asset the shares redeem for now. */
  supplied: number;
  borrowed: number;
  /** The unit's price of one whole asset at the head; null where the oracle did not answer. */
  price: number | null;
  suppliedValue: number | null;
  borrowedValue: number | null;
  window: EulerWindow;
  /** The asset the deposit's shares gained over the window, on the shares held now. */
  earned: number | null;
  /** The interest the debt held now gathered over the window. */
  interest: number | null;
  /** The account held the same shares, and the same debt, at the window's past block. */
  sameShares: boolean | null;
  borrowRateNow: number;
  utilisation: number | null;
  totalSupplied: number;
  totalBorrowed: number;
  collaterals: {
    vault: string;
    vaultSymbol: string;
    asset: Token;
    amount: number;
    value: number | null;
    ltvBorrow: number;
    ltvLiquidation: number;
  }[];
  /** The collateral's value at liquidation LTVs over the debt's; null without a loan. */
  health: number | null;
  /** The collateral's value, in the unit, as the controller's oracle prices it. */
  collateralValue: number | null;
  collateralFor: { vault: string; vaultSymbol: string }[];
  /** The account has this vault enabled as collateral, whether or not a loan counts it. */
  collateralEnabled: boolean;
}

/** The debt now is the past debt grown by the interest index alone, to a millionth: nothing was borrowed or repaid. */
function sameDebt(past: string | null, now: string, a0: bigint | null, a1: bigint): boolean {
  if (past === null || a0 === null || a0 === BigInt(0)) return false;
  const p = BigInt(past);
  if (p === BigInt(0)) return false;
  const grown = (p * a1) / a0;
  const d = grown > BigInt(now) ? grown - BigInt(now) : BigInt(now) - grown;
  return d * BigInt(1_000_000) <= BigInt(now) + BigInt(1_000_000);
}

export function eulerWindow(r: EulerPositionRead): EulerWindow {
  const days = (r.head.time - r.then.time) / DAY;
  const p1 = BigInt(r.vault.sharePrice);
  const p0 = r.past?.sharePrice ? BigInt(r.past.sharePrice) : null;
  const a1 = BigInt(r.vault.interestAccumulator);
  const a0 = r.past?.interestAccumulator ? BigInt(r.past.interestAccumulator) : null;
  const shareGrowth = p0 && p0 > BigInt(0) ? Number(p1 - p0) / Number(p0) : null;
  const indexGrowth = a0 && a0 > BigInt(0) ? scaled(((a1 - a0) * RAY) / a0, 27) : null;
  return {
    days,
    shareGrowth,
    supplyRateYear: shareGrowth === null || days <= 0 ? null : (shareGrowth * 365) / days,
    indexGrowth,
    borrowRateYear: indexGrowth === null || days <= 0 ? null : (indexGrowth * 365) / days,
  };
}

export function eulerPosition(r: EulerPositionRead): EulerPosition {
  const v = r.vault;
  const dec = v.asset.decimals;
  const unit = unitShow(v.unit);
  const kind = r.borrow ? "loan" : "deposit";
  const supplied = scaled(v.assets, dec);
  const borrowed = scaled(v.debt, dec);
  const priced = unit.kind === "usd" || unit.kind === "token";
  const price = v.assetPrice === null || !priced ? null : scaled(v.assetPrice, v.unit.decimals);
  const w = eulerWindow(r);
  const p0 = r.past?.sharePrice ? BigInt(r.past.sharePrice) : null;
  const earned =
    p0 === null
      ? null
      : scaled((BigInt(v.shares) * (BigInt(v.sharePrice) - p0)) / BigInt(10) ** BigInt(v.decimals), dec);
  const a0 = r.past?.interestAccumulator ? BigInt(r.past.interestAccumulator) : null;
  const a1 = BigInt(v.interestAccumulator);
  const interest = a0 === null || a1 === BigInt(0) ? null : scaled(BigInt(v.debt) - (BigInt(v.debt) * a0) / a1, dec);
  const sameShares =
    r.past === null ? null : kind === "loan" ? sameDebt(r.past.debt, v.debt, a0, a1) : r.past.shares === v.shares;
  const totalAssets = BigInt(v.totalAssets);
  const collaterals = (r.borrow?.collaterals ?? []).map((c) => ({
    vault: c.vault,
    vaultSymbol: c.vaultSymbol,
    asset: c.asset,
    amount: scaled(c.assets, c.asset.decimals),
    value: c.value === null || !priced ? null : scaled(c.value, v.unit.decimals),
    ltvBorrow: c.ltvBorrow / 10_000,
    ltvLiquidation: c.ltvLiquidation / 10_000,
  }));
  const liq = r.borrow?.liquidation;
  const health =
    liq && BigInt(liq.liabilityValue) > BigInt(0)
      ? Number((BigInt(liq.collateralValue) * BigInt(10) ** BigInt(6)) / BigInt(liq.liabilityValue)) / 1e6
      : null;
  const values = collaterals.map((c) => c.value);
  return {
    chainId: r.chainId,
    account: r.account,
    owner: r.owner,
    index: r.index,
    vault: v.address,
    vaultSymbol: v.symbol,
    asset: v.asset,
    unit,
    kind,
    supplied,
    borrowed,
    price,
    suppliedValue: price === null ? null : supplied * price,
    borrowedValue: price === null ? null : borrowed * price,
    window: w,
    earned,
    interest,
    sameShares,
    borrowRateNow: scaled((BigInt(v.interestRate) * BigInt(YEAR_SECONDS) * BigInt(10) ** BigInt(9)) / RAY, 9),
    utilisation:
      totalAssets > BigInt(0) ? Number((BigInt(v.totalBorrows) * BigInt(10) ** BigInt(9)) / totalAssets) / 1e9 : null,
    totalSupplied: scaled(v.totalAssets, dec),
    totalBorrowed: scaled(v.totalBorrows, dec),
    collaterals,
    health,
    collateralValue: r.borrow
      ? values.some((x) => x === null)
        ? null
        : values.reduce<number>((a, b) => a + (b ?? 0), 0)
      : null,
    collateralFor: r.collateralFor,
    collateralEnabled: r.collaterals.some((x) => x.toLowerCase() === v.address.toLowerCase()),
  };
}

/** A wallet's holdings as rows: one per account and vault, loans first within an account. */
export interface EulerWalletRow {
  index: number;
  account: string;
  vault: string;
  vaultSymbol: string;
  asset: Token;
  kind: "loan" | "deposit";
  amount: number;
  /** The amount's raw integer: the debt for a loan, the assets the shares redeem for otherwise. */
  raw: string;
  collateral: boolean;
}
export function walletRows(w: EulerWalletRead): EulerWalletRow[] {
  return w.accounts.flatMap((a) =>
    [...a.holdings]
      .sort((x, y) => Number(y.controller) - Number(x.controller))
      .map((h) => ({
        index: a.index,
        account: a.account,
        vault: h.vault,
        vaultSymbol: h.vaultSymbol,
        asset: h.asset,
        kind: h.controller ? ("loan" as const) : ("deposit" as const),
        amount: scaled(h.controller ? h.debt : h.assets, h.asset.decimals),
        raw: h.controller ? h.debt : h.assets,
        collateral: h.collateral,
      })),
  );
}
