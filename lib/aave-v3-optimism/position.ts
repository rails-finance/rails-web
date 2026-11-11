// The figures of an Aave V3 account on Optimism (rails-ops ui-jobs 578), from
// rails-server's raw reads (lib/aave-v3-optimism/types.ts). Pure, and imports
// nothing through `@/`, so scripts/test/aave-v3-optimism.test.mjs runs it as is.
//
// - Amounts: the scaled balance × the reserve's normalized index ÷ 10^27,
//   rounded as the tokens round their balanceOf (down for an aToken, up for a
//   variable debt token; aave-v3-origin TokenMath, Pool revision 11).
// - Dollars: the amount × the AaveOracle's getAssetPrice at the same block over
//   10^8 (rails-ops decision 0047).
// - Health factor: getUserAccountData's, over 1e18; none where the account owes nothing.
// - Room to borrow: getUserAccountData's availableBorrowsBase over 10^8.
// - Liquidation threshold: the wallet's eMode category's where the category
//   counts the reserve, else the reserve's own (configuration bits 16-31).
// - 30-day interest: a scaled balance is fixed between the account's own
//   actions and grows into tokens through the index, so with the same scaled
//   balance at both reads the interest is the amount now less the amount 30 days
//   back. Where the scaled balance differs the figure is withheld and the reason named.

import type { OpPositionRead, OpPositionReserve } from "./types";

const RAY = BigInt("1000000000000000000000000000");
const ZERO = BigInt(0);
const ONE = BigInt(1);
/** getUserAccountData's health factor with no debt is uint256 max; anything above this is "no debt". */
const HF_NONE = 1e30;

export const tokens = (raw: bigint | string, decimals: number) => Number(raw) / 10 ** decimals;
/** An aToken's balance: scaled × index ÷ 10^27, rounded down. */
export const supplyRaw = (scaled: string, index: string) => (BigInt(scaled) * BigInt(index)) / RAY;
/** A variable debt token's balance: scaled × index ÷ 10^27, rounded up. */
export const debtRaw = (scaled: string, index: string) => {
  const p = BigInt(scaled) * BigInt(index);
  return p === ZERO ? ZERO : (p - ONE) / RAY + ONE;
};

export type OpInterest =
  | { state: "ok"; amount: number; usd: number | null }
  | { state: "opened" | "changed" | "unread" };

export interface OpReserveFigures {
  asset: string;
  symbol: string;
  decimals: number;
  supplied: number;
  debt: number;
  suppliedRaw: string;
  debtRaw: string;
  isCollateral: boolean;
  price: number | null;
  suppliedUsd: number | null;
  debtUsd: number | null;
  /** A fraction; the eMode category's where it counts this reserve. */
  liquidationThreshold: number | null;
  ltSource: "emode" | "reserve";
  supplyApr: number;
  borrowApr: number;
  supplyInterest: OpInterest | null;
  debtInterest: OpInterest | null;
  frozen: boolean;
  paused: boolean;
}

export interface OpPositionFigures {
  wallet: string;
  healthFactor: number | null;
  roomToBorrowUsd: number;
  emode: { id: number; label: string } | null;
  reserves: OpReserveFigures[];
  supplied: OpReserveFigures[];
  borrowed: OpReserveFigures[];
  suppliedUsd: number;
  collateralUsd: number;
  debtUsd: number;
  /** Symbols with a balance and no oracle price, left out of the totals. */
  unpriced: string[];
}

const bit = (word: bigint, i: number) => ((word >> BigInt(i)) & ONE) === ONE;

/** The 30-day interest of one side, or why it is withheld. */
export function interestOf(side: "supply" | "debt", r: OpPositionReserve, price: number | null): OpInterest {
  if (!r.past) return { state: "unread" };
  const nowScaled = side === "supply" ? r.scaledSupply : r.scaledDebt;
  const thenScaled = side === "supply" ? r.past.scaledSupply : r.past.scaledDebt;
  if (BigInt(nowScaled) !== BigInt(thenScaled)) return { state: BigInt(thenScaled) === ZERO ? "opened" : "changed" };
  const f = side === "supply" ? supplyRaw : debtRaw;
  const ix = side === "supply" ? "income" : "debt";
  const raw = f(nowScaled, r.indexes[ix]) - f(thenScaled, r.past.indexes[ix]);
  const amount = tokens(raw, r.decimals);
  return { state: "ok", amount, usd: price == null ? null : amount * price };
}

export function opPosition(r: OpPositionRead): OpPositionFigures {
  const bitmap = r.emode?.collateralBitmap != null ? BigInt(r.emode.collateralBitmap) : null;
  const reserves: OpReserveFigures[] = r.reserves.map((x) => {
    const price = x.price == null ? null : Number(x.price) / 1e8;
    const sRaw = supplyRaw(x.scaledSupply, x.indexes.income);
    const dRaw = debtRaw(x.scaledDebt, x.indexes.debt);
    const supplied = tokens(sRaw, x.decimals);
    const debt = tokens(dRaw, x.decimals);
    const conf = BigInt(x.configuration);
    const inEmode = bitmap != null && r.emode?.lt != null && bit(bitmap, x.id);
    const ownLt = Number((conf >> BigInt(16)) & BigInt(0xffff));
    const lt = inEmode ? r.emode!.lt! : ownLt;
    return {
      asset: x.asset,
      symbol: x.symbol,
      decimals: x.decimals,
      supplied,
      debt,
      suppliedRaw: sRaw.toString(),
      debtRaw: dRaw.toString(),
      isCollateral: x.isCollateral,
      price,
      suppliedUsd: price == null ? null : supplied * price,
      debtUsd: price == null ? null : debt * price,
      liquidationThreshold: lt > 0 ? lt / 10_000 : null,
      ltSource: inEmode ? "emode" : "reserve",
      supplyApr: Number(x.liquidityRate) / 1e27,
      borrowApr: Number(x.variableBorrowRate) / 1e27,
      supplyInterest: supplied > 0 ? interestOf("supply", x, price) : null,
      debtInterest: debt > 0 ? interestOf("debt", x, price) : null,
      frozen: bit(conf, 57),
      paused: bit(conf, 60),
    };
  });
  const supplied = reserves.filter((x) => x.supplied > 0);
  const borrowed = reserves.filter((x) => x.debt > 0);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const hf = Number(r.account.healthFactor) / 1e18;
  return {
    wallet: r.wallet,
    healthFactor: borrowed.length === 0 || !Number.isFinite(hf) || hf > HF_NONE ? null : hf,
    roomToBorrowUsd: Number(r.account.availableBorrowsBase) / 1e8,
    emode: r.emode ? { id: r.emode.id, label: r.emode.label ?? `eMode ${r.emode.id}` } : null,
    reserves,
    supplied,
    borrowed,
    suppliedUsd: sum(supplied.map((x) => x.suppliedUsd)),
    collateralUsd: sum(supplied.filter((x) => x.isCollateral).map((x) => x.suppliedUsd)),
    debtUsd: sum(borrowed.map((x) => x.debtUsd)),
    unpriced: reserves.filter((x) => (x.supplied > 0 || x.debt > 0) && x.price == null).map((x) => x.symbol),
  };
}
