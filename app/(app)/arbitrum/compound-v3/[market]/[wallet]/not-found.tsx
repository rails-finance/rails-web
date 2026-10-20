// The 404 body for a market key the roster does not hold, or a wallet segment
// that cannot be an address. The status comes from the `(views)` route group
// beside this explorer's routes; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";

const KEYS = COMPOUND_ARBITRUM_DEPLOYMENT.markets.map((m) => m.key).join(", ");

export default function CompoundArbitrumMarketNotFound() {
  return (
    <RouteNotFound
      session="compound-v3-arbitrum"
      heading="Not a Compound V3 position on Arbitrum"
      backHref="/arbitrum/compound-v3"
      backLabel="Look up another wallet on Compound V3 Arbitrum"
    >
      This page is one account in one Comet on Arbitrum: a market key ({KEYS}) and a 20-byte address. The URL does not
      carry both.
    </RouteNotFound>
  );
}
