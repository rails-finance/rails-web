"use client";

// The Morpho Blue Arbitrum pages' dollar line under the top row: the wallet's
// supplied, collateral and debt in dollars (or one market's, on the position
// page), each loan token converted at the Aave V3 Arbitrum oracle's price at
// the slot read's block (lib/morpho-arbitrum/usd.ts). Nothing shows until the
// slot read has answered, or when the wallet holds nothing.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import type { Provenance } from "@/components/shared/provenance";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { morphoArbitrumUsd } from "@/lib/morpho-arbitrum/usd";
import { AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const receipt = (what: string, block: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block },
  verify: {
    kind: "recompute",
    text: `Re-run Morpho.position, Morpho.market and the market oracle's price() at block ${block}, then AaveOracle.getAssetPrice(loan token) at the same block`,
  },
  summary: `${what} in dollars — each held market's figure in its loan token, read from the singleton at block ${block}, times the loan token's price on the Aave V3 Arbitrum oracle at that block, summed over the markets that oracle prices. Morpho Blue states no dollar price.`,
  contract: { name: "Aave V3 IAaveOracle (Arbitrum)", address: AAVE_V3_ARBITRUM_ORACLE },
  via: "GET /api/chain/morpho-arbitrum/wallet · figure × AaveOracle.getAssetPrice(loan token) ÷ 1e8",
  formula: "Σ market figure × loan token price",
});

export function MorphoArbitrumUsdLine({ data, market }: { data: MorphoWalletChainResponse | null; market?: string }) {
  const registry = useReceiptRegistry();
  if (!data || data.chainStale) return null;
  const positions = market ? data.positions.filter((p) => p.marketId.toLowerCase() === market) : data.positions;
  if (positions.length === 0) return null;
  const { totals, unpriced } = morphoArbitrumUsd({ positions, loanUsd: data.loanUsd });
  const block = data.blockNumber;
  if (totals.supplyUsd == null)
    return (
      <p className="text-[12px] text-rb-500" data-anatomy="H13.1" data-morpho-arbitrum-usd="unpriced">
        No dollar figure: the Aave V3 Arbitrum oracle does not price{" "}
        {market ? "this market's loan token" : "the loan tokens these markets lend"}.
      </p>
    );
  const parts: { label: string; value: number; what: string }[] = [
    { label: "Supplied", value: totals.supplyUsd, what: "Supplied" },
    { label: "Collateral", value: totals.collateralUsd ?? 0, what: "Collateral" },
    { label: "Debt", value: totals.debtUsd ?? 0, what: "Debt" },
  ].filter((p) => p.value > 0);
  if (parts.length === 0) return null;
  return (
    <ProvReceiptsScope registry={registry}>
      <p className="text-[12px] text-rb-500" data-anatomy="H13.1" data-morpho-arbitrum-usd={block}>
        {parts.map((p, i) => (
          <span key={p.label}>
            {i > 0 && " · "}
            {p.label}{" "}
            <span className="text-foreground tabular-nums">
              <Prov info={receipt(p.what, block)}>{usd(p.value)}</Prov>
            </span>
          </span>
        ))}{" "}
        at block {block.toLocaleString("en-US")}, in dollars at the Aave V3 Arbitrum oracle&rsquo;s price
        {unpriced > 0 &&
          `; ${unpriced === 1 ? "one market" : `${unpriced} markets`} in a loan token that oracle does not price ${unpriced === 1 ? "is" : "are"} left out`}
        .
      </p>
    </ProvReceiptsScope>
  );
}
