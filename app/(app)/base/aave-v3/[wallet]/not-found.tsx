// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function AaveV3BasePositionNotFound() {
  return (
    <RouteNotFound
      session="aave-v3-base"
      heading="Not an account address"
      backHref="/base/aave-v3"
      backLabel="Browse Aave V3 positions on Base"
    >
      This page is about one account, named by its 20-byte address. The URL does not carry one, so there is no account
      to look up — an address the Pool has simply never seen would still resolve, and say so.
    </RouteNotFound>
  );
}
