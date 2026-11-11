// One Uniswap V4 position on Arbitrum (components/protocol/uniswap/uniswap-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { UniswapPositionPage } from "@/components/protocol/uniswap/uniswap-position-page";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return positionMetadata({
    session: "uniswap-v4-arbitrum",
    subject: id,
    canonicalPath: `/arbitrum/uniswap-v4/position/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <UniswapPositionPage version="v4" protocol="uniswap" chainId={42161} id={id} />;
}
