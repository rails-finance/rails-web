"use client";

// Shared price chip — a token icon + USD price, optionally prefixed with the
// asset symbol. Extracted from the near-identical PricePill copies that lived
// inside aave-v4-price-runway.tsx and trove-price-axis.tsx so both runways and
// the bottom price strip render prices the same way.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";

/** Compact USD formatter shared across the price-display surfaces. */
export function fmtPrice(v: number): string {
  if (!isFinite(v) || v <= 0) return "–";
  if (v < 1) return `$${v.toFixed(4)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  if (v < 10_000) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (v < 1_000_000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${(v / 1_000_000).toFixed(2)}M`;
}

/** Same tiering as `fmtPrice`, for a rate quoted in another asset rather than
 *  USD — no `$`, a trailing unit instead (e.g. "2.08 ETH"). Kept a separate
 *  function rather than a flag on `fmtPrice` so every call site names, at the
 *  call, whether the number is money. */
export function fmtNative(v: number, unit: string): string {
  if (!isFinite(v) || v <= 0) return "–";
  if (v < 1) return `${v.toFixed(4)} ${unit}`;
  if (v < 100) return `${v.toFixed(2)} ${unit}`;
  if (v < 10_000) return `${Math.round(v).toLocaleString("en-US")} ${unit}`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K ${unit}`;
  return `${(v / 1_000_000).toFixed(2)}M ${unit}`;
}

export interface PricePillProps {
  symbol: string;
  address?: string;
  price: number;
  /** Quote `price` in this asset instead of USD (e.g. "ETH") — drops the `$`
   *  and appends the unit instead. Absent means USD, as before. */
  unit?: string;
  /** Render the asset symbol before the price (used by the price strip). */
  showSymbol?: boolean;
  /** Forwarded to the token icon. Defaults to true to preserve the runway
   *  behaviour where icons act as token filters inside a TokenFilterProvider. */
  filterable?: boolean;
  /** Native tooltip — used when the symbol isn't shown inline (price strip) so
   *  hovering still reveals which asset the price is for. */
  title?: string;
  /** Drop the chip background so the price sits directly on its container
   *  surface (used by the price strip, which supplies its own dark backing). */
  bare?: boolean;
}

export function PricePill({
  symbol,
  address,
  price,
  unit,
  showSymbol = false,
  filterable = true,
  title,
  bare = false,
}: PricePillProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs tabular-nums cursor-default${bare ? "" : " bg-sunken"}`}
    >
      <TokenChipIcon symbol={symbol} address={address} size={14} filterable={filterable} />
      {showSymbol && <span className="font-medium text-rb-500">{symbol}</span>}
      <span className="font-bold text-green-400">{unit ? fmtNative(price, unit) : fmtPrice(price)}</span>
    </span>
  );
}
