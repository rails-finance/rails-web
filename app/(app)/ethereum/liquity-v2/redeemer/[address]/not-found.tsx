// The 404 body for a URL that names no Liquity V2 redeemer.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { LIQUITY_V2_BASE_PATH } from "@/lib/liquity-v2/sp-routes";

export default function LiquityV2RedeemerNotFound() {
  return (
    <RouteNotFound
      session="liquity-v2"
      heading="Not a redeemer"
      backHref={LIQUITY_V2_BASE_PATH}
      backLabel="Browse Troves"
    >
      A Liquity V2 redeemer is named by the address that sent the redemption. Either the URL does not carry an address,
      or the index holds no redemption sent from it.
    </RouteNotFound>
  );
}
