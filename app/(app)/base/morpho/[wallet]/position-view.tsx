"use client";

// Every Morpho Blue position one wallet holds on Base: the shared wallet page
// (components/protocol/morpho/morpho-wallet-page.tsx) with the Base deployment
// (lib/morpho-base/page-deployment.ts).

import { MorphoWalletView, type MorphoWalletViewProps } from "@/components/protocol/morpho/morpho-wallet-page";
import { MORPHO_BASE_PAGE } from "@/lib/morpho-base/page-deployment";

export default function MorphoBaseWalletView(props: MorphoWalletViewProps) {
  return <MorphoWalletView deployment={MORPHO_BASE_PAGE} {...props} />;
}
