import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { shortId } from "@/lib/basedollar/asset-catalog";
import { loadBasedollarTroveTail } from "@/lib/basedollar/trove-page-data";
import BasedollarTroveDetail from "./trove-view";

interface Props {
  params: Promise<{ collateralType: string; troveId: string }>;
}

// A trove's settled facts change only when the trove transacts, but its numbers
// are stated as current, so the route renders per request and every backend read
// is `no-store`. Serving a position page from a previous request's read is a
// separate decision — a charter one, about which values may render as current —
// not a side effect of this change.
export const dynamic = "force-dynamic";

// Moved down from the layout: the page is the segment that fetches, so it is the
// segment that can describe what it fetched. Output is unchanged.
// The troveId is a full uint256 — pre-truncate with the protocol's own shortId
// (the same form the card uses); the collateral branch names the market segment.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ collateralType: string; troveId: string }>;
}): Promise<Metadata> {
  const { collateralType, troveId } = await params;
  return positionMetadata({
    session: "basedollar",
    subject: shortId(troveId),
    market: collateralType,
    canonicalPath: `/base/basedollar/${collateralType}/${troveId}`,
    // This route carries its own opengraph-image.tsx, rendering this trove's
    // live card — the static per-explorer PNG stays only its fallback.
    image: "dynamic",
  });
}

export default async function BasedollarTrovePage({ params }: Props) {
  const { collateralType, troveId } = await params;

  const tail = await loadBasedollarTroveTail(collateralType, troveId);
  // Only an unknown branch, or an answered-and-empty roster, reaches this — a
  // failed read leaves `missing` false and hands the client an unseeded view to
  // retry. It resolves to a real 404 because no Suspense boundary sits above
  // this segment: the listing's `loading.tsx` lives in the sibling `(views)`
  // route group. The body comes from `not-found.tsx` alongside this file.
  if (tail.missing) notFound();

  return (
    <BasedollarTroveDetail
      // Keyed on the trove so a client-side navigation to another position
      // remounts with the new server tail as its initial state, rather than
      // holding the previous trove's numbers in state under new props.
      key={`${collateralType}:${troveId}`}
      collateralType={collateralType}
      troveId={troveId}
      initialTrove={tail.trove}
      initialEvents={tail.events}
      initialCutoffBlock={tail.cutoffBlock}
      initialOpening={tail.opening}
    />
  );
}
