// A wallet's Morpho Blue positions on Arc (components/protocol/morpho-arc/morpho-arc-wallet.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { MorphoArcWallet } from "@/components/protocol/morpho-arc/morpho-arc-wallet";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "morpho-arc", subject: wallet, canonicalPath: `/arc/morpho/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <MorphoArcWallet wallet={wallet} />;
}
