"use client";

// The Compound V2 position card's risk headline and its opened layer (ui-jobs
// 209), from the page's live Comptroller read:
//
//   • the headline: the debt's share of the liquidation line (debt value ÷ the
//     CF-weighted capacity, a replica of the Comptroller's walk). Compound V2
//     has ONE collateral factor per market, so the borrowing limit and the
//     liquidation line coincide;
//   • under it, opened: where the line sits in debt, the drop the collateral
//     basket can take (1 − 1/health, the replica's own arithmetic) and the
//     distance bar;
//   • under Debt, opened: the Comptroller's own "more to borrow" figure.
//
// The verdict in words is the Explanation's.

import { Prov } from "@/components/shared/provenance";
import { StatDash, StatValue } from "@/components/shared/stat-value";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatUsd } from "@/lib/shared/format-event";
import { PriceRunway } from "@/components/shared/price-runway";
import type { CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { compoundV2CapacityProv, comptrollerVerdictProv } from "@/lib/compound-v2/position-provenance";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";

const LINE_TIP =
  "The debt as a share of the liquidation line: each market's collateral factor sets both the borrowing limit and that line. At 100% the account can be liquidated.";

/** Where the headline will be once the Comptroller read lands. */
function Pending() {
  return (
    <StatValue>
      <span
        aria-label="Reading the Comptroller"
        className="inline-block h-[1em] w-20 animate-pulse rounded bg-rb-200 align-middle dark:bg-rb-700"
      />
    </StatValue>
  );
}

/** The risk column for an account with debt; null without debt (a supply-only
 *  account has no line to stand against). Pending while the read is out. */
export function compoundV2RiskColumn(chain: CompoundV2ChainResponse | null, hasDebt: boolean): CardRiskColumn | null {
  if (!hasDebt) return null;
  if (!chain) return { label: "Liquidation line used", labelTip: LINE_TIP, value: <Pending /> };
  // Debt with nothing counting toward the line: no share to state.
  if (chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0)
    return { label: "Liquidation line used", labelTip: LINE_TIP, value: <StatDash /> };
  const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
  const hf = chain.healthReplica;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  return {
    label: "Liquidation line used",
    labelTip: LINE_TIP,
    value: (
      <StatValue>
        <Prov
          info={compoundV2CapacityProv(
            "Debt share of the capacity line",
            "debt value ÷ CF-weighted capacity (replica)",
          )}
        >
          {share.text}
        </Prov>
      </StatValue>
    ),
    detail: (
      <>
        <div className="text-xs mt-0.5 text-rb-500">
          line at{" "}
          <Prov
            info={compoundV2CapacityProv("Liquidation line", "Σ entered supply × price × collateral factor (replica)")}
          >
            {formatUsd(chain.collateralCapacityUsd)}
          </Prov>{" "}
          of debt
        </div>
        {dropPct != null && <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {dropPct}% drop</div>}
        {hf != null && hf > 0 && (
          <div className="mt-1.5 max-w-72">
            <PriceRunway
              compact
              barOnly
              currentPrice={hf}
              liqPrice={1}
              liqCaption="liquidation · 1.0 (replica)"
              underwaterCaption="below the line (replica)"
            />
          </div>
        )}
      </>
    ),
  };
}

/** The opened line under Debt: the Comptroller's own liquidity figure. */
export function CompoundV2BorrowRoom({ chain }: { chain: CompoundV2ChainResponse }) {
  if (chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={comptrollerVerdictProv("Account liquidity")}>{formatUsd(chain.liquidityUsd)}</Prov> more to borrow
    </div>
  );
}
