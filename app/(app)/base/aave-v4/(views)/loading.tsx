// Instant skeleton while the live-priced /aave-v4 server render runs (2–5s).
// The route graduated onto the shared ChainTruthListingPage driver, so it uses
// the same shared loading shape as every other listing. See
// components/shared/listing-route-loading.tsx for why the boundary matters.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
