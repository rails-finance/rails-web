// Instant skeleton while this force-dynamic listing's server render runs. See
// components/shared/listing-route-loading.tsx for why the boundary matters.
// Yearn has no (views) group at its route, so the Assets page carries its own
// (ui-jobs 786).
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
