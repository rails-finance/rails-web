// Instant skeleton while this force-dynamic view's server render runs — the
// page fetches the whole indexed loan set and resolves its token metadata, so
// the boundary keeps navigation responsive.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
