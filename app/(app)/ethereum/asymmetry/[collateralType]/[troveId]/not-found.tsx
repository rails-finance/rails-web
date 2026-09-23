// The 404 body for a trove Asymmetry does not hold. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function AsymmetryTroveNotFound() {
  return (
    <RouteNotFound
      session="asymmetry"
      heading="No trove under this branch and id"
      backHref="/ethereum/asymmetry"
      backLabel="Browse Asymmetry troves"
    >
      A trove is keyed by both. The branch names which collateral market holds it, and an id that exists under one
      branch is not the same trove under another.
    </RouteNotFound>
  );
}
