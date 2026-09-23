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
import { getEventActionKey } from "@/lib/shared/event-filter-helpers";
import {
  LIVE_EXAMPLE_COLLATERAL,
  LIVE_EXAMPLE_HIDDEN_OPS,
  LIVE_EXAMPLE_TROVE_ID,
  type HeroTowerEvent,
  type LiveExampleData,
} from "./live-example";

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
        },
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

/** How many full event cards ship to the client — the hero's visible zone
 *  fades out after ~2, so 6 leaves comfortable headroom. */
const VISIBLE_EVENT_LIMIT = 6;

export async function getLiveExampleData(): Promise<LiveExampleData | null> {
  const base = `/api/trove/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`;
  const [summaryRes, timelineRes, stateRes, pricesRes, difRes] = await Promise.all([
    getJson<TrovesResponse>(`/api/troves?troveId=${LIVE_EXAMPLE_TROVE_ID}&collateralType=${LIVE_EXAMPLE_COLLATERAL}`),
    getJson<FetchTroveTimelineResult>(`${base}/timeline?limit=500`),
    getJson<TroveStateResponse>(`/api/trove/state/${LIVE_EXAMPLE_COLLATERAL}/${LIVE_EXAMPLE_TROVE_ID}`),
    getJson<OraclePricesResponse>(`/api/oracle/liquity-v2`),
    getJson<{ data?: { debtInFront?: number; trovesAhead?: number } }>(
      `/api/liquity-v2/debt-in-front?collateralType=${LIVE_EXAMPLE_COLLATERAL}&troveId=${LIVE_EXAMPLE_TROVE_ID}`,
    ),
  ]);

  const trove = summaryRes?.data?.[0];
  const events = timelineRes?.events;
  if (!trove || !events || events.length === 0) return null;

  // Chronological sort with the same tri-key as the trove page — log_index
  // (the id tail, `${txHash}_${logIndex}`) breaks same-block ties so the bars
  // provider's running-state walk processes within-tx logs in emit order.
  const logIndex = (e: BaseActivityEvent) => {
    const tail = e.id.split("_").pop();
    const n = Number(tail);
    return Number.isFinite(n) ? n : 0;
  };
  const sorted = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp || logIndex(a) - logIndex(b),
  );

  const hidden = new Set(LIVE_EXAMPLE_HIDDEN_OPS);
  const visibleAsc = sorted.filter((e) => !hidden.has(getEventActionKey(e)));

  return {
    trove,
    liveState: stateRes?.success && stateRes.data ? stateRes.data : undefined,
    prices: pricesRes?.success && pricesRes.data ? pricesRes.data : undefined,
    debtInFront: typeof difRes?.data?.debtInFront === "number" ? difRes.data.debtInFront : null,
    trovesAhead: typeof difRes?.data?.trovesAhead === "number" ? difRes.data.trovesAhead : null,
    visibleEvents: [...visibleAsc].reverse().slice(0, VISIBLE_EVENT_LIMIT),
    towerEvents: sorted.filter(isLiquityEvent).map(toTowerEvent),
    visibleTotal: visibleAsc.length,
    // The loaded-event count, not the backend's raw total — the real page's
    // counter is `filtered of sortedEvents.length`, so the hero matches it.
    totalEvents: sorted.length,
  };
}
