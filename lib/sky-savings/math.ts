// Sky Savings arithmetic at the render edge. The api states every amount as a
// raw integer at 18 decimals and chi and ssr as rays; this scales them once,
// and does the integer steps (a balance before an event, the earned figure
// before it) in BigInt so they stay wei-exact.

import { formatUnitsExact } from "@/lib/utils/format";
import type { SkySavingsContext } from "@/lib/shared/types/event-shape";

const RAY = BigInt("1000000000000000000000000000");
const SECONDS_PER_YEAR = 31_536_000;

/** A raw 18-decimal integer string as a number. */
export const units = (raw: string | bigint | null | undefined): number => (raw == null ? 0 : Number(raw) / 1e18);

/** A raw 18-decimal integer string as its exact decimal. */
export const exact = (raw: string | bigint): string => formatUnitsExact(String(raw), 18);

/** A ray (chi) as a number: USDS per sUSDS. */
export const rayNumber = (ray: string | null | undefined): number => (ray == null ? 0 : Number(ray) / 1e27);

/** A ray as its exact decimal. */
export const rayExact = (ray: string): string => formatUnitsExact(ray, 27);

/** The per-second Savings Rate as an annual fraction: ssr^31,536,000 − 1, the
 *  convention Sky's contracts and the api use. */
export function annualRate(ssr: string): number {
  const perSecond = Number(BigInt(ssr) - RAY) / 1e27;
  return Math.expm1(SECONDS_PER_YEAR * Math.log1p(perSecond));
}

/** "3.60%": two decimals, the precision governance sets the rate to. */
export const pct = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`;

/** A decimal-string annual rate from the api ("0.036000") as "3.60%". */
export const pctString = (decimal: string): string => pct(Number(decimal));

/** The figures one event moved, reconstructed from the row: the
 *  balance, value and interest earned just before it, against the after
 *  figures the row carries. */
export interface SkyEventTransition {
  sharesBefore: bigint;
  sharesAfter: bigint;
  valueBefore: bigint;
  valueAfter: bigint;
  earnedBefore: bigint;
  earnedAfter: bigint;
  /** Shares moved, signed (+ in). */
  sharesDelta: bigint;
  /** The USDS leg, unsigned. */
  usds: bigint;
}

/** Before-figures are the after-figures less this event's legs, valued at
 *  this event's chi (the same chi the after-value uses, so the step in value is
 *  the event's legs alone and the interest before it is what the position had
 *  earned at this block). */
export function skyTransition(c: SkySavingsContext): SkyEventTransition {
  const sharesAfter = BigInt(c.sharesAfter);
  const sharesDelta = BigInt(c.sharesDelta);
  const sharesBefore = sharesAfter - sharesDelta;
  const chi = BigInt(c.chi);
  const usds = BigInt(c.usds);
  const valueAfter = BigInt(c.valueAfter);
  const valueBefore = (sharesBefore * chi) / RAY;
  const inAfter = BigInt(c.usdsInAfter);
  const outAfter = BigInt(c.usdsOutAfter);
  const isIn = c.eventType === "deposit" || c.eventType === "received";
  const isOut = c.eventType === "withdrawal" || c.eventType === "sent";
  const inBefore = isIn ? inAfter - usds : inAfter;
  const outBefore = isOut ? outAfter - usds : outAfter;
  return {
    sharesBefore,
    sharesAfter,
    valueBefore,
    valueAfter,
    earnedBefore: valueBefore - inBefore + outBefore,
    earnedAfter: BigInt(c.earnedAfter),
    sharesDelta,
    usds,
  };
}

/** USDC per USDS at the PSM exit, as a number: 1 / (1 + tout). The api states
 *  the series; one segment with 1.000000 for the whole life of sUSDS so far. */
export function usdcPerUsdsAt(
  series: { fromBlock: number; usdcPerUsds: string }[] | undefined,
  block: number,
): number | null {
  if (!series || series.length === 0) return null;
  let v: string | null = null;
  for (const s of series) if (s.fromBlock <= block) v = s.usdcPerUsds;
  if (v == null || v === "halted") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
