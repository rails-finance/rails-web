import { ChainProvider } from "@/lib/shared/chain-context";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";

// Everything under /optimism is OP Mainnet (10), and this segment says so: the shared
// render layer reads the chain from context and defaults to Ethereum, so every
// explorer link under here needs the provider. The Base segment's layout
// (app/(app)/base/layout.tsx) carries the reasoning.

export default function OptimismChainLayout({ children }: { children: React.ReactNode }) {
  return <ChainProvider chainId={OPTIMISM_CHAIN_ID}>{children}</ChainProvider>;
}
