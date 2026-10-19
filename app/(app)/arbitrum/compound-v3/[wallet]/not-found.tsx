// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function CompoundArbitrumWalletNotFound() {
  return (
    <RouteNotFound
      session="compound-v3-arbitrum"
      heading="Not an account address"
      backHref="/arbitrum/compound-v3"
      backLabel="Look up another wallet on Compound V3 Arbitrum"
    >
      This page is about one account across every Comet on Arbitrum, named by its 20-byte address. The URL does not
      carry one, so there is no account to look up — an address none of them has seen would still resolve, and say so.
    </RouteNotFound>
  );
}
