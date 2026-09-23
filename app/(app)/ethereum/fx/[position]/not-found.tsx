// The 404 body for a URL that cannot name a position. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function FxPositionNotFound() {
  return (
    <RouteNotFound
      session="fx"
      heading="Not a position id"
      backHref="/ethereum/fx"
      backLabel="Browse f(x) Protocol positions"
    >
      An f(x) position is one id in one pool, so its slug is the pool then the id — <code>wsteth-416</code>. The URL
      does not carry that pair, so there is nothing the protocol could answer to.
    </RouteNotFound>
  );
}
