// The 404 body for a trove the roster does not hold. The status comes from the
// `(views)` route group next door; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function TroveNotFound() {
  return (
    <RouteNotFound
      session="liquity-v2"
      heading="No trove under this branch and id"
      backHref="/ethereum/liquity-v2"
      backLabel="Browse Liquity V2 troves"
    >
      A trove is keyed by both. The branch names which market segment holds it — ETH, wstETH or rETH — and an id that
      exists under one branch is not the same trove under another.
    </RouteNotFound>
  );
}
