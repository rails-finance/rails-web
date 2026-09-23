// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function AaveV4SpokePositionNotFound() {
  return (
    <RouteNotFound
      session="aave-v4"
      heading="Not an account address"
      backHref="/ethereum/aave-v4"
      backLabel="Browse Aave V4 positions"
    >
      This page is about one account in one spoke, named by its 20-byte address. The URL does not carry one, so there is
      no account to look up — an address with no position in this spoke would still resolve, and say so.
    </RouteNotFound>
  );
}
