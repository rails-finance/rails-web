// focus: the explorer's explainer; the shell's gate stands over the explorer
// The explorer's about page — /ethereum/ipor-fusion/info, the (i) in the rail:
// a door to the roster's about page a segment along, as Yearn's is.

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

export default function IporFusionInfoRedirect() {
  redirect(`${protocolForHref("/ethereum/ipor-fusion")!.subPages[0]!.href}/info`);
}
