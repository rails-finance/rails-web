// The 404 body for a Pendle URL whose segments are no wallet or market.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function PendleWalletNotFound() {
  return (
    <RouteNotFound
      session="pendle"
      heading="No Pendle position here"
      backHref="/ethereum/pendle"
      backLabel="Pendle markets"
    >
      A Pendle position page is a wallet&rsquo;s 0x address, then the market&rsquo;s.
    </RouteNotFound>
  );
}
