"use client";

// The Morpho position card's risk headline and its opened layer (ui-jobs 209),
// from the page's live read of the market. Morpho keeps ONE line per market:
// the LLTV is the borrow cap and the liquidation line at once.
//
//   • the headline: the loan-to-value (live debt ÷ collateral value at the
//     market's oracle);
//   • under it, opened: the debt's share of the LLTV line, the drop the
//     collateral price can take (1 − 1/HF) and the distance bar;
//   • under Debt, opened: how much more the position can borrow.
//
// The oracle price, when its feeds published it and the verdict in words are
// the Explanation's.

import { Prov } from "@/components/shared/provenance";
import { StatDash, StatValue } from "@/components/shared/stat-value";
import { PriceRunway } from "@/components/shared/price-runway";
import { AmountText } from "@/components/shared/amount-text";
import { pct } from "@/components/shared/ratio-bar";
import type { CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { capacityShare } from "@/lib/shared/capacity-share";
import { capacityProv, lltvProv, type MorphoChainCoords } from "@/lib/morpho/position-provenance";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";

const coordsOf = (chain: MorphoChainPositionResponse): MorphoChainCoords => ({
  marketId: chain.marketId,
  marketLabel: `${chain.loanSymbol} / ${chain.collateralSymbol}`,
});

/** Where the headline will be once the market read lands. */
function Pending() {
  return (
    <StatValue>
      <span
        aria-label="Reading the market"
        className="inline-block h-[1em] w-16 animate-pulse rounded bg-rb-200 align-middle dark:bg-rb-700"
      />
    </StatValue>
  );
}

/** The risk column for a borrower; null without debt. Pending while the read
 *  is out. */
export function morphoRiskColumn(chain: MorphoChainPositionResponse | null, hasDebt: boolean): CardRiskColumn | null {
  if (!hasDebt) return null;
  if (!chain) return { label: "LTV", value: <Pending /> };
  const lltvTip = `Loan-to-value: the debt over the collateral's value at the market's oracle. The market liquidates at its LLTV, ${pct(chain.lltv)}.`;
  const base = { label: "LTV", labelTip: lltvTip };
  if (chain.chainStale || chain.currentDebt <= 0 || chain.maxBorrow <= 0 || chain.ltv == null || chain.ltv <= 0)
    return { ...base, value: <StatDash /> };
  const coords = coordsOf(chain);
  const share = capacityShare(chain.currentDebt, chain.maxBorrow);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  return {
    ...base,
    value: (
      <StatValue>
        <Prov info={capacityProv("Loan-to-value", "live debt ÷ collateral value", coords)}>{pct(chain.ltv)}</Prov>
      </StatValue>
    ),
    detail: (
      <>
        <div className="text-xs mt-0.5 text-rb-500">
          <Prov info={capacityProv("Debt share of the liquidation line", "debt ÷ (collateral value × lltv)", coords)}>
            {share.text}
          </Prov>{" "}
          {share.ofThe} <Prov info={lltvProv(coords)}>LLTV {pct(chain.lltv)}</Prov> line
        </div>
        {dropPct != null && <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {dropPct}% drop</div>}
        {hf != null && hf > 0 && (
          <div className="mt-1.5 max-w-72">
            <PriceRunway
              compact
              barOnly
              currentPrice={hf}
              liqPrice={1}
              asset={chain.collateralSymbol}
              liqCaption="liquidation · HF 1.0"
              underwaterCaption="below HF 1.0"
            />
          </div>
        )}
      </>
    ),
  };
}

/** The opened line under Debt: how much more the position can borrow. */
export function MorphoBorrowRoom({ chain }: { chain: MorphoChainPositionResponse }) {
  if (chain.chainStale || chain.currentDebt <= 0 || chain.maxBorrow <= 0) return null;
  const headroom = Math.max(0, chain.maxBorrow - chain.currentDebt);
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={capacityProv("Available to borrow", "collateral value × lltv − live debt", coordsOf(chain))}>
        <AmountText value={headroom} /> {chain.loanSymbol}
      </Prov>{" "}
      more to borrow
    </div>
  );
}
