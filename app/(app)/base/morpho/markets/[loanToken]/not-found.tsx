// The 404 body for a loan asset Morpho Blue lists no market for. The status
// comes from the `(views)` route group next door; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoLoanTokenNotFound() {
  return (
    <RouteNotFound
      session="morpho-base"
      heading="No market lends this asset"
      backHref="/base/morpho/markets"
      backLabel="Browse Morpho Blue markets"
    >
      This page groups markets by the asset they lend, and the address in the URL is not one of them — either it is not
      an asset any market borrows against, or it is not an address at all.
    </RouteNotFound>
  );
}
