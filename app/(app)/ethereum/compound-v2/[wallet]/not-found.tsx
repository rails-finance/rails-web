// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function CompoundV2PositionNotFound() {
  return (
    <RouteNotFound
      session="compound-v2"
      heading="Not an account address"
      backHref="/ethereum/compound-v2"
      backLabel="Browse Compound V2 positions"
    >
      This page is about one account, named by its 20-byte address. The URL does not carry one, so there is no account
      to look up — an address Compound V2 has simply never seen would still resolve, and say so.
    </RouteNotFound>
  );
}
