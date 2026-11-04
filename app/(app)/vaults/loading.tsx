// The index's skeleton: its first paint waits on the index read, which is
// cached and is slow only when the cache is cold (lib/vaults/index-read.ts).
// `ListingRouteLoading` draws no rail where the path is on no explorer.

import { ListingRouteLoading } from "@/components/shared/listing-route-loading";

export default function Loading() {
  return <ListingRouteLoading />;
}
