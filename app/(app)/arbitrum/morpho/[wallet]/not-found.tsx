// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoArbitrumWalletNotFound() {
  return (
    <RouteNotFound
      session="morpho-arbitrum"
      heading="Not an account address"
      backHref="/arbitrum/morpho"
      backLabel="Look up another wallet on Morpho Blue Arbitrum"
    >
      This page is about one account, named by its 20-byte address. The URL does not carry one, so there is no account
      to look up — an address the singleton has never seen would still resolve, and say so.
    </RouteNotFound>
  );
}
