// A wallet's Aave V4 accounts on Arc (components/protocol/aave-v4-arc/aave-v4-arc-wallet.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { AaveV4ArcWallet } from "@/components/protocol/aave-v4-arc/aave-v4-arc-wallet";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "aave-v4-arc",
    subject: wallet,
    description: readAtHeadDescription,
    canonicalPath: `/arc/aave-v4/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <AaveV4ArcWallet wallet={wallet} />;
}
