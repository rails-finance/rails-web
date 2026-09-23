// Instant skeleton while this force-dynamic listing's server render runs. See
// components/shared/listing-route-loading.tsx for why the boundary matters —
// and why the dynamic [market]/[id] route sits outside this group.
import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
