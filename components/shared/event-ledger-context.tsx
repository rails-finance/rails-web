"use client";

// The card's ledgers by side (components/shared/event-ledger.tsx), in a separate
// module so the cell atoms (state-transition.tsx) can read them.

import { createContext, useContext, type ReactNode } from "react";
import { withCollDecimals } from "@/lib/shared/coll-figure";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A card's ledgers by side, for its T2 cells. */
export interface EventLedgerSource {
  has: (side: FlowSide) => boolean;
  render: (side: FlowSide) => ReactNode;
  /** The decimals the side's ledger prints its tokens at, where it has a
   *  token sum; the closed cell states its figures at the same. */
  decimals?: (side: FlowSide) => number | null;
  /** The ledgers are still on their way: a ledger cell stands as a placeholder
   *  row (event-ledger.tsx `T2Skeleton`) until they land. */
  pending?: boolean;
}
export const EventLedgerContext = createContext<EventLedgerSource | null>(null);

/** A card with no ledgers of its own whose cells still stand as one row each
 *  (label at the left, figures at the right, any sub-line under them): the
 *  Aave family's risk and liquidation cells. Provide it around them. */
export const ROW_CELLS: EventLedgerSource = { has: () => false, render: () => null };

/** A card whose ledgers have not landed: its cells stand as full-width
 *  placeholder rows, and its stat cells as rows beside them. */
export const LEDGER_PENDING: EventLedgerSource = { has: () => false, render: () => null, pending: true };

/** The decimals the side's opened ledger prints at, for its closed cell. */
export function useLedgerDecimals(side: FlowSide): number | null {
  return useContext(EventLedgerContext)?.decimals?.(side) ?? null;
}

export { ledgerFigure } from "@/lib/shared/coll-figure";

/** Build prose (a thunk) with this card's collateral decimals in force, so its
 *  collateral figures read as the T2 cells and the ledger do. */
export function InLedgerFigures({ build }: { build: () => ReactNode }) {
  const dec = useLedgerDecimals("collateral");
  return <>{withCollDecimals(dec, build)}</>;
}

/** The same, for a component that composes the prose itself. */
export function useCollFigures(): <T>(build: () => T) => T {
  const dec = useLedgerDecimals("collateral");
  return (build) => withCollDecimals(dec, build);
}
