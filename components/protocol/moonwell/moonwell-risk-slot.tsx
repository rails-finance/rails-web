"use client";

// The Moonwell position card's risk headline and its opened layer (ui-jobs
// 209), from the page's live Comptroller read:
//
//   • the headline: the health factor (CF-weighted capacity ÷ debt value; 1.0
//     is the shortfall line, proven exact against getAccountLiquidity by
//     scripts/verify-moonwell-chain.mjs). Moonwell has ONE collateral factor
//     per market, so the borrow limit and the liquidation line coincide;
//   • under it, opened: the drop the collateral basket can take (1 − 1/HF),
//     the debt's share of the liquidation line and the distance bar;
//   • under Debt, opened: the Comptroller's own "more to borrow" figure.
//
// The verdict in words is the Explanation's.

import { Prov } from "@/components/shared/provenance";
import { StatDash, StatValue } from "@/components/shared/stat-value";
import { PriceRunway } from "@/components/shared/price-runway";
import type { CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatUsd } from "@/lib/shared/format-event";
import { moonwellCapacityProv, comptrollerVerdictProv, type MoonwellLane } from "@/lib/moonwell/position-provenance";
import { useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";

const HF_TIP =
  "Collateral capacity (each entered market counted up to its collateral factor) over the debt. At 1.0 the account can be liquidated.";

/** Which Comptroller, through which route, every receipt here names. */
function useLane(): MoonwellLane {
  const dep = useMoonwellDeployment();
  return { comptroller: dep.comptroller, positionRoute: dep.positionRoute };
}

function HealthValue({ hf }: { hf: number }) {
  const lane = useLane();
  return (
    <StatValue>
      <Prov info={moonwellCapacityProv("Health factor", "CF-weighted capacity ÷ debt value", lane)}>
        {hf >= 100 ? "∞" : hf.toFixed(2)}
      </Prov>
    </StatValue>
  );
}

function RiskDetail({ chain, hf }: { chain: MoonwellChainResponse; hf: number }) {
  const lane = useLane();
  const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
  const dropPct = hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  return (
    <>
      {dropPct != null && <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {dropPct}% drop</div>}
      <div className="text-xs mt-0.5 text-rb-500">
        <Prov info={moonwellCapacityProv("Debt share of the capacity line", "debt value ÷ CF-weighted capacity", lane)}>
          {share.text}
        </Prov>{" "}
        {share.ofThe} <Prov info={comptrollerVerdictProv("Liquidation line", lane)}>liquidation line</Prov>
      </div>
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
    </>
  );
}

/** Where the headline will be once the Comptroller read lands. */
function Pending() {
  return (
    <StatValue>
      <span
        aria-label="Reading the Comptroller"
        className="inline-block h-[1em] w-16 animate-pulse rounded bg-rb-200 align-middle dark:bg-rb-700"
      />
    </StatValue>
  );
}

/** The risk column for an account with debt; null without debt. Pending while
 *  the read is out. */
export function moonwellRiskColumn(chain: MoonwellChainResponse | null, hasDebt: boolean): CardRiskColumn | null {
  if (!hasDebt) return null;
  const base = { label: "Health factor", labelTip: HF_TIP };
  if (!chain) return { ...base, value: <Pending /> };
  const hf = chain.healthFactor;
  if (hf == null || hf <= 0 || chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0)
    return { ...base, value: <StatDash /> };
  return { ...base, value: <HealthValue hf={hf} />, detail: <RiskDetail chain={chain} hf={hf} /> };
}

/** The opened line under Debt: the Comptroller's own liquidity figure. */
export function MoonwellBorrowRoom({ chain }: { chain: MoonwellChainResponse }) {
  const lane = useLane();
  if (chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={comptrollerVerdictProv("Account liquidity", lane)}>{formatUsd(chain.liquidityUsd)}</Prov> more to
      borrow
    </div>
  );
}
