// The providers shared-links.render.mjs wraps its cases in, imported from a
// .tsx file so each is the module instance the components read (an .mjs
// import loads a second copy under tsx, as kind-rings.sepolia.tsx notes).
import type { ReactNode } from "react";
import { ChainProvider } from "@/lib/shared/chain-context";
import type { ChainId } from "@/lib/shared/chains";
import { TimelineDisplayContext, useTimelineDisplay } from "@/components/shared/timeline-display-context";

export const OnChain = ({ chainId, children }: { chainId: ChainId; children: ReactNode }) => (
  <ChainProvider chainId={chainId}>{children}</ChainProvider>
);

/** Display's "Transaction hashes" switched on. */
export function WithTxHashes({ children }: { children: ReactNode }) {
  const d = useTimelineDisplay();
  return (
    <TimelineDisplayContext.Provider value={{ ...d, showTxHashes: true }}>{children}</TimelineDisplayContext.Provider>
  );
}
