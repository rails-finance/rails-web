// The 404 body for a URL that cannot be an NFT id. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function FluidPositionNotFound() {
  return (
    <RouteNotFound
      session="fluid"
      heading="Not a position id"
      backHref="/ethereum/fluid"
      backLabel="Browse Fluid positions"
    >
      A Fluid position is an ERC-721, and its id is a whole number. The URL does not carry one, so there is nothing the
      vault could answer to — an id it has not minted yet would still resolve, and say so.
    </RouteNotFound>
  );
}
