// The 404 body for a URL that cannot name an account in a market. The status
// comes from the `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MorphoArbitrumPositionNotFound() {
  return (
    <RouteNotFound
      session="morpho-arbitrum"
      heading="Not a position"
      backHref="/arbitrum/morpho"
      backLabel="Look up another wallet on Morpho Blue Arbitrum"
    >
      This page is one account in one market: a 20-byte address, and a market&rsquo;s 32-byte id — the keccak of its
      parameters, 0x and 64 hex characters. The URL does not carry both.
    </RouteNotFound>
  );
}
