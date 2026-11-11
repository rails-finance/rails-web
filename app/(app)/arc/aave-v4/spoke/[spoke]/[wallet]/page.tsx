// One Aave V4 spoke account on Arc (components/protocol/aave-v4-arc/aave-v4-arc-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { arcSpokeBySlug } from "@/lib/aave-v4-arc/types";
import { AaveV4ArcPositionPage } from "@/components/protocol/aave-v4-arc/aave-v4-arc-position-page";

interface Props {
  params: Promise<{ spoke: string; wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke, wallet } = await params;
  return positionMetadata({
    session: "aave-v4-arc",
    subject: wallet,
    market: arcSpokeBySlug(spoke)?.name ?? spoke,
    description: readAtHeadDescription,
    canonicalPath: `/arc/aave-v4/spoke/${spoke}/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { spoke, wallet } = await params;
  return <AaveV4ArcPositionPage spoke={spoke} wallet={wallet} />;
}
