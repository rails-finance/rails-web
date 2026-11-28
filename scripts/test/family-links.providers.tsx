// The providers family-links.render.mjs wraps its cases in, imported from a
// .tsx file so each is the module instance the components read (as
// shared-links.providers.tsx notes).
import type { ReactNode } from "react";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { ChainProvider } from "@/lib/shared/chain-context";
import type { ChainId } from "@/lib/shared/chains";

const SHELL = {
  contract: {
    heading: "Event",
    title: "head" as const,
    facts: [],
    n: 1,
    total: 1,
    blockNumber: 21000000,
    txHash: "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
    eventId: "e",
    previousHref: null,
    nextHref: null,
    timelineHref: "/",
    description: "",
  },
  title: "Event",
  timestamp: 1730000000,
};

/** An event card drawn as its event page draws it: open, its cells shown. */
export const OnEventPage = ({ children }: { children: ReactNode }) => (
  <EventPageContext.Provider value={SHELL}>{children}</EventPageContext.Provider>
);

export const OnChain = ({ chainId, children }: { chainId: ChainId; children: ReactNode }) => (
  <ChainProvider chainId={chainId}>{children}</ChainProvider>
);
