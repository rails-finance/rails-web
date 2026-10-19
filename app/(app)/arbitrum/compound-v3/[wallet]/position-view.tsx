"use client";

// Every Compound V3 position one wallet holds on Arbitrum: the shared wallet
// page (components/protocol/compound/compound-wallet-page.tsx) with the
// Arbitrum deployment (lib/compound-arbitrum/page-deployment.ts).

import { CompoundWalletView, type CompoundWalletViewProps } from "@/components/protocol/compound/compound-wallet-page";
import { COMPOUND_ARBITRUM_PAGE } from "@/lib/compound-arbitrum/page-deployment";

export default function CompoundArbitrumWalletView(props: CompoundWalletViewProps) {
  return <CompoundWalletView deployment={COMPOUND_ARBITRUM_PAGE} {...props} />;
}
