// The 404 body for an address that answers as no Pendle market.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function PendleMarketNotFound() {
  return (
    <RouteNotFound
      session="pendle"
      heading="No Pendle market at this address"
      backHref="/ethereum/pendle/markets"
      backLabel="Pendle markets"
    >
      A Pendle market page ends in the market&rsquo;s 0x address: the LP token&rsquo;s contract.
    </RouteNotFound>
  );
}
