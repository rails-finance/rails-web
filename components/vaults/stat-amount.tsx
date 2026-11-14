// A vault card's stat amount (anatomy V2, C18) through statText: "0" at zero, "<0.000001" below the
// floor with the exact decimal in its tip, the compact form from 1,000 ("45.9M", formatCompact,
// ui-jobs 679), the print rule's figure otherwise. A compact figure carries the full one in its
// title, in `data-figure-full` (which a verifier reads), in its receipt (`data-prov-exact`) and in
// a screen-reader line. `data-figure-value` marks the figure a verifier reads, apart from the tip's
// text.

import { ExactTip } from "@/components/shared/amount-text";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact, isFloorText } from "@/lib/utils/format";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { assetText, shareText, statText } from "@/lib/shared/vault-amount-text";

/** From here a stat reads compact: formatCompact's own threshold. */
const COMPACT_FROM = 1_000;

export function StatAmount({
  amount,
  decimals,
  symbol,
  shares = false,
}: {
  amount: RawAmount;
  decimals: number;
  /** Joins the tip ("0.000000000000000002 WETH"). */
  symbol?: string;
  /** A share count (shareText) in place of an asset amount (assetText). */
  shares?: boolean;
}) {
  const text = statText(amount, shares ? shareText(amount, decimals) : assetText(amount, decimals));
  if (Math.abs(amount.value) >= COMPACT_FROM) {
    const full = symbol ? `${text} ${symbol}` : text;
    return (
      <>
        <span
          data-figure-value=""
          data-figure-full={text}
          data-prov-exact={formatUnitsExact(amount.raw, decimals)}
          {...(symbol ? { "data-prov-symbol": symbol } : {})}
          title={full}
          aria-hidden="true"
        >
          {formatCompact(amount.value)}
        </span>
        <span className="sr-only" data-prov-hidden="">
          {full}
        </span>
      </>
    );
  }
  const shown = <span data-figure-value="">{text}</span>;
  if (!isFloorText(text)) return shown;
  return <ExactTip text={shown} exact={formatUnitsExact(amount.raw, decimals)} symbol={symbol} always />;
}
