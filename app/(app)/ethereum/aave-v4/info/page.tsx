// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Aave V4 on Ethereum. The page is the shared Aave V4
// info component (components/protocol/aave-v4/aave-v4-info.tsx).

import { AaveV4InfoPage } from "@/components/protocol/aave-v4/aave-v4-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("aave-v4");

export default function InfoPage() {
  return <AaveV4InfoPage deployment="ethereum" />;
}
