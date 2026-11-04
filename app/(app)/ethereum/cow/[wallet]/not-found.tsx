// The 404 body for a CoW URL whose last segment is no address.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function CowWalletNotFound() {
  return (
    <RouteNotFound session="cow" heading="No wallet in this URL" backHref="/ethereum/cow" backLabel="Look up a wallet">
      A CoW Swap page is a wallet&rsquo;s trades: the URL ends in the wallet&rsquo;s 0x address.
    </RouteNotFound>
  );
}
