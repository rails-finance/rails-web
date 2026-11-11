// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer: Euler V2 on Arbitrum (components/protocol/euler/euler-info.tsx).
// Unlaunched with the explorer: infoMetadata adds noindex and the root layout's
// strip covers this route.

import { infoMetadata } from "@/lib/shared/page-metadata";
import { EulerInfoPage } from "@/components/protocol/euler/euler-info";

export const metadata = infoMetadata("euler-v2-arbitrum");

export default function InfoPage() {
  return <EulerInfoPage chain={42161} />;
}
