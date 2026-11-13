// An Euler V2 holding's figures from rails-server's raw reads (lib/euler/types.ts).
// One account's holding in one vault: a deposit (shares, redeemed for the
// asset at the vault's share price) or a loan (the vault is the account's
// controller), at the head and at the window's past block.
//
// Dollars only from the vault's oracle at the head, and only where the vault's
// unit of account is USD (rails-ops decision 0047 point 7); otherwise in the
// unit's token, or none where the unit is not a token.
//
// The 30-day figures state what Rails read (Fluid's rule): only where the
// account's holding in the vault matches at both reads. A deposit matches when
// its vault shares are the same; its earnings are what those shares redeem for
// now less what they redeemed for then. A loan matches when its debt now is its
// debt then grown by the vault's interest index alone, so nothing was borrowed
// or repaid; its interest is the debt now less the debt then. A holding that
// was zero at the past block was opened inside the window, and any other
// difference changed it: neither states a figure. The borrow APY is the vault's
// rate now compounded each second (lib/euler/apy.ts); the 30-day rates are the
// window's growth, the share price's and the interest index's.
//
// Pure: imports nothing through `@/`, so scripts/test can load it.

import { spyToApy } from "./apy";
import { EULER_DOLLARS, type EulerPositionRead, type EulerWalletRead, type Token } from "./types";

const DAY = 86_400;
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
  /** Interest index growth over the window, as a fraction. */
  indexGrowth: number | null;
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
  /** Whether the holding matched at both reads ("ok"), was zero at the past one ("opened"), or differed ("changed"). */
  windowState: WindowState;
  /** A matched deposit's earnings over the window, in the asset; null otherwise. */
  earned: number | null;
  /** A matched loan's interest over the window, in the asset; null otherwise. */
  interest: number | null;
  /** That figure in the unit of account at the head's price; null where unpriced or not stated. */
  windowValue: number | null;
  /** The vault's borrow APY at the head, from its per-second rate. */
  borrowApyNow: number;
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
  /** The loan can be liquidated: on the raw values, collateral at liquidation LTVs not greater than the debt. */
  liquidatable: boolean | null;
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

export type WindowState = "ok" | "opened" | "changed";

/** The holding at the window's past block against now: matched, opened inside the window, or changed. */
export function holdingState(r: EulerPositionRead, kind: "loan" | "deposit"): WindowState {
  const past = r.past;
  if (kind === "loan") {
    if (!past || past.debt === null || BigInt(past.debt) === BigInt(0)) return "opened";
    const a0 = past.interestAccumulator ? BigInt(past.interestAccumulator) : null;
    return sameDebt(past.debt, r.vault.debt, a0, BigInt(r.vault.interestAccumulator)) ? "ok" : "changed";
  }
  if (!past || past.shares === null || BigInt(past.shares) === BigInt(0)) return "opened";
  return past.shares === r.vault.shares ? "ok" : "changed";
}

export function eulerWindow(r: EulerPositionRead): EulerWindow {
  const days = (r.head.time - r.then.time) / DAY;
  const p1 = BigInt(r.vault.sharePrice);
  const p0 = r.past?.sharePrice ? BigInt(r.past.sharePrice) : null;
  const a1 = BigInt(r.vault.interestAccumulator);
  const a0 = r.past?.interestAccumulator ? BigInt(r.past.interestAccumulator) : null;
  const shareGrowth = p0 && p0 > BigInt(0) ? Number(p1 - p0) / Number(p0) : null;
  const indexGrowth = a0 && a0 > BigInt(0) ? scaled(((a1 - a0) * RAY) / a0, 27) : null;
  return { days, shareGrowth, indexGrowth };
}

/** Euler's boundary on the raw values: liquidation when the collateral at liquidation LTVs is not greater than the debt. */
export function liquidatable(liq: { collateralValue: string; liabilityValue: string }): boolean {
  return BigInt(liq.collateralValue) <= BigInt(liq.liabilityValue);
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
  const windowState = holdingState(r, kind);
  const ok = windowState === "ok" && r.past !== null;
  const earned =
    ok && kind === "deposit" && r.past!.assets != null ? scaled(BigInt(v.assets) - BigInt(r.past!.assets), dec) : null;
  const interest = ok && kind === "loan" ? scaled(BigInt(v.debt) - BigInt(r.past!.debt!), dec) : null;
  const windowFig = kind === "loan" ? interest : earned;
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
      ? Number((BigInt(liq.collateralValue) * BigInt(10) ** BigInt(12)) / BigInt(liq.liabilityValue)) / 1e12
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
    windowState,
    earned,
    interest,
    windowValue: windowFig === null || price === null ? null : windowFig * price,
    borrowApyNow: spyToApy(v.interestRate),
    utilisation:
      totalAssets > BigInt(0) ? Number((BigInt(v.totalBorrows) * BigInt(10) ** BigInt(9)) / totalAssets) / 1e9 : null,
    totalSupplied: scaled(v.totalAssets, dec),
    totalBorrowed: scaled(v.totalBorrows, dec),
    collaterals,
    health,
    liquidatable: liq && BigInt(liq.liabilityValue) > BigInt(0) ? liquidatable(liq) : null,
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
      // A loan vault the account also holds shares in draws its loan, then its deposit.
      .flatMap((h) => [
        ...(h.controller ? [{ h, kind: "loan" as const }] : []),
        ...(!h.controller || BigInt(h.shares) > BigInt(0) ? [{ h, kind: "deposit" as const }] : []),
      ])
      .map(({ h, kind }) => ({
        index: a.index,
        account: a.account,
        vault: h.vault,
        vaultSymbol: h.vaultSymbol,
        asset: h.asset,
        kind,
        amount: scaled(kind === "loan" ? h.debt : h.assets, h.asset.decimals),
        raw: kind === "loan" ? h.debt : h.assets,
        collateral: h.collateral,
      })),
  );
}
