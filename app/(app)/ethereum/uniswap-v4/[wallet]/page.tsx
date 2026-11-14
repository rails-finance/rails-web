// A wallet's Uniswap V4 positions (components/protocol/uniswap/uniswap-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { UniswapWalletPositions } from "@/components/protocol/uniswap/uniswap-wallet-positions";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "uniswap-v4", subject: wallet, canonicalPath: `/ethereum/uniswap-v4/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <UniswapWalletPositions version="v4" wallet={wallet} />;
}
