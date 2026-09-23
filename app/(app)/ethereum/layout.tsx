// Everything under /ethereum is chain 1.
//
// No ChainProvider on purpose. `useChainId()` defaults to Ethereum, so these
// pages render exactly the Etherscan hrefs they rendered before the chain
// became a path segment — mounting a provider that restates the default would
// only make that equivalence harder to see. The Base sibling
// (`app/(app)/base/layout.tsx`) is where the chain is actually declared, and
// its header says why the declaration belongs to the segment.
//
// This layout exists to hold that explanation, and so the two chain segments
// are visibly symmetrical rather than one of them being an absence.

export default function EthereumChainLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
