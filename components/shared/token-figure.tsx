"use client";

// A stat's token figure: the figure, then its asset's icon (which opens the
// asset panel, as a headline's icon does), in place of the ticker.

import type { ReactNode } from "react";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";

export function TokenFigure({
  children,
  symbol,
  address,
  figure,
}: {
  children: ReactNode;
  symbol: string;
  address?: string;
  /** The exact amount with its ticker, the asset panel's first line. */
  figure?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <AssetPopover symbol={symbol} address={address} figure={figure}>
        <TokenChipIcon symbol={symbol} address={address} size={16} filterable={false} untitled />
      </AssetPopover>
    </span>
  );
}
