// One Morpho Blue position on Arc (components/protocol/morpho-arc/morpho-arc-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { MorphoArcPositionPage } from "@/components/protocol/morpho-arc/morpho-arc-position-page";

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
  return <MorphoArcPositionPage wallet={wallet} market={market} />;
}
