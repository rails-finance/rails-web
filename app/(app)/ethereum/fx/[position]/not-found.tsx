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
      An f(x) position is one id in one pool, and its page is <code>/ethereum/fx/</code> followed by the pool and the
      id: <code>/ethereum/fx/wsteth-416</code>. This URL does not have that shape.
    </RouteNotFound>
  );
}
