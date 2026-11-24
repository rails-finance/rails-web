"use client";

// The small parts the Liquity V1 deposit card and its rows share, as Liquity
// V2's deposit keeps them (sp-parts.tsx): a compact figure with its exact
// amount in the tip, and a token icon that opens the asset's panel.

import type { ReactNode } from "react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact } from "@/lib/shared/format-compact";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import { exactUnits, units } from "@/lib/liquity-v1/sp-math";

/** The deposit's three tokens. ETH is native ETH, named by the asset roster's sentinel. */
export const V1_SP_TOKENS = {
  LUSD: TOKEN_ADDRESSES.LUSD,
  ETH: NATIVE,
  LQTY: TOKEN_ADDRESSES.LQTY,
} as const;
export type V1SpToken = keyof typeof V1_SP_TOKENS;

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

export function tokenIcon(symbol: V1SpToken, raw: bigint, size = 28): ReactNode {
  const address = V1_SP_TOKENS[symbol];
  return (
    <AssetPopover symbol={symbol} address={address} chainId={MAINNET_CHAIN_ID} figure={`${exactUnits(raw)} ${symbol}`}>
      <TokenChipIcon symbol={symbol} address={address} size={size} filterable={false} untitled />
    </AssetPopover>
  );
}
