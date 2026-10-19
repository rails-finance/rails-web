"use client";

// Shared page shell for the V3-family market-overview surfaces (/aave-v3/market,
// /spark/market) — the single-market carry-across of /aave-v4/hubs. Owns the
// fetch lifecycle, header (breadcrumb · title · explainer · chain stamp) and
// the loading / error / stale states; the two route pages are thin configs.
// Unlike the V4 hubs page there is no prices context to enrol: USD arrives in
// the payload itself, priced by the market's own oracle in the same chain read.

import { useEffect, useState } from "react";
import { MAINNET_CHAIN_ID, chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { fetchAaveMarketOverview, type AaveMarketOverviewResponse } from "@/lib/api/fetch-aave-market-overview";
import { buildAaveMarketView } from "@/lib/shared/aave-market-view";
import { AaveMarketViews, AaveMarketLoadingSkeleton } from "@/components/shared/aave-market-views";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { protocolForHref } from "@/lib/shared/protocols";
import { BlockRef } from "@/components/shared/block-ref";

export interface AaveMarketPageProps {
  /** This deployment's chain proxy for the market ("/api/chain/spark/market"). */
  apiRoute: string;
  /** Protocol id — selects the market-surface provenance vocabulary
   *  ("aave-v3" / "aave-v3-base" / "aave-v3-arbitrum" / "seamless" / "spark"). */
  protocol: "aave-v3" | "aave-v3-base" | "aave-v3-arbitrum" | "seamless" | "spark";
  /** Which chain the market is on. Drives the block link's explorer; defaults
   *  to Ethereum, so the two existing pages render the Etherscan URL they
   *  rendered before. Getting this wrong is invisible on the page and wrong in
   *  the link, which is why it comes off the roster rather than the call site's
   *  memory. */
  chainId?: ChainId;
  /** The protocol's listing route + display name (breadcrumb root). */
  listingHref: string;
  protocolName: string;
  /** Market identity on the summary card ("Aave V3 Core" / "SparkLend"). */
  marketLabel: string;
  /** Neutral one-liner — what the market is, not how good it is. */
  purpose: string;
  learnMore: LearnMoreContent;
  /** Listing URL filtered to one asset/side, where the listing supports it. */
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
  /** "section": the overview sits under another page's header (a
   *  position-first explorer's protocol page), so it draws a section heading
   *  in place of the rail header and the h1. */
  header?: "page" | "section";
}

export function AaveMarketPage(props: AaveMarketPageProps) {
  const [data, setData] = useState<AaveMarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAaveMarketOverview(props.apiRoute)
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
  }, [props.apiRoute]);

  const view =
    data && !data.chainStale
      ? buildAaveMarketView(data.reserves, {
          label: props.marketLabel,
          purpose: props.purpose,
          protocol: props.protocol,
          blockNumber: data.blockNumber,
          pool: data.pool,
          oracle: data.oracle,
          capAutomator: data.capAutomator,
        })
      : null;
  // The roster entry supplies the crumb + chain mark; `listingHref` is the
  // page's own basePath, so a market page cannot crumb to a listing that is
  // not its own.
  const protocol = protocolForHref(props.listingHref);
  if (!protocol) throw new Error(`aave-market-page: no roster entry for ${props.listingHref}`);

  const body =
    loading && !data ? (
      <AaveMarketLoadingSkeleton />
    ) : error || !view ? (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read the market from chain.</p>
        <p className="text-sm">{error ?? "The RPC read failed — reload to retry."}</p>
      </div>
    ) : (
      <div data-skel-section="page-table">
        <AaveMarketViews view={view} listingHref={props.listingHref} assetHref={props.assetHref} />
      </div>
    );

  const stamp =
    data && !data.chainStale && data.blockNumber > 0 ? (
      <p className="mt-2 text-[11px] text-rb-500">
        Chain snapshot · <BlockRef block={data.blockNumber} chainId={props.chainId ?? MAINNET_CHAIN_ID} />
      </p>
    ) : undefined;

  if (props.header === "section")
    return (
      <section aria-labelledby="market-overview-heading">
        <header className="mb-6" data-skel-section="page-header">
          <div className="flex items-center gap-2">
            <h2 id="market-overview-heading" className="text-lg font-semibold text-foreground">
              Market overview
            </h2>
            <LearnMore content={props.learnMore} inline />
          </div>
          {stamp}
        </header>
        {body}
      </section>
    );

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={protocol} title="Market overview" learnMore={props.learnMore} stamp={stamp} />

        {body}
      </div>
    </div>
  );
}
