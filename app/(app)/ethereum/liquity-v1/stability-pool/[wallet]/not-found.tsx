// The 404 body for a URL that names no Liquity V1 stability-pool deposit.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";

export default function LiquityV1DepositNotFound() {
  return (
    <RouteNotFound
      session="liquity-v1"
      heading="Not a deposit"
      backHref={LIQUITY_V1_SP_PATH}
      backLabel="Browse Stability Pool deposits"
    >
      A Liquity V1 deposit is named by the depositor&rsquo;s address. Either the URL does not carry one, or that address
      has made no deposit in the Stability Pool.
    </RouteNotFound>
  );
}
