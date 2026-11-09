// A vault card's stat amount (anatomy V2) through statText: "0" at zero, "<0.000001" below the
// floor with the exact decimal in its tip, the print rule's figure otherwise. `data-figure-value`
// marks the figure a verifier reads, apart from the tip's text.

import { ExactTip } from "@/components/shared/amount-text";
import { formatUnitsExact, isFloorText } from "@/lib/utils/format";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { assetText, shareText, statText } from "@/lib/shared/vault-amount-text";

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
  const shown = <span data-figure-value="">{text}</span>;
  if (!isFloorText(text)) return shown;
  return <ExactTip text={shown} exact={formatUnitsExact(amount.raw, decimals)} symbol={symbol} always />;
}
