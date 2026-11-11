// One pair's Uniswap V3 pools on Optimism (components/protocol/uniswap/uniswap-pair-page.tsx).

import type { Metadata } from "next";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { UniswapPairPage } from "@/components/protocol/uniswap/uniswap-pair-page";

interface Props {
  params: Promise<{ pair: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  return listingMetadata({
    title: `Uniswap V3 on Optimism: ${pair}`,
    canonicalPath: `/optimism/uniswap-v3/pairs/${pair}`,
  });
}

export default async function Page({ params }: Props) {
  const { pair } = await params;
  return <UniswapPairPage version="v3" protocol="uniswap" chainId={10} pair={pair} />;
}
