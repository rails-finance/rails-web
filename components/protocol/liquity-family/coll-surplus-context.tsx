"use client";

// The page's collateral-surplus read, handed to the liquidation event card so
// its "claimable" pill can say when the surplus was claimed. The index states
// the credit at the liquidation; the claim comes from the head read
// (hooks/useLiquityCollSurplus.ts). Null outside a liquidated Trove's page.

import { createContext, useContext } from "react";
import type { CollSurplusClaim } from "@/lib/sources/chain/liquity-coll-surplus";

export interface CollSurplusState {
  /** The transaction that credited the surplus. */
  creditTx: string;
  claimed: CollSurplusClaim | null;
}

export const CollSurplusCtx = createContext<CollSurplusState | null>(null);

/** The claim that paid out the surplus this transaction credited, if any. */
export function useSurplusClaimFor(txHash: string | undefined): CollSurplusClaim | null {
  const s = useContext(CollSurplusCtx);
  if (!s || !txHash || s.creditTx.toLowerCase() !== txHash.toLowerCase()) return null;
  return s.claimed;
}
