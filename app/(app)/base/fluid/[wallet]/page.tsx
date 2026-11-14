// A wallet's Fluid positions on Base (components/protocol/fluid-base/fluid-base-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { FluidBaseWalletPositions } from "@/components/protocol/fluid-base/fluid-base-wallet-positions";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "fluid-base", subject: wallet, canonicalPath: `/base/fluid/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <FluidBaseWalletPositions wallet={wallet} />;
}
