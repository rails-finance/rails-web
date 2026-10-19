"use client";

// Every Compound V3 position one wallet holds on Base: the shared wallet page
// (components/protocol/compound/compound-wallet-page.tsx) with the Base
// deployment (lib/compound-base/page-deployment.ts), which carries this
// page's routes and words.

import { CompoundWalletView, type CompoundWalletViewProps } from "@/components/protocol/compound/compound-wallet-page";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";

export default function CompoundBaseWalletView(props: CompoundWalletViewProps) {
  return <CompoundWalletView deployment={COMPOUND_BASE_PAGE} {...props} />;
}
