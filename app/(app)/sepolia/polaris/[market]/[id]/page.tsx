import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listingMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { normalizeCdpId, normalizeMarket, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { loadPolarisPositionTail } from "@/lib/polaris/position-page-data";
import { polarisPositionHref, POLARIS_BASE_PATH } from "@/lib/polaris/routes";
import PolarisPositionView from "./position-view";

interface Props {
  params: Promise<{ market: string; id: string }>;
}

/** The metadata a never-minted number gets — the same words the 404 body
 *  leads with, so the tab and the page agree. */
const NOT_A_CDP_TITLE = "Not a CDP";
const NOT_A_CDP_DESCRIPTION = "No CDP with this number has been minted on this Polaris market.";

// The CDP's numbers are stated as current, so the route renders per request
// and every backend read is `no-store`.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, id: rawId } = await params;
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  // A number nobody ever minted must not be indexed as "USDp CDP #999999"
  // with a share card drawn for it. The loader is wrapped in React `cache`,
  // so asking it here costs no second read — this is the same call the page
  // body below makes.
  if (market && id && (await loadPolarisPositionTail(market, id)).missing) {
    return {
      ...listingMetadata({
        title: NOT_A_CDP_TITLE,
        canonicalPath: POLARIS_BASE_PATH,
        description: NOT_A_CDP_DESCRIPTION,
      }),
      robots: { index: false, follow: true },
    };
  }
  return positionMetadata({
    session: "polaris",
    subject: `#${id ?? rawId}`,
    market: market ? POLARIS_MARKET_CONFIG[market].stable.symbol : undefined,
    canonicalPath: market && id ? polarisPositionHref(market, id) : `/sepolia/polaris/${rawMarket}/${rawId}`,
    image: "dynamic",
  });
}

export default async function PolarisPositionPage({ params }: Props) {
  const { market: rawMarket, id: rawId } = await params;
  // A CDP is (market, id). A segment that names neither market, or an id that
  // is not a number, names no CDP at all.
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  if (!market || !id) notFound();

  // The index lane only. The chain lane — the CDP's own getters at head, and
  // this page's primary truth — stays in the client half; see the loader.
  const tail = await loadPolarisPositionTail(market, id);

  // A number nobody ever minted on this market. Only the index ANSWERING with
  // nothing, confirmed against head state, reaches this — a backend that
  // failed to answer leaves `missing` false and hands the client an unseeded
  // view to retry, exactly as before. See the loader for the whole rule.
  //
  // This resolves to a real 404 because no Suspense boundary sits above the
  // segment: `layout.tsx` beside this file is a fragment and a probe. A
  // boundary here would flush the shell first and pin the status at 200. The
  // body comes from `not-found.tsx` alongside this file.
  if (tail.missing) notFound();

  return (
    <PolarisPositionView
      key={`${market}:${id}`}
      market={market}
      cdpId={id}
      initialSummary={tail.position}
      initialEvents={tail.events}
    />
  );
}
