"use client";

// Each Lifetime flows row's collateral price and where it came from, by event
// id (lib/makerdao/flows.ts `replayMaker`), so an event cell that values its
// collateral at the ledger's price names that price's read and blocks
// (ui-jobs 743). Maker's own: the shared flow focus carries no price reads.

import { createContext, useContext } from "react";
import type { MakerRowPrice } from "./price-notes";

export type MakerFlowPrices = ReadonlyMap<string, { price: number; at: MakerRowPrice }>;

export const MakerFlowPricesContext = createContext<MakerFlowPrices | null>(null);

export const useMakerFlowPrice = (eventId: string) => useContext(MakerFlowPricesContext)?.get(eventId) ?? null;
