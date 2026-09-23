// The 404 body for a URL that cannot be a (market, user) pair. The status comes
// from the `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoPositionNotFound() {
  return (
    <RouteNotFound
      session="morpho"
      heading="Not a position id"
      backHref="/ethereum/morpho"
      backLabel="Browse Morpho Blue positions"
    >
      A Morpho Blue position is one account in one market, so its id is a 32-byte market id, a hyphen, then a 20-byte
      address. The URL does not carry that pair, so there is nothing the singleton could answer to.
    </RouteNotFound>
  );
}
