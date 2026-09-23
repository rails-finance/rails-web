// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoBaseWalletNotFound() {
  return (
    <RouteNotFound
      session="morpho-base"
      heading="Not an account address"
      backHref="/base/morpho"
      backLabel="Browse Morpho Blue positions on Base"
    >
      This page is about one account across every Morpho Blue market on Base, named by its 20-byte address. The URL does
      not carry one, so there is no account to ask about.
    </RouteNotFound>
  );
}
