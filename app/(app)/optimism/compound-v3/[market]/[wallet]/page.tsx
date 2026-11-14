// One Comet account of a wallet on Optimism, /optimism/compound-v3/<comet>/<wallet>
// (components/protocol/compound-v3-optimism/compound-v3-optimism-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { CompoundV3OptimismPositionPage } from "@/components/protocol/compound-v3-optimism/compound-v3-optimism-position-page";
import { compoundOptimismMarketOf } from "@/lib/compound-v3-optimism/asset-catalog";
import { opcPositionHref } from "@/lib/compound-v3-optimism/types";

interface Props {
  params: Promise<{ market: string; wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, wallet } = await params;
  const m = compoundOptimismMarketOf(market);
  return positionMetadata({
    session: "compound-v3-optimism",
    subject: wallet,
    market: m?.label,
    canonicalPath: opcPositionHref(m?.key ?? market, wallet),
    description: readAtHeadDescription,
  });
}

export default async function Page({ params }: Props) {
  const { market, wallet } = await params;
  return <CompoundV3OptimismPositionPage market={market} wallet={wallet} />;
}
