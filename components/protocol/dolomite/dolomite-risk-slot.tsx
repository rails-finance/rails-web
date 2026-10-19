"use client";

// The Dolomite position card's margin ratio and the panel rows that go with it,
// from the page's live core read. The ratio is the core's adjusted supply ÷
// adjusted borrow; the line is the core's requirement for this account (the
// risk override where one is set). The adjusted debt, its share of the borrow
// capacity and the capacity are stated in the card's Explanation.

import { Prov } from "@/components/shared/provenance";
import type { PositionPanelRow } from "@/components/shared/position-card";
import {
  dolomiteRequirementProv,
  dolomiteCollateralizationProv,
  dolomiteDropProv,
} from "@/lib/dolomite/live-provenance";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";

const pct2 = (f: number) => `${(f * 100).toFixed(2)}%`;

/** Whether the read carries a ratio to state: live debt and a live line. */
export function dolomiteHasRisk(chain: DolomiteChainResponse): boolean {
  return (
    !chain.chainStale &&
    chain.collateralization != null &&
    chain.adjBorrowValueUsd > 0 &&
    chain.requiredCollateralization > 0
  );
}

/** The headline figure: the account's margin ratio. */
export function DolomiteMarginRatio({ chain }: { chain: DolomiteChainResponse }) {
  if (chain.collateralization == null) return null;
  return <Prov info={dolomiteCollateralizationProv()}>{pct2(chain.collateralization)}</Prov>;
}

/** The panel's liquidation rows: the fall that reaches the account's line, and
 *  the line. */
export function dolomiteRiskRows(chain: DolomiteChainResponse): PositionPanelRow[] {
  const c = chain.collateralization;
  const req = chain.requiredCollateralization;
  if (c == null || req <= 0) return [];
  const dropPct = c > req ? Math.round((1 - req / c) * 100) : null;
  return [
    ...(dropPct != null && dropPct > 0
      ? [
          {
            id: "liquidates-on-drop",
            label: "Liquidates on a drop of",
            value: <Prov info={dolomiteDropProv()}>{dropPct}%</Prov>,
            tip: "How far the collateral's value can fall, with the debt unchanged, before the margin ratio reaches the account's line. It is 1 minus the line divided by the margin ratio.",
          },
        ]
      : []),
    {
      id: "liquidation-line",
      label: "Liquidation line",
      value: (
        <Prov info={dolomiteRequirementProv()}>
          {pct2(req)}
          {chain.override.active ? " (account override)" : ""}
        </Prov>
      ),
      tip: "The margin ratio this account must keep, read from the Dolomite core for this account: the account's override where one is set, the global ratio otherwise. Below it the account can be liquidated.",
    },
  ];
}
