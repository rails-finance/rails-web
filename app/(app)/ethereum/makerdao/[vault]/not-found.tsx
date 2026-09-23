// The 404 body for a URL that cannot name a vault. The status comes from the
// `(views)` route group beside this route; see components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function MakerVaultNotFound() {
  return (
    <RouteNotFound
      session="makerdao"
      heading="Not a vault id"
      backHref="/ethereum/makerdao"
      backLabel="Browse MakerDAO vaults"
    >
      A MakerDAO vault is named by its cdp id, or — for a LockStake engine urn, which has none — by the urn&rsquo;s own
      20-byte address. The URL carries neither, so there is nothing the Vat could answer to.
    </RouteNotFound>
  );
}
