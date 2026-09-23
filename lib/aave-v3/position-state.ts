// The position state of an Aave V3 Ethereum account around one event's
// transaction — the wire shape of /api/aave-v3/timeline/position-state and the
// arithmetic the open card does on it (rails-ops TO-DO-ui-jobs §19).
// ----------------------------------------------------------------------------
// Balances are exact integers as strings, in the reserve's own units; prices are
// the market oracle's base currency (USD, 8 decimals on Aave V3 Ethereum); ratios
// are basis points; the health factor is a wad. Every figure stays a bigint until
// the one step that makes a display number, so nothing exact is rebuilt from a
// rounded float.
//
// Client-safe: no RPC, no server imports.

import { formatUnitsExact } from "@/lib/utils/format";

/** One side of one reserve, before and after the event's transaction. */
export interface AaveV3PositionStateLeg {
  /** Balance in underlying units, interest to the block's timestamp included. */
  before: string;
  after: string;
  /** Σ scaled deltas ordered by (block, tx index): strictly before the
   *  transaction, and through it. */
  scaledBefore: string;
  scaledAfter: string;
  /** The reserve index accrued to the block timestamp (ray). */
  index: string;
  /** The ReserveDataUpdated row the index was accrued from. */
  rduBlock: number;
  rduTxHash: string;
  rduTimestamp: number;
  /** The rate that row carried (ray): liquidity rate on supply, variable
   *  borrow rate on debt. */
  rate: string;
}

export interface AaveV3PositionStateReserve {
  /** Underlying token, lowercase. */
  reserve: string;
  symbol: string | null;
  decimals: number | null;
  supply: AaveV3PositionStateLeg;
  debt: AaveV3PositionStateLeg;
  /** Null where the collateral flags are not known at this block. */
  collateral: { before: boolean; after: boolean } | null;
  /** Oracle price at the block, in base units (8 decimals). */
  priceBase: string | null;
  ltvBps: number | null;
  liquidationThresholdBps: number | null;
  /** The reserve belongs to the wallet's eMode category at this block. */
  inEmode: boolean | null;
}

export interface AaveV3EmodeCategory {
  label: string | null;
  ltvBps: number;
  liquidationThresholdBps: number;
  priceSource: string | null;
  generation: "bitmap" | "legacy";
}

export interface AaveV3AccountSide {
  totalCollateralBase: string;
  totalDebtBase: string;
  ltvBps: number;
  liquidationThresholdBps: number;
  /** Wad; null when the account has no debt. */
  healthFactor: string | null;
}

export interface AaveV3PositionState {
  wallet: string;
  market: string;
  marketKey: string;
  block: number;
  txHash: string;
  txIndex: number;
  blockTimestamp: number;
  /** Settings and market reads both present. */
  complete: boolean;
  reserves: AaveV3PositionStateReserve[];
  /** Category id before and after (0 = none); null where settings are unknown. */
  emode: { before: number; after: number; categories: Record<string, AaveV3EmodeCategory> } | null;
  /** Null unless complete. */
  account: { before: AaveV3AccountSide; after: AaveV3AccountSide } | null;
  sources: {
    balances: "scaled-deltas";
    settings: "pool-events" | null;
    market: "chain-read-at-block" | null;
    marketReadBlock: number | null;
    poolRevision: number | null;
  };
  /** Machine codes, e.g. `negative_scaled_sum:0x…:debt`. */
  notes: string[];
}

const TEN = BigInt(10);
const ZERO = BigInt(0);
const pow10 = (n: number): bigint => TEN ** BigInt(Math.max(0, n));

/** An integer string as a bigint; anything unreadable is zero. */
export function big(s: string | null | undefined): bigint {
  if (s == null || s === "") return ZERO;
  try {
    return BigInt(s.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** The leg held anything on either side of the transaction. */
export const legHeld = (leg: AaveV3PositionStateLeg | null | undefined): boolean =>
  !!leg && (big(leg.before) > ZERO || big(leg.after) > ZERO);

/** Exact decimal string of a raw amount: "1234500000" at 6 → "1234.5". */
export const humanOf = (raw: string, decimals: number): string => formatUnitsExact(raw, decimals);

/** An exact decimal string with its integer part grouped: "1234567.5" →
 *  "1,234,567.5". The receipt's exact figure, never rounded. */
export function groupExact(human: string): string {
  const neg = human.startsWith("-");
  const [int, frac] = (neg ? human.slice(1) : human).split(".");
  return `${neg ? "−" : ""}${big(int).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** A raw reserve amount valued at an oracle price in base units:
 *  raw × price ÷ 10^(decimals + 8), kept to four decimals of a dollar before it
 *  leaves bigint. */
export function rawToUsd(raw: string, priceBase: string, decimals: number): number {
  return Number((big(raw) * big(priceBase)) / pow10(decimals + 4)) / 1e4;
}

/** Base-currency units (8 decimals) to dollars. */
export const baseToUsd = (base: string): number => Number(big(base) / pow10(4)) / 1e4;

/** A wad (18 decimals) to a number, four decimals kept. */
export const wadToNumber = (wad: string): number => Number(big(wad) / pow10(14)) / 1e4;

/** Basis points as a percentage: 8050 → "80.50%". */
export const bpsPct = (bps: number): string => `${(bps / 100).toFixed(2)}%`;

/** after − before of one leg: its sign and exact magnitude in the reserve's units. */
export function legChange(
  leg: AaveV3PositionStateLeg,
  decimals: number,
): { raw: bigint; sign: -1 | 0 | 1; magnitude: string } {
  const raw = big(leg.after) - big(leg.before);
  const sign = raw > ZERO ? 1 : raw < ZERO ? -1 : 0;
  const abs = raw < ZERO ? -raw : raw;
  return { raw: abs, sign, magnitude: humanOf(abs.toString(), decimals) };
}

/** The reserve a card names, by its address, else by its symbol where exactly
 *  one reserve carries it. */
export function findReserve(
  state: AaveV3PositionState,
  address: string | undefined,
  symbol: string | undefined,
): AaveV3PositionStateReserve | undefined {
  if (address) {
    const hit = state.reserves.find((r) => r.reserve.toLowerCase() === address.toLowerCase());
    if (hit) return hit;
  }
  if (!symbol) return undefined;
  const named = state.reserves.filter((r) => r.symbol === symbol);
  return named.length === 1 ? named[0] : undefined;
}

/** How the card names an eMode category: "None" for 0, the category's own label
 *  where the at-block read carries one, else its id. */
export function emodeName(state: AaveV3PositionState, id: number): string {
  if (id === 0) return "None";
  const label = state.emode?.categories[String(id)]?.label;
  return label ? label : `Category ${id}`;
}
