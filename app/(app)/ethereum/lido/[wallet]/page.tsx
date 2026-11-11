// A wallet's Lido stake and withdrawal requests (components/protocol/lido/lido-stake-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { LidoStakePage } from "@/components/protocol/lido/lido-stake-page";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({
    session: "lido",
    subject: wallet,
    canonicalPath: `/ethereum/lido/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <LidoStakePage wallet={wallet} />;
}
