// The 404 body for a line-and-id that names no Transmuter position on this chain.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function TransmuterPositionNotFound() {
  return (
    <RouteNotFound
      session="alchemix"
      heading="No Transmuter position under this market and id"
      backHref="/ethereum/alchemix/transmuter"
      backLabel="Browse Transmuter positions on Ethereum"
    >
      A Transmuter position is keyed by its market and its id. The market names which synthetic on which chain holds it,
      the alUSD and alETH markets here, and an id that exists on one market is a different position on another.
    </RouteNotFound>
  );
}
