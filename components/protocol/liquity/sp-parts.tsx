"use client";

// The small parts the Liquity V2 (and fork) deposit card and its rows share: a compact
// figure with its exact amount in the tip, and a token icon that opens the
// asset's panel. Polaris's deposit keeps the same pair
// (components/protocol/polaris/polaris-sp-loan-parts.tsx).

import type { ReactNode } from "react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact } from "@/lib/shared/format-compact";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { exactUnits, units } from "@/lib/liquity-v2/sp-math";

/** A raw 1e18 amount, compact on the face and exact in the tip. */
export function RawFigure({ raw, symbol, approx = false }: { raw: bigint; symbol: string; approx?: boolean }) {
  const exact = exactUnits(raw);
  return (
    <RevealTip tip={`${exact} ${symbol}`} label={`${exact} ${symbol}`}>
      <span data-prov-exact={exact} data-prov-symbol={symbol}>
        {approx ? "≈ " : ""}
        {formatCompact(units(raw))}
      </span>
    </RevealTip>
  );
}

/** `chainId`: the deployment's chain (Basedollar's is Base). */
export function tokenIcon(
  symbol: string,
  address: string,
  raw: bigint,
  size = 28,
  chainId: ChainId = MAINNET_CHAIN_ID,
): ReactNode {
  return (
    <AssetPopover symbol={symbol} address={address} chainId={chainId} figure={`${exactUnits(raw)} ${symbol}`}>
      <TokenChipIcon symbol={symbol} address={address} size={size} filterable={false} untitled />
    </AssetPopover>
  );
}
