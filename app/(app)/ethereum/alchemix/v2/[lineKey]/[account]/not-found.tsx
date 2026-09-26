// The 404 body for a line-and-account that names no Alchemix V2 position.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function AlchemixV2PositionNotFound() {
  return (
    <RouteNotFound
      session="alchemix"
      heading="No V2 position under this line and account"
      backHref="/ethereum/alchemix/v2"
      backLabel="Browse V2 positions"
    >
      A V2 position is keyed by its line and the wallet account that held it. V2 ran two lines, alUSD and alETH, and an
      account that used one of them has no position on the other.
    </RouteNotFound>
  );
}
