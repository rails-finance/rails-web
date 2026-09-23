import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { loadTroveTail } from "@/lib/liquity/trove-page-data";
import TroveView from "./trove-view";

interface Props {
  params: Promise<{ collateralType: string; troveId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// A trove's settled facts change only when the trove transacts, but the page
// reads searchParams (below) and its numbers are stated as current, so the route
// renders per request and every backend read is `no-store`. Serving a position
// page from a previous request's read is a separate decision — a charter one,
// about which values may render as current — not a side effect of this change.
export const dynamic = "force-dynamic";

// The troveId is a full uint256 — pre-truncate to its first 8 characters (the
// form the page itself shows); the collateral branch names the market segment.
// `positionMetadata` also points the share card at Liquity V2's own, the same
// way every other trove explorer (Ebisu, Asymmetry, Basedollar) does.
//
// This lives on the page rather than the layout now: the page is the segment
// that fetches, so it is the segment that can describe what it fetched. The
// layout above keeps only the shell mark.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collateralType, troveId } = await params;
  const collateralDisplay = collateralType === "WETH" ? "ETH" : collateralType;
  const truncatedTroveId = troveId.length > 8 ? `${troveId.substring(0, 8)}…` : troveId;
  return positionMetadata({
    session: "liquity-v2",
    subject: truncatedTroveId,
    market: `${collateralDisplay}/BOLD`,
    canonicalPath: `/ethereum/liquity-v2/trove/${collateralType}/${troveId}`,
    // This route carries its own opengraph-image.tsx, rendering this trove's
    // live card — the static per-explorer PNG stays only its fallback.
    image: "dynamic",
  });
}

export default async function TrovePage({ params, searchParams }: Props) {
  const { collateralType, troveId } = await params;
  const sp = await searchParams;

  // `?hide=op1,op2` overrides the stored type filter for this view — a
  // shareable / embeddable pre-filtered timeline (the home hero iframes this
  // page with redemptions + delegate rate updates set aside). Display-level
  // only: it never writes into the visitor's saved filter state. Decoded here
  // rather than from `window.location.search` on the client, so the filtered
  // timeline is the one that renders on the server too.
  const raw = sp.hide;
  const hide = Array.isArray(raw) ? raw[0] : raw;
  const urlHidden = hide ? hide.split(",").filter(Boolean) : null;

  const tail = await loadTroveTail(collateralType, troveId);
  // Only an answered-and-empty backend roster reaches this — a failed read
  // leaves `missing` false and hands the client an unseeded view to retry.
  //
  // This resolves to a real 404 because no Suspense boundary sits above this
  // segment: the listing's `loading.tsx` lives in the sibling `(views)` route
  // group. A boundary here would flush the shell first and pin the status at
  // 200. The body comes from `not-found.tsx` alongside this file.
  if (tail.missing) notFound();

  return (
    <TroveView
      // Keyed on the trove so a client-side navigation to another position
      // remounts with the new server tail as its initial state, rather than
      // holding the previous trove's numbers in state under new props.
      key={`${collateralType}:${troveId}`}
      collateralType={collateralType}
      troveId={troveId}
      initialTrove={tail.trove}
      initialEvents={tail.events}
      initialTotalEvents={tail.hasMore ? tail.totalEvents : null}
      initialPrices={tail.prices}
      urlHidden={urlHidden}
    />
  );
}
