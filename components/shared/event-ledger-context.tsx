"use client";

// The card's ledgers by side (components/shared/event-ledger.tsx), in a separate
// module so the cell atoms (state-transition.tsx) can read them.

import { createContext, type ReactNode } from "react";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A card's ledgers by side, for its T2 cells. */
export interface EventLedgerSource {
  has: (side: FlowSide) => boolean;
  render: (side: FlowSide) => ReactNode;
}
export const EventLedgerContext = createContext<EventLedgerSource | null>(null);
