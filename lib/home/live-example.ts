// Home hero live example — shared constants + types.
// ----------------------------------------------------------------------------
// The hero renders the Trove page's body (components/trove/TroveBody.tsx: the
// position card, Lifetime flows, the timeline's first rows) fed by a
// server-side fetch of the showcased trove — see live-example-data.ts
// (SERVER-ONLY loader; this module is the isomorphic half, safe to import from
// client components).
//
// The showcased trove: a long-lived WETH trove with a deep history (134
// redemption touches), which is the story — Rails renders the whole life, not
// a balance.

import type { TroveSummary } from "@/types/api/trove";
import type { TroveStateData } from "@/types/api/troveState";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { LiquityFlowEvent } from "@/lib/shared/liquity-flows";
import type { DayObs } from "@/lib/shared/price-series";

export const LIVE_EXAMPLE_COLLATERAL = "WETH";
export const LIVE_EXAMPLE_TROVE_ID = "102247037494986730506041632222868001124387697185626929998095238518734059870154";
export const LIVE_EXAMPLE_TROVE_PATH = `/ethereum/liquity-v2/trove/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`;

/** Projection of a timeline event carrying ONLY the fields the Lifetime flows
 *  Explanation (`computeLiquityEconomics`) and the
 *  interest-between-events calculation read — the full event is ~3.7KB (stateBefore, blockGrouping, flows, …) and
 *  the hero ships all ~150 of them in the page payload (as positional rows,
 *  live-example-wire.ts), so the projection is
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
      stateAfter: {
        coll: number;
        debt: number;
        annualInterestRate: number;
        raw?: { debt?: string; annualInterestRate?: string };
      };
      /** A batch manager's rate change only: batchRateDebtMove reads the debt
       *  before it. */
      stateBefore?: { debt: number; annualInterestRate: number; raw?: { debt?: string } };
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
  /** The newest timeline rows as FULL events, oldest first: whole rows, so a
   *  run row counts what the page's counts (live-example-data.ts). */
  rowEvents: BaseActivityEvent[];
  /** Chronological (oldest-first) projection of ALL events — feeds the
   *  Lifetime flows Explanation and previous-event lookups. */
  towerEvents: HeroTowerEvent[];
  /** ALL events as the Lifetime flows replay reads them. */
  flowEvents: LiquityFlowEvent[];
  /** The branch's collateral price per UTC day; null where the read failed
   *  (the replay then keeps each event's price, as the page does). */
  dailyObs: DayObs[] | null;
  totalEvents: number;
}
