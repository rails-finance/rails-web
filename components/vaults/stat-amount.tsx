// A vault card's amounts through one compact rule (ui-jobs 679): from 1,000 a figure reads
// compact through formatCompact ("45.9M"), the full figure in its title, in `data-figure-full`
// (which a verifier reads), in its receipt (`data-prov-exact`) and in a screen-reader line. The
// card's stats (C18, StatAmount), its Total assets headline (C10) and MetaMorpho's figures
// (morpho-base-vault-page.tsx InAssetFigure) all draw it.
//
// StatAmount below the threshold: "0" at zero, "<0.000001" below the floor with the exact
// decimal in its tip, the print rule's figure otherwise. `data-figure-value` marks the figure a
// verifier reads, apart from the tip's text.

import { ExactTip } from "@/components/shared/amount-text";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact, isFloorText } from "@/lib/utils/format";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { assetText, shareText, statText } from "@/lib/shared/vault-amount-text";

/** From here an amount reads compact: formatCompact's own threshold. */
export const COMPACT_FROM = 1_000;

/** The compact figure. `full` is the print rule's text (title, `data-figure-full`, the screen
 *  reader's line); `exact` the receipt's figure. Goes inside the figure's `<Prov>`. */
export function CompactFigure({
  value,
  full,
  exact,
  symbol,
}: {
  value: number;
  full: string;
  exact: string;
  symbol?: string;
}) {
  const said = symbol ? `${full} ${symbol}` : full;
  return (
    <>
      <span
        data-figure-value=""
        data-figure-full={full}
        data-prov-exact={exact}
        {...(symbol ? { "data-prov-symbol": symbol } : {})}
        title={said}
        aria-hidden="true"
      >
        {formatCompact(value)}
      </span>
      <span className="sr-only" data-prov-hidden="">
        {said}
      </span>
    </>
  );
}

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
  if (Math.abs(amount.value) >= COMPACT_FROM)
    return (
      <CompactFigure value={amount.value} full={text} exact={formatUnitsExact(amount.raw, decimals)} symbol={symbol} />
    );
  const shown = <span data-figure-value="">{text}</span>;
  if (!isFloorText(text)) return shown;
  return <ExactTip text={shown} exact={formatUnitsExact(amount.raw, decimals)} symbol={symbol} always />;
}
