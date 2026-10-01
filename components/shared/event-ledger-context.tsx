"use client";

// The card's ledgers by side (components/shared/event-ledger.tsx), in a separate
// module so the cell atoms (state-transition.tsx) can read them.

import { createContext, useContext, type ReactNode } from "react";
import { fmtTokens } from "@/lib/shared/flow-focus";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A card's ledgers by side, for its T2 cells. */
export interface EventLedgerSource {
  has: (side: FlowSide) => boolean;
  render: (side: FlowSide) => ReactNode;
  /** The decimals the side's ledger prints its tokens at, where it has a
   *  token sum; the closed cell states its figures at the same. */
  decimals?: (side: FlowSide) => number | null;
}
export const EventLedgerContext = createContext<EventLedgerSource | null>(null);

/** A card with no ledgers of its own whose cells still stand as one row each
 *  (label at the left, figures at the right, any sub-line under them): the
 *  Aave family's risk and liquidation cells. Provide it around them. */
export const ROW_CELLS: EventLedgerSource = { has: () => false, render: () => null };

/** The decimals the side's opened ledger prints at, for its closed cell. */
export function useLedgerDecimals(side: FlowSide): number | null {
  return useContext(EventLedgerContext)?.decimals?.(side) ?? null;
}

/** A closed cell's token figure at its ledger's decimals ("1,037.52", as the
 *  ledger prints it). Where the ledger has none, or the figure would round to
 *  zero at them, `fallback` stands. */
export function ledgerFigure(n: number, decimals: number | null, fallback: string): string {
  if (decimals == null || !Number.isFinite(n)) return fallback;
  if (n === 0) return "0";
  const text = fmtTokens(n, decimals);
  return Number(text.replace(/,/g, "")) === 0 ? fallback : text;
}
