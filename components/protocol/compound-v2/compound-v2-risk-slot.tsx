"use client";

// The Compound V2 position card's risk headline and its panel rows, from the
// page's live Comptroller read:
//
//   • the headline: the debt's share of the liquidation line (debt value ÷ the
//     CF-weighted capacity, a replica of the Comptroller's walk). Compound V2
//     has ONE collateral factor per market, so the borrowing limit and the
//     liquidation line coincide;
//   • the panel: where the line sits in debt, the room the Comptroller's own
//     liquidity figure leaves to borrow, and the drop the collateral basket can
//     take (1 − 1/health, from the replica).
//
// The verdict in words is the Explanation's.

import { Prov } from "@/components/shared/provenance";
import type { PositionCardHead, PositionPanelRow } from "@/components/shared/position-card";
import { capacityShare } from "@/lib/shared/capacity-share";
import { formatUsd } from "@/lib/shared/format-event";
import { compoundV2CapacityProv, comptrollerVerdictProv } from "@/lib/compound-v2/position-provenance";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";

const LINE_TIP =
  "The debt as a share of the liquidation line: each market's collateral factor sets both the borrowing limit and that line. At 100% the account can be liquidated.";

/** The risk headline for an account with debt; null without debt (a
 *  supply-only account has no line to stand against). Pending while the
 *  Comptroller read is out. */
export function compoundV2RiskHead(chain: CompoundV2ChainResponse | null, hasDebt: boolean): PositionCardHead | null {
  if (!hasDebt) return null;
  const head = { id: "liquidation-line-used", label: "Liquidation line used", labelTip: LINE_TIP };
  if (!chain) return { ...head, value: null, pending: true };
  // Debt with nothing counting toward the line: no share to state.
  if (chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0) return { ...head, value: null };
  const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
  return {
    ...head,
    value: (
      <Prov
        info={compoundV2CapacityProv("Debt share of the capacity line", "debt value ÷ CF-weighted capacity (replica)")}
      >
        {share.text}
      </Prov>
    ),
  };
}

/** The panel rows the Comptroller read adds: the liquidation line on the
 *  collateral side; the room to borrow and the drop to liquidation on the debt
 *  side. Both empty before the read lands, and for an account with nothing
 *  counting toward the line. */
export function compoundV2LineRows(chain: CompoundV2ChainResponse | null): {
  collateral: PositionPanelRow[];
  debt: PositionPanelRow[];
} {
  const none = { collateral: [], debt: [] };
  if (!chain || chain.debtValueUsd <= 0 || chain.collateralCapacityUsd <= 0) return none;
  const hf = chain.healthReplica;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  return {
    collateral: [
      {
        id: "liquidation-line",
        label: "Liquidation line",
        value: (
          <Prov
            info={compoundV2CapacityProv("Liquidation line", "Σ entered supply × price × collateral factor (replica)")}
          >
            {formatUsd(chain.collateralCapacityUsd)}
          </Prov>
        ),
        tip: "The debt, in dollars, at which the account can be liquidated: each entered market's supply times its price times its collateral factor, added up from the Comptroller's reads.",
      },
    ],
    debt: [
      {
        id: "room-to-borrow",
        label: "Room to borrow",
        value: <Prov info={comptrollerVerdictProv("Account liquidity")}>{formatUsd(chain.liquidityUsd)}</Prov>,
        tip: "How many more dollars the account can borrow before the liquidation line: the Comptroller's account liquidity, read at the latest block.",
      },
      ...(dropPct != null
        ? [
            {
              id: "liquidation-drop",
              label: "Liquidates on a drop of",
              value: `${dropPct}%`,
              tip: "How far the collateral can fall in value, with the debt held, before the account reaches the liquidation line. Client arithmetic over the Comptroller's reads (a replica of its walk).",
            },
          ]
        : []),
    ],
  };
}
