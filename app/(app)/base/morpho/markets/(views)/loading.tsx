// Instant skeleton while this force-dynamic view's server render runs — the
// page reads all 4,306 censused markets at the head, so the boundary earns
// its keep here.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
