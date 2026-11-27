// The 404 body for a URL that names no address.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { POLARIS_BASE_PATH } from "@/lib/polaris/routes";

export default function PolarisPethNotFound() {
  return (
    <RouteNotFound
      session="polaris"
      heading="Not an address"
      backHref={POLARIS_BASE_PATH}
      backLabel="Browse Polaris positions"
    >
      A pETH account is named by an address or an ENS name. Either the URL does not carry one, or the name points to no
      address.
    </RouteNotFound>
  );
}
