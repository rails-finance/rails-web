"use client";

// A stat's token figure: the figure, then its asset's icon (which opens the
// asset panel, as a headline's icon does), in place of the ticker. It carries
// the panel's figure mark, so the words round it in a stat value read muted
// (position-card-panel.tsx).

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
    <span className="inline-flex items-center gap-1.5" data-panel-figure="">
      {children}
      <AssetPopover symbol={symbol} address={address} figure={figure}>
        <TokenChipIcon symbol={symbol} address={address} size={16} filterable={false} untitled />
      </AssetPopover>
    </span>
  );
}
