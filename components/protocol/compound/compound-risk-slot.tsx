"use client";

// The Compound V3 (Comet) position card's risk headline and its opened layer
// (ui-jobs 209), from the page's live Comet read. Comet has two factors per
// collateral: the borrow factor sets the borrowing limit, the liquidate factor
// the line where an account is absorbed.
//
//   • the headline: the share of the borrowing limit used (debt value ÷ borrow
//     capacity);
//   • under it, opened: where the absorb line sits in base tokens and the
//     share of it reached, the drop the collateral can take (1 − 1/HF, HF =
//     liquidation capacity ÷ debt value) and the distance bar;
//   • under Debt, opened: how much more the account can borrow.
//
// Every figure is in base-token terms, unit-safe in every market (the WETH
// market quotes in ETH, not USD). The verdict in words is the Explanation's.

import { Prov } from "@/components/shared/provenance";
import { StatDash, StatValue } from "@/components/shared/stat-value";
import { PriceRunway } from "@/components/shared/price-runway";
import { AmountText } from "@/components/shared/amount-text";
import type { CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { capacityShare } from "@/lib/shared/capacity-share";
import { capacityProv, contractVerdictProv } from "@/lib/compound/position-provenance";
import type { CompoundCoords } from "@/lib/compound/event-provenance";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";

const LIMIT_TIP =
  "The debt as a share of the borrowing limit, which each collateral's borrow factor sets. The account is absorbed at a higher line, set by the liquidate factors.";

const coordsOf = (chain: CompoundMarketChainResponse): CompoundCoords => ({
  comet: chain.comet,
  marketLabel: `c${chain.baseSymbol}v3`,
});

/** Base tokens from a quote-unit value (base price ≈ 1 in the market's own
 *  quote unit, verified on-chain). */
const toBase = (chain: CompoundMarketChainResponse, v: number) => (chain.basePrice > 0 ? v / chain.basePrice : v);

/** Where the headline will be once the Comet read lands. */
function Pending() {
  return (
    <StatValue>
      <span
        aria-label="Reading the market"
        className="inline-block h-[1em] w-20 animate-pulse rounded bg-rb-200 align-middle dark:bg-rb-700"
      />
    </StatValue>
  );
}

/** The risk column for a borrower; null for a lender or a supply-only
 *  account. Pending while the read is out. */
export function compoundRiskColumn(
  chain: CompoundMarketChainResponse | null,
  borrowing: boolean,
): CardRiskColumn | null {
  if (!borrowing) return null;
  const base = { label: "Borrowing limit used", labelTip: LIMIT_TIP };
  if (!chain) return { ...base, value: <Pending /> };
  if (chain.debtValue <= 0 || chain.borrowCapacity <= 0 || chain.liquidationCapacity <= 0)
    return { ...base, value: <StatDash /> };
  const coords = coordsOf(chain);
  const used = capacityShare(chain.debtValue, chain.borrowCapacity);
  const line = capacityShare(chain.debtValue, chain.liquidationCapacity);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  return {
    ...base,
    value: (
      <StatValue>
        <Prov info={capacityProv("Share of the borrowing limit used", "debt value ÷ borrow capacity", coords)}>
          {used.text}
        </Prov>
      </StatValue>
    ),
    detail: (
      <>
        <div className="text-xs mt-0.5 text-rb-500">
          absorbed at{" "}
          <Prov info={capacityProv("Liquidation line", "Σ collateral × price × liquidate factor ÷ base price", coords)}>
            <AmountText value={toBase(chain, chain.liquidationCapacity)} /> {chain.baseSymbol}
          </Prov>{" "}
          of debt,{" "}
          <Prov info={capacityProv("Debt share of the liquidation line", "debt value ÷ liquidation capacity", coords)}>
            {line.text}
          </Prov>{" "}
          <Prov info={contractVerdictProv("Liquidation line", "isLiquidatable", coords)}>
            {line.beyond ? "past it" : "reached"}
          </Prov>
        </div>
        {dropPct != null && <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {dropPct}% drop</div>}
        {hf != null && hf > 0 && (
          <div className="mt-1.5 max-w-72">
            <PriceRunway
              compact
              barOnly
              currentPrice={hf}
              liqPrice={1}
              liqCaption="liquidation · HF 1.0"
              underwaterCaption="below HF 1.0"
            />
          </div>
        )}
      </>
    ),
  };
}

/** The opened line under Debt: how much more the account can borrow. */
export function CompoundBorrowRoom({ chain }: { chain: CompoundMarketChainResponse }) {
  if (chain.debtValue <= 0 || chain.borrowCapacity <= 0) return null;
  const headroom = Math.max(0, toBase(chain, chain.borrowCapacity - chain.debtValue));
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov
        info={capacityProv(
          "Available to borrow",
          "(Σ collateral × price × borrow factor − debt value) ÷ base price",
          coordsOf(chain),
        )}
      >
        <AmountText value={headroom} /> {chain.baseSymbol}
      </Prov>{" "}
      more to borrow
    </div>
  );
}
