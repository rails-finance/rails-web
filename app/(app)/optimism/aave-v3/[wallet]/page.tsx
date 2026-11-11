// A wallet's Aave V3 account on Optimism (components/protocol/aave-v3-optimism/aave-v3-optimism-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { AaveV3OptimismPositionPage } from "@/components/protocol/aave-v3-optimism/aave-v3-optimism-position-page";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "aave-v3-optimism",
    subject: wallet,
    description: readAtHeadDescription,
    canonicalPath: `/optimism/aave-v3/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <AaveV3OptimismPositionPage wallet={wallet} />;
}
