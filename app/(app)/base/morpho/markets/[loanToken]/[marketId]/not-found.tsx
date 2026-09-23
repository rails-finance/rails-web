// The 404 body for a market id Morpho Blue on Base has no market for, or one
// that lends a different token than the path names. No loading boundary sits
// above this route, so the status is a real 404; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoBaseMarketNotFound() {
  return (
    <RouteNotFound
      session="morpho-base"
      heading="No such market"
      backHref="/base/morpho/markets"
      backLabel="Browse Morpho Blue markets"
    >
      The id in the URL is not a Morpho Blue market on Base that lends this asset — either no market has that id, or it
      lends a different token, or it is not a market id at all.
    </RouteNotFound>
  );
}
