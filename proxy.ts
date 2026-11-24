// A wallet search on the Liquity V2 family's listings opens the wallet page
// (ui-jobs 738): a listing URL whose `?q=` names a whole address or an ENS
// name redirects to /wallet/<wallet>?protocol=<family>, so an old shared link
// lands there with an HTTP redirect before the listing renders. Anything else
// passes through to the listing.

import { NextResponse, type NextRequest } from "next/server";
import { readListQuery } from "@/lib/shared/list-filter";
import { walletSearchHref } from "@/lib/wallet/wallet-filters";

/** Each listing's path and the wallet page's protocol for it. */
const LISTINGS: Record<string, string> = {
  "/ethereum/liquity-v2": "liquity-v2",
  "/ethereum/liquity-v2/stability-pool": "liquity-v2",
  "/ethereum/ebisu": "ebisu",
  "/ethereum/ebisu/stability-pool": "ebisu",
  "/ethereum/asymmetry": "asymmetry",
  "/ethereum/asymmetry/stability-pool": "asymmetry",
  "/base/basedollar": "basedollar",
  "/base/basedollar/stability-pool": "basedollar",
};

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const href = walletSearchHref(LISTINGS[pathname.replace(/\/$/, "")], readListQuery(searchParams));
  return href ? NextResponse.redirect(new URL(href, request.url)) : NextResponse.next();
}

export const config = {
  matcher: [
    "/ethereum/liquity-v2",
    "/ethereum/liquity-v2/stability-pool",
    "/ethereum/ebisu",
    "/ethereum/ebisu/stability-pool",
    "/ethereum/asymmetry",
    "/ethereum/asymmetry/stability-pool",
    "/base/basedollar",
    "/base/basedollar/stability-pool",
  ],
};
