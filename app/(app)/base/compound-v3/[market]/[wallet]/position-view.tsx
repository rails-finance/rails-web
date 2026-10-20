"use client";

// One Compound V3 position on Base, a (Comet, wallet) pair: the shared wallet
// page (components/protocol/compound/compound-wallet-page.tsx) with the Base
// deployment (lib/compound-base/page-deployment.ts), held to the one market
// by its `market` prop.

import { CompoundWalletView, type CompoundWalletViewProps } from "@/components/protocol/compound/compound-wallet-page";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";

export default function CompoundBaseMarketView(props: CompoundWalletViewProps & { market: string }) {
  return <CompoundWalletView deployment={COMPOUND_BASE_PAGE} {...props} />;
}
