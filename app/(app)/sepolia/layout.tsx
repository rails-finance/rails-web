import { ChainProvider } from "@/lib/shared/chain-context";
import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

// Everything under /sepolia is Sepolia (11155111), and it is this segment that
// says so. The shared render layer — LinkedAddress, EventCardFooter, the
// provenance receipt — reads the chain from context and DEFAULTS TO ETHEREUM;
// without this provider every "verify it yourself" link under a Sepolia
// explorer would point at mainnet Etherscan for a Sepolia transaction, a
// receipt that cannot be followed. The provider is a property of the segment,
// so a Sepolia explorer gets it by living at a /sepolia/… route — see
// rails-ops `decisions/0016-path-scoped-chain-routes.md` and the Base sibling.

export default function SepoliaChainLayout({ children }: { children: React.ReactNode }) {
  return <ChainProvider chainId={SEPOLIA_CHAIN_ID}>{children}</ChainProvider>;
}
