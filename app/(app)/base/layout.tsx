import { ChainProvider } from "@/lib/shared/chain-context";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

// Everything under /base is Base (8453), and it is this segment that says so.
// ----------------------------------------------------------------------------
// The shared render layer — LinkedAddress, EventCardFooter, the provenance
// receipt — reads the chain from context and DEFAULTS TO ETHEREUM. Before the
// chain lived in the path, each Base explorer had to remember to wrap itself,
// and three shipped without doing so: every "verify it yourself" link under
// them pointed a reader at Etherscan for a Base address, which is a receipt
// that cannot be followed. Nothing about the rendered page looked wrong.
//
// Here the provider is a property of the segment, so a new Base explorer gets
// it by being at a /base/… route. That is the whole reason the chain is a path
// segment rather than a hostname — see rails-ops
// `decisions/0016-path-scoped-chain-routes.md`.
//
// The Ethereum sibling deliberately mounts NO provider: chain 1 is the context
// default, so the L1 pages render byte-identical Etherscan hrefs either way,
// and leaving the default unstated keeps that equivalence obvious.

export default function BaseChainLayout({ children }: { children: React.ReactNode }) {
  return <ChainProvider chainId={BASE_CHAIN_ID}>{children}</ChainProvider>;
}
