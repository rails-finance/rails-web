// The route-level skeleton for IPOR Fusion's roster. In the `(views)` group, so
// it wraps the roster and its about page and not `[vault]`, whose notFound()
// must set the status (the reason is in the Yearn roster's loading.tsx).

import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
