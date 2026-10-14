// Home hero live-example loader — the showcased trove, fetched server-side.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Fetches the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle) — imported only from the
// home page server component. Every fetch carries `next.revalidate`, so the
// home page stays static (ISR): visitors get a recent real render of the trove
// at zero per-request backend cost, refreshed in the background hourly.
//
// Every leg is best-effort EXCEPT the summary + timeline — without those there
// is no position to render and the loader returns null (the hero keeps its
// skeleton for that revalidate window). Failed fetches are not cached, so the
// next regeneration retries.

import type { TrovesResponse } from "@/types/api/trove";
import type { TroveStateResponse } from "@/types/api/troveState";
import type { OraclePricesResponse } from "@/types/api/oracle";
import type { BaseActivityEvent, LiquityContext } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import type { FetchTroveTimelineResult } from "@/lib/api/fetch-timeline";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { liquityBranchObs } from "@/lib/shared/price-series";
import { LIQUITY_RUN_KINDS } from "@/lib/liquity/timeline-run-kinds";
import {
  LIVE_EXAMPLE_COLLATERAL,
  LIVE_EXAMPLE_TROVE_ID,
  type HeroTowerEvent,
  type LiveExampleData,
} from "./live-example";
import { compareEventsInOrder } from "@/lib/shared/event-order";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** Matches the route-segment `revalidate` on app/(site)/page.tsx. */
const REVALIDATE_SECONDS = 3600;

async function getJson<T>(path: string): Promise<T | null> {
  if (!RAILS_API_URL) {
    console.error("live-example: RAILS_API_URL is not set");
    return null;
  }
  try {
    const res = await fetch(
      `${RAILS_API_URL}${path}`,
      createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
    );
    if (!res.ok) {
      console.error(`live-example: ${path} -> ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`live-example: ${path} failed`, err);
    return null;
  }
}

/** Strip an event to the fields the tower/bars/interest math read — see the
 *  HeroTowerEvent doc for why. Typed against the guarded Liquity context so a
 *  renamed source field fails the build here, not silently in the hero. */
function toTowerEvent(e: BaseActivityEvent & { context: { data: LiquityContext } }): HeroTowerEvent {
  const c = e.context.data;
  return {
    id: e.id,
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    timestamp: e.timestamp,
    gas: e.gas ? { gasCostEth: e.gas.gasCostEth, gasCostUsd: e.gas.gasCostUsd } : undefined,
    context: {
      protocol: "liquity-v2-troves",
      data: {
        operation: c.operation,
        troveId: c.troveId,
        collateralType: c.collateralType,
        collateralPrice: c.collateralPrice,
        assetType: c.assetType,
        isInBatch: c.isInBatch,
        isZombieTrove: c.isZombieTrove,
        stateAfter: {
          coll: c.stateAfter.coll,
          debt: c.stateAfter.debt,
          annualInterestRate: c.stateAfter.annualInterestRate,
          raw: { debt: c.stateAfter.raw?.debt, annualInterestRate: c.stateAfter.raw?.annualInterestRate },
        },
        stateBefore:
          c.operation === "setBatchManagerAnnualInterestRate" && c.stateBefore
            ? {
                debt: c.stateBefore.debt,
                annualInterestRate: c.stateBefore.annualInterestRate,
                raw: { debt: c.stateBefore.raw?.debt },
              }
            : undefined,
        troveOperation: c.troveOperation
          ? {
              collChangeFromOperation: c.troveOperation.collChangeFromOperation,
              debtChangeFromOperation: c.troveOperation.debtChangeFromOperation,
              debtIncreaseFromUpfrontFee: c.troveOperation.debtIncreaseFromUpfrontFee,
              collIncreaseFromRedist: c.troveOperation.collIncreaseFromRedist,
              debtIncreaseFromRedist: c.troveOperation.debtIncreaseFromRedist,
            }
          : undefined,
        redemption: c.redemption ? { redemptionFee: c.redemption.redemptionFee } : undefined,
        liquidation: c.liquidation ? { collSurplus: c.liquidation.collSurplus } : undefined,
        batchUpdate: c.batchUpdate
          ? {
              annualManagementFee: c.batchUpdate.annualManagementFee,
              interestBatchManager: c.batchUpdate.interestBatchManager,
            }
          : undefined,
      },
    },
  };
}

/** How many timeline rows ship as full events — the hero's visible zone fades
 *  out after about three. */
const ROW_LIMIT = 5;
/** A run of more events than this is not shipped after the first row: its
 *  members would weigh the home page down for a row under the fade. */
const RUN_EVENT_CAP = 12;

/** The newest events that make up whole timeline rows, newest first: a streak
 *  the Trove page collapses into one run row (LIQUITY_RUN_KINDS) ships whole
 *  or not at all, so the hero's run rows count what the page's count. */
function newestRows(newestFirst: BaseActivityEvent[]): BaseActivityEvent[] {
  const op = (e: BaseActivityEvent) => (isLiquityEvent(e) ? e.context.data.operation : null);
  const out: BaseActivityEvent[] = [];
  let rows = 0;
  let i = 0;
  while (i < newestFirst.length && rows < ROW_LIMIT) {
    const kind = LIQUITY_RUN_KINDS.find((k) => k.operation === op(newestFirst[i]));
    let j = i + 1;
    if (kind) while (j < newestFirst.length && op(newestFirst[j]) === kind.operation) j++;
    // A streak shorter than its kind's minimum draws one card per event.
    const run = kind && j - i >= kind.min;
    if (!run) j = i + 1;
    if (run && rows > 0 && j - i > RUN_EVENT_CAP) break;
    out.push(...newestFirst.slice(i, j));
    rows++;
    i = j;
  }
  return out;
}

export async function getLiveExampleData(): Promise<LiveExampleData | null> {
  const base = `/api/trove/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`;
  const [summaryRes, timelineRes, stateRes, pricesRes, difRes, dailyRes] = await Promise.all([
    getJson<TrovesResponse>(`/api/troves?troveId=${LIVE_EXAMPLE_TROVE_ID}&collateralType=${LIVE_EXAMPLE_COLLATERAL}`),
    getJson<FetchTroveTimelineResult>(`${base}/timeline?limit=500`),
    getJson<TroveStateResponse>(`/api/trove/state/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`),
    getJson<OraclePricesResponse>(`/api/oracle/liquity-v2`),
    getJson<{ data?: { debtInFront?: number; trovesAhead?: number } }>(
      `/api/liquity-v2/debt-in-front?collateralType=${LIVE_EXAMPLE_COLLATERAL}&troveId=${LIVE_EXAMPLE_TROVE_ID}`,
    ),
    getJson<unknown>(`/api/liquity-v2/prices/daily?collateralType=${LIVE_EXAMPLE_COLLATERAL}`),
  ]);

  const trove = summaryRes?.data?.[0];
  const events = timelineRes?.events;
  if (!trove || !events || events.length === 0) return null;

  // The trove page's order (lib/shared/event-order.ts), so the bars
  // provider's running-state walk takes the events as they happened.
  const sorted = [...events].sort(compareEventsInOrder);

  const liquity = sorted.filter(isLiquityEvent);

  return {
    trove,
    liveState: stateRes?.success && stateRes.data ? stateRes.data : undefined,
    prices: pricesRes?.success && pricesRes.data ? pricesRes.data : undefined,
    debtInFront: typeof difRes?.data?.debtInFront === "number" ? difRes.data.debtInFront : null,
    trovesAhead: typeof difRes?.data?.trovesAhead === "number" ? difRes.data.trovesAhead : null,
    rowEvents: newestRows([...liquity].reverse()).reverse(),
    towerEvents: liquity.map(toTowerEvent),
    flowEvents: liquityV2FlowEvents(liquity),
    dailyObs: liquityBranchObs(dailyRes),
    // The loaded-event count, as the Trove page's counter states it.
    totalEvents: liquity.length,
  };
}
