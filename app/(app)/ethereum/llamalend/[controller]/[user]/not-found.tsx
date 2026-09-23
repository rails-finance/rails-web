// The 404 body for a URL that cannot name a (controller, user) pair. The status
// comes from the `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function LlamalendPositionNotFound() {
  return (
    <RouteNotFound
      session="llamalend"
      heading="Not a position"
      backHref="/ethereum/llamalend"
      backLabel="Browse LlamaLend positions"
    >
      A LlamaLend position is a borrower in one market&rsquo;s Controller, and each market liquidates independently — so
      it takes both addresses to name one. The URL does not carry them.
    </RouteNotFound>
  );
}
