// The 404 body for a URL that cannot name a CDP. The status comes from the
// `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
//
// It now covers TWO cases, and Next hands a not-found boundary no params, so
// the one sentence has to hold both: a URL whose segments are not a market
// and a number, and a well-formed pair naming a number that was never minted
// on that market (page.tsx calls notFound() on the second).
import { RouteNotFound } from "@/components/shared/route-not-found";
import { POLARIS_BASE_PATH } from "@/lib/polaris/routes";

export default function PolarisPositionNotFound() {
  return (
    <RouteNotFound session="polaris" heading="Not a CDP" backHref={POLARIS_BASE_PATH} backLabel="Browse Polaris CDPs">
      A Polaris CDP is named by its market (usdp or goldp) and its number. Either the URL does not carry that pair, or
      no CDP with that number has been minted on that market.
    </RouteNotFound>
  );
}
