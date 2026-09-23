// The 404 body for a URL that cannot name an Account.Info. The status comes from
// the `(views)` route group beside this route; see
// components/shared/route-not-found.tsx.
import { RouteNotFound } from "@/components/shared/route-not-found";

export default function DolomitePositionNotFound() {
  return (
    <RouteNotFound
      session="dolomite"
      heading="Not an account"
      backHref="/ethereum/dolomite"
      backLabel="Browse Dolomite accounts"
    >
      A Dolomite position is an Account.Info: an owner&rsquo;s 20-byte address and a uint256 account number, which
      liquidate independently of the owner&rsquo;s other accounts. The URL does not carry that pair.
    </RouteNotFound>
  );
}
