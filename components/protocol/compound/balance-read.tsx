"use client";

// Whether a swept Base timeline's balances are still being read. A sweep row
// carries the amounts moved but no balance with interest (ctx.baseUnsettled);
// the page asks the index again for a while, and the rows say "reading…"
// until it answers or the page stops asking. On Arbitrum the store's rows
// carry no balance and nothing is asked again ("absent").

import { createContext, useContext, type ReactNode } from "react";

export type CompoundBalanceRead = "reading" | "unread" | "absent";

const Ctx = createContext<CompoundBalanceRead>("reading");

export function CompoundBalanceReadProvider({ value, children }: { value: CompoundBalanceRead; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompoundBalanceRead(): CompoundBalanceRead {
  return useContext(Ctx);
}

/** The words a row shows in place of an unread balance. */
export const unreadBalanceText = (state: CompoundBalanceRead): string =>
  state === "reading" ? "reading…" : state === "absent" ? "not read" : "not read, reload to try again";
