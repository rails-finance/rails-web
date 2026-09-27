"use client";

// The tokens a rendered event (or collapsed run) names whose `decimals` did not
// load, handed down to the shared row pieces through context. The timeline
// provides it around every card and run it renders (chain-truth-timeline.tsx),
// so ChainTruthRow, ChainTruthDetail, SpineColumn, TimelineRunCard and
// EventCard state "Not loaded" for such a token without each protocol's card
// mapping it: they match a figure's token by the address or symbol it already
// carries (lib/shared/decimals-unread.ts `unreadToken`).

import { createContext, useContext, type ReactNode } from "react";
import type { UnreadToken } from "@/lib/shared/types/event-shape";
import { unreadToken } from "@/lib/shared/decimals-unread";

const UnreadTokensContext = createContext<UnreadToken[] | undefined>(undefined);

export function UnreadTokensProvider({ tokens, children }: { tokens: UnreadToken[] | undefined; children: ReactNode }) {
  return (
    <UnreadTokensContext.Provider value={tokens?.length ? tokens : undefined}>{children}</UnreadTokensContext.Provider>
  );
}

/** Every unread token in scope; undefined when every token loaded. */
export function useUnreadTokens(): UnreadToken[] | undefined {
  return useContext(UnreadTokensContext);
}

/** A resolver for the unread token a figure names by address or symbol. */
export function useUnreadTokenOf(): (address?: string | null, symbol?: string | null) => UnreadToken | undefined {
  const tokens = useContext(UnreadTokensContext);
  return (address, symbol) => {
    if (!tokens) return undefined;
    const e = { decimalsUnread: tokens };
    // An address, where the figure carries one, decides alone: two tokens can
    // share a symbol.
    if (address) return tokens.find((t) => t.address === address.toLowerCase());
    return symbol ? unreadToken(e, symbol) : undefined;
  };
}
