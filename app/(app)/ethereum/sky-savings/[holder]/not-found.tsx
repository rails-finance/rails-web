// The 404 body for a Sky Savings position URL that names no sUSDS holder.
import { RouteNotFound } from "@/components/shared/route-not-found";
import { SKY_BASE_PATH } from "@/lib/sky-savings/constants";

export default function SkySavingsPositionNotFound() {
  return (
    <RouteNotFound
      session="sky-savings"
      heading="No Sky Savings position"
      backHref={SKY_BASE_PATH}
      backLabel="Browse Sky Savings positions"
    >
      A Sky Savings position is an address that has held sUSDS on Ethereum. This address has no deposit, withdrawal or
      transfer of sUSDS, or the URL does not carry an address.
    </RouteNotFound>
  );
}
