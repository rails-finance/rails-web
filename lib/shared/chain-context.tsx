"use client";

// Which chain is the surrounding route group about?
// ----------------------------------------------------------------------------
// The shared render components — LinkedAddress, EventCardFooter, the provenance
// receipt — are used by every protocol, so they cannot take a chain prop
// without threading one through a dozen call layers that have no opinion on it.
// They read it from context instead.
//
// The default is chain 1 AND THERE IS NO PROVIDER ON THE L1 ROUTES. That is the
// safety property: every existing page renders through `useChainId() === 1` and
// produces byte-identical Etherscan hrefs. Only a route group that explicitly
// wraps itself in <ChainProvider chainId={8453}> — today just basedollar —
// sees anything different.

import { createContext, useContext, type ReactNode } from "react";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

const ChainContext = createContext<ChainId>(MAINNET_CHAIN_ID);

export function ChainProvider({ chainId, children }: { chainId: ChainId; children: ReactNode }) {
  return <ChainContext.Provider value={chainId}>{children}</ChainContext.Provider>;
}

/** The active chain, defaulting to Ethereum outside any provider. */
export function useChainId(): ChainId {
  return useContext(ChainContext);
}
