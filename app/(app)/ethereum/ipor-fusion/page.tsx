// IPOR Fusion — the explorer root, /ethereum/ipor-fusion. A permanent redirect
// to its one sub-page, the roster of vaults, as Yearn's root is: the whole
// product is vaults, so there is no position listing (decision 0027 call 2).

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

// focus: a redirect to the explorer's first sub-page, which declares itself.

export default function IporFusionExplorerRoot() {
  redirect(protocolForHref("/ethereum/ipor-fusion")!.subPages[0]!.href);
}
