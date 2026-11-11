// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — PancakeSwap V3 on Arbitrum
// (components/protocol/uniswap/uniswap-info-page.tsx).

import { infoMetadata } from "@/lib/shared/page-metadata";
import { UniswapInfoPage } from "@/components/protocol/uniswap/uniswap-info-page";

export const metadata = infoMetadata("pancakeswap-v3-arbitrum");

export default function InfoPage() {
  return <UniswapInfoPage version="v3" protocol="pancakeswap" chainId={42161} />;
}
