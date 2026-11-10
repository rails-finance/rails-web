// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Aave V3 on Arbitrum. The page is the shared Aave V3 info
// component (components/protocol/aave-v3/aave-v3-info.tsx).

import { AaveV3InfoPage } from "@/components/protocol/aave-v3/aave-v3-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("aave-v3-arbitrum");

export default function InfoPage() {
  return <AaveV3InfoPage deployment="arbitrum" />;
}
