"use client";

// Shared page shell for the V3-family market-overview surfaces (/aave-v3/market,
// /spark/market and the rest; lib/shared/aave-market-configs.ts names them) —
// the single-market carry-across of /aave-v4/hubs. Owns the fetch lifecycle,
// header (breadcrumb · title · explainer · chain stamp) and the loading /
// error / stale states; the route pages pass a market config. The reserve
// pages under it (components/shared/aave-reserve-page.tsx) read the same
// market through `useAaveMarket`. There is no prices context to enrol: USD
// arrives in the payload, priced by the market's own oracle in the same read.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAaveMarketOverview, type AaveMarketOverviewResponse } from "@/lib/api/fetch-aave-market-overview";
import { buildAaveMarketView, type AaveMarketView } from "@/lib/shared/aave-market-view";
import { AaveMarketViews, AaveMarketLoadingSkeleton } from "@/components/shared/aave-market-views";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { protocolForHref } from "@/lib/shared/protocols";
import { BlockRef } from "@/components/shared/block-ref";
import { headReadOf, serverReadVia, type ServerRead } from "@/lib/shared/server-head-read";
import { aaveV3MarketModal } from "@/lib/aave-v3/event-templates";
import { sparkModal } from "@/lib/spark/event-templates";
import { ETHEREUM_AAVE_V3_MARKETS, reserveHref, type AaveMarketConfig } from "@/lib/shared/aave-market-configs";

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

/** The chain-snapshot line under the h1. */
export function MarketStamp({ read, m }: { read: AaveMarketRead; m: AaveMarketConfig }) {
  const { data, readBy } = read;
  if (!data || data.chainStale || data.blockNumber <= 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · <BlockRef block={data.blockNumber} chainId={m.chainId} />
      {serverReadVia(readBy)}
    </p>
  );
}

/** Core · Prime · EtherFi on the Ethereum Aave V3 market page: each a link to
 *  its market (`?market=`), the current one muted. */
function EthereumMarketSelector({ current }: { current: AaveMarketConfig }) {
  return (
    <nav aria-label="Aave V3 markets on Ethereum" className="mb-4 flex items-center gap-3 text-[13px]">
      {ETHEREUM_AAVE_V3_MARKETS.map(({ key, config }) =>
        config.key === current.key ? (
          <span key={key} aria-current="page" className="font-semibold text-rb-500">
            {config.marketLabel.replace(/^Aave V3 /, "")}
          </span>
        ) : (
          <Link
            key={key}
            href={`${config.marketHref}${config.marketQuery}`}
            className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
          >
            {config.marketLabel.replace(/^Aave V3 /, "")}
          </Link>
        ),
      )}
    </nav>
  );
}

export function AaveMarketPage({ market: m }: { market: AaveMarketConfig }) {
  const read = useAaveMarket(m);
  const { data, loading, error, view } = read;
  // The roster entry supplies the crumb + chain mark; `listingHref` is the
  // page's basePath, so a market page cannot crumb to a listing that is not
  // its own.
  const protocol = protocolForHref(m.listingHref);
  if (!protocol) throw new Error(`aave-market-page: no roster entry for ${m.listingHref}`);

  const body =
    loading && !data ? (
      <AaveMarketLoadingSkeleton />
    ) : error || !view ? (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read the market from chain.</p>
        <p className="text-sm">{error ?? "The RPC read failed: reload to retry."}</p>
      </div>
    ) : (
      <div data-skel-section="page-table">
        <AaveMarketViews
          view={view}
          listingHref={m.listingHref}
          assetHref={m.assetHref}
          reserveHref={(asset) => reserveHref(m, asset)}
          chainId={m.chainId}
        />
      </div>
    );

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={protocol}
          title="Market overview"
          learnMore={marketModal(m)}
          stamp={<MarketStamp read={read} m={m} />}
        />
        {m.listingHref === "/ethereum/aave-v3" && <EthereumMarketSelector current={m} />}

        {body}
      </div>
    </div>
  );
}
