// The 404 body for a URL that names no stability-pool deposit.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { POLARIS_SP_PATH } from "@/lib/polaris/routes";

export default function PolarisDepositNotFound() {
  return (
    <RouteNotFound
      session="polaris"
      heading="Not a deposit"
      backHref={POLARIS_SP_PATH}
      backLabel="Browse Stability Pool deposits"
    >
      A Polaris deposit is named by its market (usdp or goldp) and its number. Either the URL does not carry that pair,
      or no deposit with that number has been made in that market&rsquo;s pool.
    </RouteNotFound>
  );
}
