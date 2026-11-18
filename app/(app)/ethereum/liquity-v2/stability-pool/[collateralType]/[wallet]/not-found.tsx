// The 404 body for a URL that names no Liquity V2 stability-pool deposit.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { LIQUITY_V2_SP_PATH } from "@/lib/liquity-v2/sp-routes";

export default function LiquityV2DepositNotFound() {
  return (
    <RouteNotFound
      session="liquity-v2"
      heading="Not a deposit"
      backHref={LIQUITY_V2_SP_PATH}
      backLabel="Browse Stability Pool deposits"
    >
      A Liquity V2 deposit is named by its branch (WETH, wstETH or rETH) and the depositor&rsquo;s address. Either the
      URL does not carry that pair, or that address has made no deposit in that branch&rsquo;s pool.
    </RouteNotFound>
  );
}
