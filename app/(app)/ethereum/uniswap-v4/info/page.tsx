// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Uniswap V4 on Ethereum
// (components/protocol/uniswap/uniswap-info-page.tsx).

import { infoMetadata } from "@/lib/shared/page-metadata";
import { UniswapInfoPage } from "@/components/protocol/uniswap/uniswap-info-page";

export const metadata = infoMetadata("uniswap-v4");

export default function InfoPage() {
  return <UniswapInfoPage version="v4" />;
}
