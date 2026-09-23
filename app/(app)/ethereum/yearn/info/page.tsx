// The explorer's about page — /ethereum/yearn/info, the (i) in the rail.
// ----------------------------------------------------------------------------
// Every explorer's rail carries an (i) at `<href>/info`, and this explorer's
// whole product is the one vault layer: how it is built, in words, is the
// layer's own about page a segment along. So this route is that page's door
// rather than a second copy of it — 0028 gives a page one address. Same shape
// as /ethereum/aave/info, for the same reason.
//
// It stops being a redirect the day this explorer gains a second sub-page and
// has something of its own to say above them both.

import { redirect } from "next/navigation";
import { protocolForHref } from "@/lib/shared/protocols";

export default function YearnInfoRedirect() {
  redirect(`${protocolForHref("/ethereum/yearn")!.subPages[0].href}/info`);
}
