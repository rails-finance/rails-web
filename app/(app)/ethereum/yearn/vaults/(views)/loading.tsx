// The route-level skeleton for Yearn's roster.
// ----------------------------------------------------------------------------
// The roster is `force-dynamic` and its first paint waits on a Multicall3 wave
// over 247 vaults, so without a boundary here a click on the VAULTS tab would
// leave the previous page frozen for the whole of it. `ListingRouteLoading` is
// the same shell every other listing's `(views)/loading.tsx` mounts.
//
// IT LIVES IN THE `(views)` GROUP, NOT AT THE VAULTS ROOT. A `loading.tsx` is a
// Suspense boundary over its WHOLE subtree, and once a boundary's shell has
// flushed the response status is fixed — so at `yearn/vaults/` this file would
// also wrap `[vault]`, and that page's `notFound()` would run too late to
// matter: a vault outside the catalogue would answer 200 with a not-found body.
// The group holds the roster and the about page, both of which want this
// skeleton, and no dynamic segment; a route group adds no URL segment, so
// `/ethereum/yearn/vaults` is still the roster's path.
// `scripts/check-explorer-routes.mjs` holds the shape to its word.
//
// The rail header inside the shared shell is derived from the route alone: the
// pathname resolves to the Yearn roster entry, so the real rail is drawn with
// the VAULTS tab lit, and the row holds steady through the navigation.

import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
