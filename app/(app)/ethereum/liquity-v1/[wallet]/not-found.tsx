// The 404 body for a URL that cannot be an address. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function LiquityV1TroveNotFound() {
  return (
    <RouteNotFound
      session="liquity-v1"
      heading="Not an account address"
      backHref="/ethereum/liquity-v1"
      backLabel="Browse Liquity V1 Troves"
    >
      A Liquity V1 Trove is keyed by its owner&rsquo;s 20-byte address. The URL does not carry one, so there is no Trove
      to look up — an address that never borrowed here would still resolve, and say so.
    </RouteNotFound>
  );
}
