// One Morpho Blue position on Arc (components/protocol/morpho-at-block/morpho-at-block-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { MorphoAtBlockPositionPage } from "@/components/protocol/morpho-at-block/morpho-at-block-position-page";
import { MORPHO_ARC } from "@/lib/morpho-at-block/types";

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  return positionMetadata({
    session: "morpho-arc",
    subject: wallet,
    market: `${market.slice(0, 10)}…`,
    canonicalPath: `/arc/morpho/${wallet}/${market}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet, market } = await params;
  return <MorphoAtBlockPositionPage dep={MORPHO_ARC} wallet={wallet} market={market} />;
}
