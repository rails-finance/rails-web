"use client";

// Route-level loading boundary for the force-dynamic chain-state listings. Next
// renders this the instant a navigation into one of these routes begins — so the
// click paints an immediate skeleton while the server render (which re-runs the
// per-request data fetch) streams in behind it, instead of the previous page
// sitting frozen for the whole round trip. Without a loading.tsx there is no
// boundary to prefetch to, so the click has nothing to show until the render
// lands.
//
// WHERE THIS FILE MAY BE MOUNTED: inside an explorer's `(views)` route group,
// never at the explorer root. A `loading.tsx` is a Suspense boundary over its
// WHOLE subtree, so at `ethereum/liquity-v2/` it also wrapped
// `trove/[collateralType]/[troveId]` — and once a boundary flushes its shell
// the response status is fixed. Every detail route's `notFound()` then ran too
// late to matter: a trove that does not exist answered 200 with a not-found
// body, and nothing on the rendered page showed it. The group holds the
// listing and the sibling views that want this skeleton (market, system,
// branches, pools, hubs, vaults); the `[param]` detail routes stay outside it
// and answer 404. A route group adds no URL segment, so nothing moved for a
// visitor. `scripts/check-explorer-routes.mjs` holds the shape to its word.
//
// Measured cost of leaving a detail route unwrapped, warm production build:
// TTFB only. The complete document arrives in the same time (74ms vs 80ms on
// the SSR'd trove page), and the RSC payload an in-app navigation fetches is
// untouched — the flight stream flushes regardless of a loading boundary.
//
// One solid block per real section — header, toolbar, then the row column —
// in the real <ChainTruthListing> order (search → facets → sort all live
// INSIDE the one toolbar block, so the strip can't mis-order what it doesn't
// draw). The header-extra band (a stats strip some listings mount between
// header and toolbar) renders ONLY when the memory layer remembered one for
// this route — a default would conjure a section most listings lack.

import { usePathname } from "next/navigation";
import { protocolForPathname, subPageForPathname } from "@/lib/shared/protocols";
import { RailHeader } from "@/components/shared/rail-header";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { ChainTruthListLoadingSkeleton } from "@/components/shared/chain-truth-list-loading-skeleton";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

export function ListingRouteLoading() {
  const { sizes, remembered } = useSkeletonSizes();
  // The rail header is derived from the route alone (roster data, no fetch),
  // so the REAL one renders here rather than a blank block — the identity +
  // sub-nav row holding steady through a navigation instead of vanishing into
  // the skeleton. The pathname is already the destination while this boundary
  // shows, so the lit tab is the one being opened. Outside the pulse wrapper:
  // it is content, not a placeholder.
  const pathname = usePathname();
  const entry = protocolForPathname(pathname);
  const venue = !entry
    ? ("listing" as const)
    : pathname === entry.infoHref || pathname?.startsWith(entry.infoHref + "/")
      ? ("info" as const)
      : subPageForPathname(entry, pathname)
        ? ("subPage" as const)
        : ("listing" as const);
  return (
    <div className="py-8">
      {entry && (
        <div className="mb-6">
          <RailHeader session={entry.session} venue={venue} stamp={venue === "listing"} />
        </div>
      )}
      <div className="animate-pulse">
        {remembered["listing-header-extra"] != null && (
          <SkeletonBlock height={remembered["listing-header-extra"]} className="mb-6" />
        )}
        <SkeletonBlock height={sizes["listing-toolbar"]} className="mb-6 rounded-md" />
        <ChainTruthListLoadingSkeleton />
      </div>
    </div>
  );
}
