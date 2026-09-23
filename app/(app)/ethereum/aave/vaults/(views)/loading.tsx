// The route-level skeleton for Aave's vault layer on Ethereum.
// ----------------------------------------------------------------------------
// The routes under it are `force-dynamic` and their first paint waits on a
// census round trip through the positions proxy, so without a boundary here a
// click on the VAULTS tab left the previous page frozen for the whole of it.
// `ListingRouteLoading` is the same shell every other listing's
// `(views)/loading.tsx` mounts: the toolbar block, then the row column, in the
// real `ChainTruthListing` order.
//
// IT LIVES IN THE `(views)` GROUP, NOT AT THE VAULTS ROOT. A `loading.tsx` is
// a Suspense boundary over its WHOLE subtree, and once a boundary's shell has
// flushed the response status is fixed — so at `ethereum/aave/vaults/` this
// file would also wrap `[vault]` and `[vault]/[holder]`, and each of their
// `notFound()` calls would run too late to matter: a vault that does not exist
// would answer 200 with a not-found body. The group holds the roster, the
// position listing and the about page, all of which want this skeleton, and no
// dynamic segment; a route group adds no URL segment, so
// `/ethereum/aave/vaults` is still the roster's path.
// `scripts/check-explorer-routes.mjs` holds the shape to its word, and caught
// this file at the root on the way in.
//
// The rail header inside the shared shell is derived from the route alone: the
// pathname resolves to the Aave vaults roster entry, so the real rail is drawn
// with the VAULTS tab lit. That is the same chrome the real page has, so the
// row holds steady through the navigation instead of vanishing into the
// skeleton.

import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
