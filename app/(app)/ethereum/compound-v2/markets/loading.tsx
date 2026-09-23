// Instant skeleton while this force-dynamic register's server render runs — the
// page reads all 20 markets and their rate models at the head, so the boundary
// earns its keep here.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
