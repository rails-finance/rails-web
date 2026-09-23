// Instant skeleton while this force-dynamic view's server render runs — the
// page reads all listed markets and the risk frame at the head, so the
// boundary earns its keep here.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
