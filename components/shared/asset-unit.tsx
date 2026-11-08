"use client";

// The unit after a figure in a vault's asset, in the house table's rows (V3,
// V6, M1; rails-ops ui-jobs 538, 539): the asset's mark at 15px, its symbol as
// the image's text and title, or the symbol in words where the token has no
// mark, so no figure reads unitless (decision 0028 point 8).

import { TokenChipIcon } from "@/components/shared/token-chip-icon";

export function AssetUnit({
  symbol,
  address,
  named = true,
}: {
  symbol: string;
  address: string;
  /** False where the symbol did not decode: the words set in mono. */
  named?: boolean;
}) {
  const word = <span className={`text-[10px] font-medium text-rb-500 ${named ? "" : "font-mono"}`}>{symbol}</span>;
  return (
    <span className="inline-flex shrink-0" title={symbol} data-asset-unit={symbol}>
      <TokenChipIcon symbol={symbol} address={address} size={15} filterable={false} untitled fallback={word} />
    </span>
  );
}
