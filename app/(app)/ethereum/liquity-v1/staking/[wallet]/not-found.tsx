// The 404 body for a URL that names no Liquity V1 LQTY stake.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";

export default function LiquityV1StakeNotFound() {
  return (
    <RouteNotFound
      session="liquity-v1"
      heading="Not a stake"
      backHref={LIQUITY_V1_STAKING_PATH}
      backLabel="Browse LQTY stakes"
    >
      A Liquity V1 LQTY stake is named by the staker&rsquo;s address. Either the URL does not carry one, or that address
      has never staked LQTY.
    </RouteNotFound>
  );
}
