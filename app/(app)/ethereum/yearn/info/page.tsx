// focus: the explorer's explainer; the shell's gate stands over the explorer
// The explorer's about page — /ethereum/yearn/info, the (i) in the rail.
// ----------------------------------------------------------------------------
// Every explorer's rail carries an (i) at `<href>/info`, and this explorer's
// whole product is the one vault layer: how it is built, in words, is the
// layer's own about page a segment along. So this route is that page's door
// rather than a second copy of it — 0028 gives a page one address.
//
// The layer's page is drawn on ProtocolInfoPage with the explorer's menu, so its
// Assets section stands there beside Vaults (ui-jobs 791) and this route stays
// a redirect.

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

export default function YearnInfoRedirect() {
  redirect(`${protocolForHref("/ethereum/yearn")!.subPages[0]!.href}/info`);
}
