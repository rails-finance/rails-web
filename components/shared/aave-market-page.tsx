"use client";

// One Aave-family market's read (lib/shared/aave-market-configs.ts names the
// markets): its chain proxy, fetched once per page, built into the view
// (lib/shared/aave-market-view.ts). The family adapter
// (lib/aave-family/product.tsx) maps it into the shared product shells; the
// market page, each roster panel and the reserve page read it through
// `useAaveMarket`. USD arrives in the payload, priced by the market's own
// oracle in the same read.

import { useEffect, useState } from "react";
import { fetchAaveMarketOverview, type AaveMarketOverviewResponse } from "@/lib/api/fetch-aave-market-overview";
import { buildAaveMarketView, type AaveMarketView } from "@/lib/shared/aave-market-view";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { headReadOf, type ServerRead } from "@/lib/shared/server-head-read";
import { aaveV3MarketModal } from "@/lib/aave-v3/event-templates";
import { sparkModal } from "@/lib/spark/event-templates";
import type { AaveMarketConfig } from "@/lib/shared/aave-market-configs";

/** The market's "?" explainer. */
export const marketModal = (m: AaveMarketConfig): LearnMoreContent =>
  m.modal === "spark" ? sparkModal("market") : aaveV3MarketModal(m.modal);

export interface AaveMarketRead {
  data: AaveMarketOverviewResponse | null;
  loading: boolean;
  error: string | null;
  /** Who read the block: rails-server live, its stored snapshot, or (null) the web's chain read. */
  readBy: ServerRead | null;
  view: AaveMarketView | null;
}

/** One market's overview, read through its chain proxy and built into the view. */
export function useAaveMarket(m: AaveMarketConfig): AaveMarketRead {
  const [data, setData] = useState<AaveMarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAaveMarketOverview(m.apiRoute)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load market");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [m.apiRoute]);

  const readBy = data ? (headReadOf(data.head, data.blockNumber, data.stored) ?? null) : null;
  const view =
    data && !data.chainStale
      ? buildAaveMarketView(data.reserves, {
          label: m.marketLabel,
          purpose: m.purpose,
          protocol: m.key,
          blockNumber: data.blockNumber,
          readBy,
          pool: data.pool,
          oracle: data.oracle,
          capAutomator: data.capAutomator,
        })
      : null;
  return { data, loading, error, readBy, view };
}
