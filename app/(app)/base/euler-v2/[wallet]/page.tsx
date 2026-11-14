// A wallet's Euler V2 accounts on Base (components/protocol/euler/euler-wallet-accounts.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { EulerWalletAccounts } from "@/components/protocol/euler/euler-wallet-accounts";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "euler-v2-base", subject: wallet, canonicalPath: `/base/euler-v2/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  return <EulerWalletAccounts chain={8453} wallet={wallet} />;
}
