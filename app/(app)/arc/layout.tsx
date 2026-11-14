import { ChainProvider } from "@/lib/shared/chain-context";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";

// Everything under /arc is Arc (5042), and this segment says so: the shared
// render layer reads the chain from context and defaults to Ethereum, so every
// explorer link under here needs the provider. The Base segment's layout
// (app/(app)/base/layout.tsx) carries the reasoning.

export default function ArcChainLayout({ children }: { children: React.ReactNode }) {
  return <ChainProvider chainId={ARC_CHAIN_ID}>{children}</ChainProvider>;
}
