// The 404 body for a market key the roster does not hold, or a wallet segment
// that cannot be an address. The status comes from the `(views)` route group
// beside this explorer's routes; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

const KEYS = COMPOUND_BASE_DEPLOYMENT.markets.map((m) => m.key).join(", ");

export default function CompoundBaseMarketNotFound() {
  return (
    <RouteNotFound
      session="compound-base"
      heading="Not a Compound V3 position on Base"
      backHref="/base/compound-v3"
      backLabel="Browse Compound V3 positions on Base"
    >
      This page is one account in one Comet on Base: a market key ({KEYS}) and a 20-byte address. The URL does not carry
      both.
    </RouteNotFound>
  );
}
