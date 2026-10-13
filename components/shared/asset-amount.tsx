"use client";

// AssetAmount — a position card's headline value: the number renders compact
// (170.18M) and the ticker collapses into its glyph. A click on the glyph opens
// the asset's popover (asset-popover.tsx), whose first line is the exact value
// and full ticker; a click on the number is the provenance inspector's. Lives
// inside <StatValue> (which owns the big type), so this only composes the
// compact number, the token glyph and its popover.

import { TokenChipIcon } from "./token-chip-icon";
import { AssetPopover } from "./asset-popover";
import { formatCompact, formatExact, withRealMinus } from "@/lib/utils/format";

export interface AssetAmountProps {
  value: number;
  symbol: string;
  /** Exact value for the popover; defaults to the full grouped number. */
  exact?: string;
  iconSize?: number;
  /** Render a negative value's minus as the real U+2212 rather than the
   *  ASCII hyphen Intl emits — for a figure that can go negative (an equity
   *  at a feed), never a balance. */
  signed?: boolean;
  /** The token's own address, where the caller has it.
   *
   *  Without it the chip resolves the mark by SYMBOL, through the hand-kept
   *  table in lib/shared/token-addresses.ts — which is fine for a curated
   *  roster, where a symbol names exactly one asset. It is not fine for a
   *  permissionless market: on Morpho Blue anyone can list any ERC-20, the
   *  table does not know most of them, and a symbol there identifies nothing
   *  in particular. An asset the table has never heard of gets no address at
   *  all, so neither icon CDN is even asked and the chip falls straight to its
   *  initial-letter glyph.
   *
   *  Pass it wherever the data carries it. The address is what the CDNs key on. */
  address?: string;
  /** Name the ticker after the number ("83.173 sUSDS"), for a headline whose
   *  glyph alone reads as a dollar figure. */
  unit?: boolean;
  /** The figure as shown, where the family states amounts at its own
   *  precision. Default: formatCompact of `value`. */
  display?: string;
  /** The unit `exact` is stated in, where it is not `symbol` — a cToken
   *  balance behind an underlying headline. Default: `symbol`. */
  exactUnit?: string;
}

export function AssetAmount({
  value,
  symbol,
  exact,
  iconSize = 28,
  address,
  signed = false,
  unit = false,
  display,
  exactUnit,
}: AssetAmountProps) {
  // Full pipeline precision (String(n) round-trip, no 3-dp re-rounding) — the
  // strict-truth figure behind the compact headline, for both the popover and
  // the provenance trace.
  const full = signed ? withRealMinus(exact ?? formatExact(value)) : (exact ?? formatExact(value));
  const shown = display ?? formatCompact(value);
  const compact = signed ? withRealMinus(shown) : shown;
  const exactLine = `${full} ${exactUnit ?? symbol}`;
  return (
    <span className="relative inline-flex items-center gap-2">
      {/* data-prov-exact: the provenance inspector reads the exact figure from
          here when this cell is clicked, so its receipt can headline the compact
          form and anchor the trace to the full one (number only — the ticker
          rides data-prov-symbol). data-prov-hidden marks the glyph as decoration
          so its fallback letter never leaks into the text capture ("3.27K" +
          "A" read as one garbled string before). The sr-only line names the
          exact value to a screen reader. */}
      <span data-prov-exact={full} data-prov-symbol={exactUnit ?? symbol} aria-hidden="true">
        {compact}
      </span>
      <span className="sr-only" data-prov-hidden="">
        {exactLine}
      </span>
      {unit && (
        <span data-prov-hidden="" aria-hidden="true" className="text-[0.55em] font-medium text-rb-500">
          {symbol}
        </span>
      )}
      <span data-prov-hidden="" className="inline-flex items-center justify-center rounded-full bg-raised p-0.5">
        <AssetPopover symbol={symbol} address={address} figure={exactLine}>
          <TokenChipIcon symbol={symbol} address={address} size={iconSize} filterable={false} untitled />
        </AssetPopover>
      </span>
    </span>
  );
}
