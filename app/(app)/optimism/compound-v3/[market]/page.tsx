// A wallet's Compound V3 accounts on Optimism, /optimism/compound-v3/<wallet>
// (components/protocol/compound-v3-optimism/compound-v3-optimism-wallet.tsx).
// Next names one dynamic segment per level, so this level's segment is
// `[market]` for the Comet pages beneath it (`[market]/[wallet]`), and here it
// holds the wallet, as on Arbitrum.

import type { Metadata } from "next";
import { positionMetadata, shortSubject } from "@/lib/shared/page-metadata";
import { CompoundV3OptimismWallet } from "@/components/protocol/compound-v3-optimism/compound-v3-optimism-wallet";
import { opcWalletHref } from "@/lib/compound-v3-optimism/types";

interface Props {
  params: Promise<{ market: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: wallet } = await params;
  const base = positionMetadata({
    session: "compound-v3-optimism",
    subject: wallet,
    canonicalPath: opcWalletHref(wallet),
  });
  const title = `Compound V3 on Optimism wallet ${shortSubject(wallet)}`;
  const description =
    "Every Compound V3 market on Optimism this wallet holds a balance in, read from the Comets when the page opens.";
  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title: `Rails | ${title}`, description },
    twitter: { ...base.twitter, title: `Rails | ${title}`, description },
  };
}

export default async function Page({ params }: Props) {
  const { market: wallet } = await params;
  return <CompoundV3OptimismWallet wallet={wallet} />;
}
