// A wallet's Balancer V3 pool shares (components/protocol/balancer/balancer-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { BalancerWalletPositions } from "@/components/protocol/balancer/balancer-wallet-positions";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "balancer-v3",
    subject: wallet,
    canonicalPath: `/ethereum/balancer-v3/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <BalancerWalletPositions chainId={1} wallet={wallet} />;
}
