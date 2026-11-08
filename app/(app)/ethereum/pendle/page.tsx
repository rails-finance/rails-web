// Pendle on Ethereum: the explorer root opens on the market roster, the
// explorer's first sub-page. A Pendle market holds no loan and is not a share
// vault, so there is no position listing; a wallet's positions open from the
// search (H15) at /ethereum/pendle/<wallet>.

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

export default function PendleExplorerRoot() {
  redirect(protocolForHref("/ethereum/pendle")!.subPages[0]!.href);
}
