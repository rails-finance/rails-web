// Instant skeleton while this force-dynamic view's server render runs — the
// page reads the whole roster, its rate models and the oracle at the head, so
// the boundary earns its keep here.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
