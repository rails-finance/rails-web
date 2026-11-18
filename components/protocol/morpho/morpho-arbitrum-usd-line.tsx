"use client";

// The Morpho Blue Arbitrum pages' dollar line under the top row: the wallet's
// supplied, collateral and debt in dollars (or one market's, on the position
// page), each loan token at the Aave V3 Arbitrum oracle's price at the slot
// read's block, each figure the sum of the products its receipt shows
// (lib/morpho-arbitrum/usd.ts). A total only where every held market is
// priced; otherwise each priced market's dollars, and the markets no price
// reaches named. Nothing shows until the slot read has answered, or when the
// wallet holds nothing.

import type { ReactNode } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import {
  morphoArbitrumPair,
  morphoArbitrumSideReceipt,
  morphoArbitrumUsd,
  type MorphoArbitrumSide,
} from "@/lib/morpho-arbitrum/usd";

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SIDES: { side: MorphoArbitrumSide; label: string }[] = [
  { side: "supply", label: "Supplied" },
  { side: "collateral", label: "Collateral" },
  { side: "debt", label: "Debt" },
];
type Positions = MorphoWalletChainResponse["positions"];

/** The sides held across `positions`, each its dollars with its receipt. */
function sideFigures(data: MorphoWalletChainResponse, positions: Positions): ReactNode[] {
  return SIDES.flatMap(({ side, label }) => {
    const r = morphoArbitrumSideReceipt(data, positions, side);
    if (!r || !(r.usd > 0)) return [];
    return [
      <span key={side}>
        {label}{" "}
        <span className="text-foreground tabular-nums">
          <Prov info={r.prov}>{usd(r.usd)}</Prov>
        </span>
      </span>,
    ];
  });
}

const joined = (parts: ReactNode[], sep: string) =>
  parts.map((p, i) => (
    <span key={i}>
      {i > 0 && sep}
      {p}
    </span>
  ));

const list = (xs: string[]) =>
  xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function MorphoArbitrumUsdLine({ data, market }: { data: MorphoWalletChainResponse | null; market?: string }) {
  const registry = useReceiptRegistry();
  if (!data || data.chainStale) return null;
  const positions = market ? data.positions.filter((p) => p.marketId.toLowerCase() === market) : data.positions;
  if (positions.length === 0) return null;
  const { unpriced, unpricedPairs } = morphoArbitrumUsd({ positions, loanUsd: data.loanUsd });
  const block = data.blockNumber;
  const live = positions.filter((p) => !p.chainStale);
  const pricedMarkets = live.filter((p) => !unpricedPairs.includes(morphoArbitrumPair(p)));
  const body: ReactNode[] =
    unpriced === 0
      ? sideFigures(data, live)
      : pricedMarkets.flatMap((p) => {
          const parts = sideFigures(data, [p]);
          return parts.length === 0
            ? []
            : [
                <span key={p.marketId}>
                  {morphoArbitrumPair(p)}: {joined(parts, ", ")}
                </span>,
              ];
        });
  if (body.length === 0 && unpriced === 0) return null;
  const gap =
    unpriced > 0
      ? `no dollar figure for ${list(unpricedPairs)}: the Aave V3 Arbitrum oracle does not price the loan asset, or the market's oracle gives the collateral no price`
      : "";
  if (body.length === 0)
    return (
      <p className="text-[12px] text-rb-500" data-anatomy="H13.1" data-morpho-arbitrum-usd="unpriced">
        {gap.charAt(0).toUpperCase() + gap.slice(1)}.
      </p>
    );
  return (
    <ProvReceiptsScope registry={registry}>
      <p className="text-[12px] text-rb-500" data-anatomy="H13.1" data-morpho-arbitrum-usd={block}>
        {joined(body, unpriced === 0 ? " · " : "; ")} at block {block.toLocaleString("en-US")}, in dollars at the Aave
        V3 Arbitrum oracle&rsquo;s price{gap && `; ${gap}`}.
      </p>
    </ProvReceiptsScope>
  );
}
