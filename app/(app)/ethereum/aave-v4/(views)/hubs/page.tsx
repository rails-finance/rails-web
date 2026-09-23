"use client";

// Aave V4 cross-hub comparison (/aave-v4/hubs). Protocol-aggregate, read-only:
// the three hubs (Core / Plus / Prime) side by side — size, composition,
// per-asset credit-line utilisation and spoke summary. Distinct from every
// other Aave V4 surface (which is position-level); this is the researcher /
// governance view. Framing: present, don't rank — fixed canonical column order,
// no score, no risk valence. See aave-v4-hub-comparison.md.

import { useEffect, useState } from "react";
import { fetchAaveV4Hubs, type AaveV4HubsResponse } from "@/lib/api/fetch-aave-v4-hubs";
import { buildHubViews, hubUnderlyings } from "@/lib/aave-v4/hub-view";
import { AaveV4HubViews } from "@/components/protocol/aave-v4/aave-v4-hub-views";
import { AaveV4HubsLoadingSkeleton } from "@/components/protocol/aave-v4/aave-v4-hubs-loading-skeleton";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { aaveV4HubsContent } from "@/lib/shared/learn-more-content";
import { protocolForHref } from "@/lib/shared/protocols";
import { PricesProvider, usePrices, useRequestPrices } from "@/lib/shared/prices-context";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const PROTOCOL = protocolForHref("/ethereum/aave-v4")!;

function HubsContent() {
  const [data, setData] = useState<AaveV4HubsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAaveV4Hubs()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load hubs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Enrol every hub asset's price so USD totals + composition resolve.
  useRequestPrices(data ? hubUnderlyings(data) : []);
  const prices = usePrices();

  const views = data ? buildHubViews(data, prices) : [];
  const hasLines = data != null && data.lines.length > 0;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Hub comparison"
          learnMore={aaveV4HubsContent()}
          stamp={
            data?.updatedAt && (
              <p className="mt-2 text-[11px] text-rb-500">
                Chain snapshot
                {data.blockNumber ? (
                  <>
                    {" · block "}
                    <a
                      href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-external"
                    >
                      {data.blockNumber.toLocaleString("en-US")}
                    </a>
                  </>
                ) : null}
              </p>
            )
          }
        />

        {loading && !data ? (
          <AaveV4HubsLoadingSkeleton />
        ) : error ? (
          <div className="py-12 text-center text-rb-500">
            <p className="mb-1">Couldn&apos;t load hub data.</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : !hasLines ? (
          <div className="py-12 text-center text-rb-500">
            <p className="mb-1">Hub data isn&apos;t available yet.</p>
            <p className="text-sm">The credit-line snapshot populates on the next refresh cycle.</p>
          </div>
        ) : (
          <div data-skel-section="page-table">
            <AaveV4HubViews views={views} block={data?.blockNumber ?? undefined} />
          </div>
        )}
        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}

export default function AaveV4HubsPage() {
  return (
    <PricesProvider>
      <HubsContent />
    </PricesProvider>
  );
}
