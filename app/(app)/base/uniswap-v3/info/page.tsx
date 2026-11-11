// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Uniswap V3 on Base
// (components/protocol/uniswap/uniswap-info-page.tsx).

import { infoMetadata } from "@/lib/shared/page-metadata";
import { UniswapInfoPage } from "@/components/protocol/uniswap/uniswap-info-page";

export const metadata = infoMetadata("uniswap-v3-base");

export default function InfoPage() {
  return <UniswapInfoPage version="v3" protocol="uniswap" chainId={8453} />;
}
