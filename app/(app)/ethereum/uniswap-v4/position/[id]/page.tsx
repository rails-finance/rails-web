// One Uniswap V4 position (components/protocol/uniswap/uniswap-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { UniswapPositionPage, uniswapTabMarket } from "@/components/protocol/uniswap/uniswap-position-page";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return positionMetadata({
    session: "uniswap-v4",
    subject: id,
    // The pair off the read the page makes (the same `cache()` entry).
    market: await uniswapTabMarket("v4", id, "uniswap", 1),
    canonicalPath: `/ethereum/uniswap-v4/position/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <UniswapPositionPage version="v4" id={id} />;
}
