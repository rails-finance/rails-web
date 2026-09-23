// Instant skeleton while this force-dynamic listing's server render runs. See
// components/shared/listing-route-loading.tsx for why the boundary matters —
// and for why it lives in `(views)` rather than at the explorer root.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
