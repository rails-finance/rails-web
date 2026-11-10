// A wallet's Aerodrome positions (components/protocol/aerodrome/aerodrome-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { AerodromeWalletPositions } from "@/components/protocol/aerodrome/aerodrome-wallet-positions";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "aerodrome", subject: wallet, canonicalPath: `/base/aerodrome/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <AerodromeWalletPositions wallet={wallet} />;
}
