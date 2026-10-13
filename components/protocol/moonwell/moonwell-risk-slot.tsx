"use client";

// The Moonwell position card's risk figures from the page's live Comptroller
// read (rails-ops TO-DO-position-card 322), as slots of the shared card:
//
//   • the Health factor headline (CF-weighted capacity ÷ debt value; 1.0 is the
//     shortfall line, proven exact against getAccountLiquidity by
//     scripts/verify-moonwell-chain.mjs). Moonwell has ONE collateral factor
//     per market, so the borrow limit and the liquidation line coincide;
//   • the panel's rows: the drop the collateral basket can take (1 − 1/HF), the
//     debt against the liquidation line, and the Comptroller's "room to
//     borrow" figure.
//
// The verdict in words is the Explanation's.

import { Prov } from "@/components/shared/provenance";
import type { PositionCardHead, PositionPanelRow } from "@/components/shared/position-card";
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
    <Prov info={moonwellCapacityProv("Health factor", "CF-weighted capacity ÷ debt value", lane)}>
      {hf >= 100 ? "∞" : hf.toFixed(2)}
    </Prov>
  );
}

function ShareValue({ chain }: { chain: MoonwellChainResponse }) {
  const lane = useLane();
  const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
  return (
    <Prov info={moonwellCapacityProv("Debt share of the capacity line", "debt value ÷ CF-weighted capacity", lane)}>
      {share.text}
    </Prov>
  );
}

function RoomValue({ chain }: { chain: MoonwellChainResponse }) {
  const lane = useLane();
  return <Prov info={comptrollerVerdictProv("Account liquidity", lane)}>{formatUsd(chain.liquidityUsd)}</Prov>;
}

/** Whether the read states a health factor: debt and capacity both stand. */
const hasHealth = (chain: MoonwellChainResponse) =>
  chain.healthFactor != null && chain.healthFactor > 0 && chain.debtValueUsd > 0 && chain.collateralCapacityUsd > 0;

/** The Health factor headline for an account with debt; null without debt.
 *  Pending while the read is out, a dash when the read states none. */
export function moonwellHealthHead(chain: MoonwellChainResponse | null, hasDebt: boolean): PositionCardHead | null {
  if (!hasDebt) return null;
  const base = { id: "health-factor", label: "Health factor", labelTip: HF_TIP };
  if (!chain) return { ...base, value: null, pending: true };
  if (!hasHealth(chain)) return { ...base, value: null };
  return { ...base, value: <HealthValue hf={chain.healthFactor as number} /> };
}

/** The panel rows the read adds on the debt side: room to borrow, the drop to
 *  liquidation and the debt against the liquidation line. */
export function moonwellRiskRows(chain: MoonwellChainResponse | null): PositionPanelRow[] {
  if (!chain) return [];
  const rows: PositionPanelRow[] = [];
  if (chain.debtValueUsd > 0 && chain.collateralCapacityUsd > 0) {
    rows.push({
      id: "room-to-borrow",
      label: "Room to borrow",
      tip: "How much more the Comptroller lets this account borrow before its collateral capacity is used up: the account liquidity it reports, read now.",
      value: <RoomValue chain={chain} />,
    });
  }
  if (!hasHealth(chain)) return rows;
  const hf = chain.healthFactor as number;
  if (hf > 1) {
    rows.push({
      id: "liquidation-drop",
      label: "Liquidates on a drop of",
      tip: "How far the value of the collateral basket can fall, all together, before the account reaches the liquidation line: 1 − 1 ÷ the health factor.",
      value: `${Math.round((1 - 1 / hf) * 100)}%`,
    });
  }
  rows.push({
    id: "liquidation-line",
    label: "Debt against the liquidation line",
    tip: "The debt value as a share of the capacity line, the collateral counted up to each market's collateral factor. At 100% the account can be liquidated.",
    value: <ShareValue chain={chain} />,
  });
  return rows;
}
