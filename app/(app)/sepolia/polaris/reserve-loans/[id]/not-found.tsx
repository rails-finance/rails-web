// The 404 body for a URL that names no reserve loan.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { POLARIS_LOANS_PATH } from "@/lib/polaris/routes";

export default function PolarisLoanNotFound() {
  return (
    <RouteNotFound
      session="polaris"
      heading="Not a loan"
      backHref={POLARIS_LOANS_PATH}
      backLabel="Browse reserve loans"
    >
      A Polaris reserve loan is named by its number. Either the URL does not carry one, or no loan with that number has
      been opened.
    </RouteNotFound>
  );
}
