// One Morpho Blue position on Arc (components/protocol/morpho-at-block/morpho-at-block-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import {
  MorphoAtBlockPositionPage,
  morphoAtBlockTabMarket,
} from "@/components/protocol/morpho-at-block/morpho-at-block-position-page";
import { MORPHO_ARC } from "@/lib/morpho-at-block/types";

interface Props {
  params: Promise<{ wallet: string; market: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet, market } = await params;
  return positionMetadata({
    session: "morpho-arc",
    description: readAtHeadDescription,
    subject: wallet,
    // The pair off the read the page makes (the same `cache()` entry).
    market: await morphoAtBlockTabMarket(MORPHO_ARC, market, wallet),
    canonicalPath: `/arc/morpho/${wallet}/${market}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet, market } = await params;
  return <MorphoAtBlockPositionPage dep={MORPHO_ARC} wallet={wallet} market={market} />;
}
