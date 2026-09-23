// The 404 body for a URL that cannot be a contract address. The status comes
// from the `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function FrankencoinPositionNotFound() {
  return (
    <RouteNotFound
      session="frankencoin"
      heading="Not a position address"
      backHref="/ethereum/frankencoin"
      backLabel="Browse Frankencoin positions"
    >
      A Frankencoin position is its own contract, so its 20-byte address is the identity — not the owner&rsquo;s, which
      is transferable. The URL does not carry one, so there is no contract to read.
    </RouteNotFound>
  );
}
