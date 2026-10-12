// What an Aave V3 event's explanation reads from the position state the open
// card reads (decision 0025), around this transaction and the previous one:
// the health factor either side, the event reserve's collateral flag and
// settings, what moved the health factor between the two events, and the
// event reserve's rate at both ends. Ethereum and Base read it; Seamless has
// no read. The sentences are lib/aave-v3/event-prose.ts's.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import {
  baseToUsd,
  beforeAtBlockPrices,
  findReserve,
  hfMoveParts,
  humanOf,
  sincePrevious,
  stateEmptyAfter,
  wadToNumber,
  type AaveV3PositionState,
} from "./position-state";

export interface V3StateRead {
  /** Health factor either side of the transaction; null where there is no debt. */
  hfBefore: number | null;
  hfAfter: number | null;
  /** The event reserve's collateral flag either side. */
  collateral?: { before: boolean; after: boolean };
  /** The health factor after the previous transaction, and what moved it since. */
  prevHf?: number | null;
  moveParts?: NonNullable<ReturnType<typeof hfMoveParts>>;
  /** Account totals before the transaction, in USD. */
  debtUsdBefore?: number;
  /** Balances after the transaction, per reserve and side. */
  left?: { symbol: string; side: "supply" | "debt"; amount: number }[];
  /** The event's reserve's loan-to-value at the block, in bps. */
  reserveLtvBps?: number | null;
  /** A liquidation: the health factor before the call at block N's oracle
   *  prices, the prices the call ran at (hfBefore is the end of N−1). */
  hfAtCall?: number | null;
  /** The account held nothing and owed nothing once the transaction had run. */
  emptyAfter?: boolean;
  /** The assets on as collateral once the transaction had run. */
  collateralSymbols?: string[];
  /** The event reserve's rate on its side after the previous event and at
   *  this block (fractions a year), and its average between the two from the
   *  reserve's index where the reads are at their blocks a day or more apart. */
  rate?: { side: "supply" | "debt"; then: number; now: number; avg: number | null };
}

/** The health factor's graded rule: under CLOSE the account is close to the
 *  liquidation line; from CLOSE to NEAR the fall that would liquidate it. */
export const CLOSE_LIQUIDATION_HF = 1.1;
export const NEAR_LIQUIDATION_HF = 1.2;

/** A reserve's yearly rate (ray) as a fraction. */
const rayFrac = (ray: string): number => Number(BigInt(ray) / BigInt(10) ** BigInt(21)) / 1e6;

/** The reserve index's growth between two reads (0.02728 = +2.728%), or null
 *  where either index is unread. */
function indexGrowth(from: string, to: string): number | null {
  try {
    const a = BigInt(from);
    const b = BigInt(to);
    if (a <= BigInt(0)) return null;
    return Number(((b - a) * BigInt(10) ** BigInt(12)) / a) / 1e12;
  } catch {
    return null;
  }
}

const atBlock = (s: AaveV3PositionState) => s.sources.balances === "chain-read-at-block";

export function v3StateRead(
  ctx: AaveV3Context,
  here: AaveV3PositionState | undefined,
  prev: AaveV3PositionState | undefined,
): V3StateRead | undefined {
  if (!here?.account) return undefined;
  const hfOf = (wad: string | null): number | null => (wad == null ? null : wadToNumber(wad));
  // A Base row names its reserve by symbol only; the read names it by address.
  const own = findReserve(
    here,
    ctx.eventType === "liquidation" ? ctx.collateralAsset : ctx.reserve,
    ctx.eventType === "liquidation" ? ctx.collateralSymbol : ctx.reserveSymbol,
  );
  const debtSide = ctx.eventType === "borrow" || ctx.eventType === "repay";
  const out: V3StateRead = {
    hfBefore: hfOf(here.account.before.healthFactor),
    hfAfter: hfOf(here.account.after.healthFactor),
    collateral: own?.collateral ?? undefined,
    reserveLtvBps: own?.ltvBps ?? null,
    ...(ctx.eventType === "liquidation" ? { hfAtCall: beforeAtBlockPrices(here)?.hf ?? null } : {}),
    emptyAfter: stateEmptyAfter(here),
    collateralSymbols: here.reserves
      .filter((r) => r.collateral?.after && r.decimals != null && Number(humanOf(r.supply.after, r.decimals)) > 0)
      .map((r) => r.symbol ?? r.reserve.slice(0, 6)),
    debtUsdBefore: baseToUsd(here.account.before.totalDebtBase),
    left: here.reserves.flatMap((r) => {
      const dec = r.decimals;
      if (dec == null) return [];
      return (["supply", "debt"] as const)
        .map((side) => ({
          symbol: r.symbol ?? r.reserve.slice(0, 6),
          side,
          amount: Number(humanOf((side === "supply" ? r.supply : r.debt).after, dec)),
        }))
        .filter((l) => l.amount > 0);
    }),
  };
  if (prev?.account && prev.txHash.toLowerCase() !== here.txHash.toLowerCase()) {
    out.prevHf = hfOf(prev.account.after.healthFactor);
    out.moveParts = hfMoveParts(prev, here) ?? undefined;
    // The event reserve's rate at both ends, where both reads are at their blocks.
    const side = debtSide ? "debt" : "supply";
    const p = own ? prev.reserves.find((r) => r.reserve.toLowerCase() === own.reserve.toLowerCase()) : undefined;
    const hl = own ? (side === "debt" ? own.debt : own.supply) : null;
    const pl = p ? (side === "debt" ? p.debt : p.supply) : null;
    const since = sincePrevious(here, prev, own?.reserve, side);
    if (hl?.rate && pl?.rate && since && atBlock(here) && atBlock(prev)) {
      const seconds = here.blockTimestamp - prev.blockTimestamp;
      const g = seconds >= 86400 ? indexGrowth(pl.index, hl.index) : null;
      out.rate = {
        side,
        then: rayFrac(pl.rate),
        now: rayFrac(hl.rate),
        avg: g != null && g >= 0 ? (g * 365 * 86400) / seconds : null,
      };
    }
  }
  return out;
}
