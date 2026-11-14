// A wallet's Velodrome positions on Optimism (components/protocol/aerodrome/aerodrome-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { AerodromeWalletPositions } from "@/components/protocol/aerodrome/aerodrome-wallet-positions";
import { VELODROME } from "@/lib/aerodrome/sites";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "velodrome", subject: wallet, canonicalPath: `/optimism/velodrome/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <AerodromeWalletPositions wallet={wallet} site={VELODROME} />;
}
