// The 404 body for a trove Basedollar does not hold. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function BasedollarTroveNotFound() {
  return (
    <RouteNotFound
      session="basedollar"
      heading="No trove under this branch and id"
      backHref="/base/basedollar"
      backLabel="Browse Basedollar troves"
    >
      A trove is keyed by both. The branch names which collateral market holds it, and an id that exists under one
      branch is not the same trove under another.
    </RouteNotFound>
  );
}
