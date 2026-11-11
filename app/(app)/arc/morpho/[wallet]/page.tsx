// A wallet's Morpho Blue positions on Arc (components/protocol/morpho-at-block/morpho-at-block-wallet.tsx).

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { MorphoAtBlockWallet } from "@/components/protocol/morpho-at-block/morpho-at-block-wallet";
import { MORPHO_ARC } from "@/lib/morpho-at-block/types";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "morpho-arc",
    subject: wallet,
    description: readAtHeadDescription,
    canonicalPath: `/arc/morpho/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <MorphoAtBlockWallet dep={MORPHO_ARC} wallet={wallet} />;
}
