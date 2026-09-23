// Yearn V3 — the explorer root, /ethereum/yearn.
// ----------------------------------------------------------------------------
// It draws nothing of its own. Every other explorer's root IS its position
// listing; a protocol whose whole product is vaults has no positions to list —
// a holder's share carries no debt and no threshold to breach (rails-ops
// decision 0027 call 2) — so the door opens on the roster of vaults, the
// explorer's first and only sub-page, and the rail above it drops the listing
// tab to match.
//
// A PERMANENT REDIRECT, and not a second copy of the roster: 0028 gives a page
// ONE address, and the roster's is `/ethereum/yearn/vaults`. The destination is
// read off the roster entry rather than spelled here, so moving the tab moves
// this with it.

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

export default function YearnExplorerRoot() {
  redirect(protocolForHref("/ethereum/yearn")!.subPages[0].href);
}
