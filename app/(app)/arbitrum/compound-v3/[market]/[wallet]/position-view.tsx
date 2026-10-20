"use client";

// One Compound V3 position on Arbitrum, a (Comet, wallet) pair: the shared
// wallet page (components/protocol/compound/compound-wallet-page.tsx) with the
// Arbitrum deployment (lib/compound-arbitrum/page-deployment.ts), held to the
// one market by its `market` prop (rails-ops reference/arbitrum-position-first-lane.md).

import { CompoundWalletView, type CompoundWalletViewProps } from "@/components/protocol/compound/compound-wallet-page";
import { COMPOUND_ARBITRUM_PAGE } from "@/lib/compound-arbitrum/page-deployment";

export default function CompoundArbitrumMarketView(props: CompoundWalletViewProps & { market: string }) {
  return <CompoundWalletView deployment={COMPOUND_ARBITRUM_PAGE} {...props} />;
}
