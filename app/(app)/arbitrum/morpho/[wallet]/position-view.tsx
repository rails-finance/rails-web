"use client";

// Every Morpho Blue position one wallet holds on Arbitrum: the shared wallet
// page (components/protocol/morpho/morpho-wallet-page.tsx) with the Arbitrum
// deployment (lib/morpho-arbitrum/page-deployment.ts) and the dollar line.

import { MorphoWalletView, type MorphoWalletViewProps } from "@/components/protocol/morpho/morpho-wallet-page";
import { MorphoArbitrumUsdLine } from "@/components/protocol/morpho/morpho-arbitrum-usd-line";
import { MORPHO_ARBITRUM_PAGE } from "@/lib/morpho-arbitrum/page-deployment";

export default function MorphoArbitrumWalletView(props: Omit<MorphoWalletViewProps, "vaultNote" | "summary">) {
  return (
    <MorphoWalletView
      deployment={MORPHO_ARBITRUM_PAGE}
      vaultNote={null}
      summary={(data) => <MorphoArbitrumUsdLine data={data} />}
      {...props}
    />
  );
}
