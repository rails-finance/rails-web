// Home hero live example — shared constants + types.
// ----------------------------------------------------------------------------
// The hero renders the REAL trove-page components (position card, lifetime
// flows, the first timeline cards) fed by a server-side fetch of the showcased
// trove — see live-example-data.ts (SERVER-ONLY loader; this module is the
// isomorphic half, safe to import from client components).
//
// The showcased trove: a long-lived WETH trove with a deep history (134
// redemption touches), which is exactly the story — Rails renders the whole
// life, not a balance.

import type { TroveSummary } from "@/types/api/trove";
import type { TroveStateData } from "@/types/api/troveState";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

export const LIVE_EXAMPLE_COLLATERAL = "WETH";
export const LIVE_EXAMPLE_TROVE_ID = "102247037494986730506041632222868001124387697185626929998095238518734059870154";
export const LIVE_EXAMPLE_TROVE_PATH = `/ethereum/liquity-v2/trove/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`;

/** Ops set aside in the hero's timeline — passive third-party touches that
 *  bury the owner's actions (they stay one click away on the full page). */
export const LIVE_EXAMPLE_HIDDEN_OPS = ["redeemCollateral", "setBatchManagerAnnualInterestRate"];

/** Projection of a timeline event carrying ONLY the fields the lifetime-flows
 *  tower (`TroveEconomicsSummary`), the bars provider
 *  (`LiquityTroveBarsProvider`), and the interest-between-events calculation
 *  read — the full event is ~3.7KB (stateBefore, blockGrouping, flows, …) and
 *  the hero ships all ~150 of them in the page payload, so the projection is
 *  what keeps the home page light. If a component consumed by the hero grows a
 *  new field access on non-visible events, add the field here. */
export interface HeroTowerEvent {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  gas?: { gasCostEth: number; gasCostUsd: number };
  context: {
    protocol: "liquity-v2-troves";
    data: {
      operation: string;
      troveId: string;
      collateralType: string;
      collateralPrice: number;
      assetType: string;
      isInBatch: boolean;
      isZombieTrove: boolean;
      stateAfter: { coll: number; debt: number; annualInterestRate: number };
      troveOperation?: {
        collChangeFromOperation: number;
        debtChangeFromOperation: number;
        debtIncreaseFromUpfrontFee?: number;
        collIncreaseFromRedist?: number;
        debtIncreaseFromRedist?: number;
      };
      redemption?: { redemptionFee: string };
      liquidation?: { collSurplus: number };
      batchUpdate?: { annualManagementFee: number; interestBatchManager?: string };
    };
  };
}

export interface LiveExampleData {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  debtInFront: number | null;
  trovesAhead: number | null;
  /** Newest-first (the trove page's default sort) FULL events with the hero's
   *  hidden ops set aside — the cards actually rendered in the visible zone. */
  visibleEvents: BaseActivityEvent[];
  /** Chronological (oldest-first) projection of ALL events — feeds the
   *  lifetime-flows tower, the bars provider, and previous-event lookups. */
  towerEvents: HeroTowerEvent[];
  /** Count of non-hidden events across the whole timeline (the "8 of 149"
   *  numerator on the real page's counter). */
  visibleTotal: number;
  totalEvents: number;
}
