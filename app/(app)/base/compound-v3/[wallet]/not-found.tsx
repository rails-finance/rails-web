// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function CompoundBaseWalletNotFound() {
  return (
    <RouteNotFound
      session="compound-base"
      heading="Not an account address"
      backHref="/base/compound-v3"
      backLabel="Browse Compound V3 positions on Base"
    >
      This page is about one account across every Comet on Base, named by its 20-byte address. The URL does not carry
      one, so there is no account to ask about — an address none of them has seen would still resolve, and say so.
    </RouteNotFound>
  );
}
