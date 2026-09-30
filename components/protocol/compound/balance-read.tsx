"use client";

// Whether a swept Base timeline's balances are still being read. A sweep row
// carries the amounts moved but no balance with interest (ctx.baseUnsettled);
// the page asks the index again for a while, and the rows say "reading…"
// until it answers or the page stops asking.

import { createContext, useContext, type ReactNode } from "react";

export type CompoundBalanceRead = "reading" | "unread";

const Ctx = createContext<CompoundBalanceRead>("reading");

export function CompoundBalanceReadProvider({ value, children }: { value: CompoundBalanceRead; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompoundBalanceRead(): CompoundBalanceRead {
  return useContext(Ctx);
}

/** The words a row shows in place of an unread balance. */
export const unreadBalanceText = (state: CompoundBalanceRead): string =>
  state === "reading" ? "reading…" : "not read, reload to try again";
