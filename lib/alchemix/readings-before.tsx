"use client";

// The reading BEFORE each block on an Alchemist position's timeline, so a card
// can state before → after on debt, collateral and set-aside.
// ----------------------------------------------------------------------------
// Every block where debt or collateral can step carries a `getCDP` reading, and
// the timeline carries every one of those blocks inside the position's life:
// its own axis-moving events and every line redemption in its window (rails-ops
// decisions/0032, "The read state at each event belongs to the block"). So the
// stated reading of the previous such block on the timeline is the position's
// debt and collateral right up to this block. That is two readings side by side,
// never an accumulation of events.
//
// SET-ASIDE IS THE EXCEPTION, and the card says so on the figure: it grows
// block by block between readings, so its "before" is the figure at the
// earlier block, named on its receipt, and the move includes that growth.
//
// A windowed timeline has no before for its oldest loaded block. A custody
// transfer with no reading is skipped: it moved neither axis.

import { createContext, useContext } from "react";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";

export interface AlchemixReading {
  blockNumber: number;
  debtRaw: string | null;
  collateralRaw: string | null;
  earmarkedRaw: string | null;
}

/** Block number → the stated reading at the previous reading block on the
 *  timeline. Blocks with no earlier reading are absent. */
export type AlchemixReadingsBefore = Map<number, AlchemixReading>;

export function readingsBefore(events: AlchemistEvent[]): AlchemixReadingsBefore {
  const byBlock = new Map<number, AlchemixReading>();
  for (const e of events) {
    const s = e.context.data.stateAtBlockFromReading;
    if (s?.status !== "stated" || s.blockNumber == null) continue;
    if (!byBlock.has(s.blockNumber)) {
      byBlock.set(s.blockNumber, {
        blockNumber: s.blockNumber,
        debtRaw: s.debtRaw,
        collateralRaw: s.collateralRaw,
        earmarkedRaw: s.earmarkedRaw,
      });
    }
  }
  const blocks = [...byBlock.keys()].sort((a, b) => a - b);
  const out: AlchemixReadingsBefore = new Map();
  for (let i = 1; i < blocks.length; i++) out.set(blocks[i], byBlock.get(blocks[i - 1])!);
  return out;
}

export const AlchemixReadingsBeforeContext = createContext<AlchemixReadingsBefore | null>(null);

export function useReadingBefore(block: number | null | undefined): AlchemixReading | null {
  const map = useContext(AlchemixReadingsBeforeContext);
  if (!map || block == null) return null;
  return map.get(block) ?? null;
}

/** What one redemption took from this position's collateral, in MYT share wei.
 *  Stated only where the reading before it is the one its cleared debt was
 *  measured from, so debt and collateral always span the same two blocks. */
export function collateralTakenRaw(event: AlchemistEvent, before: AlchemixReading | null): string | null {
  const ctx = event.context.data;
  const cleared = ctx.debtClearedFromReadings;
  const at = ctx.stateAtBlockFromReading;
  if (ctx.eventType !== "redemption" || cleared?.status !== "stated" || cleared.fromBlock == null) return null;
  if (!before || before.blockNumber !== cleared.fromBlock || before.collateralRaw == null) return null;
  if (at?.status !== "stated" || at.collateralRaw == null) return null;
  const taken = BigInt(before.collateralRaw) - BigInt(at.collateralRaw);
  // One wei either way is the getCDP rounding the sweep records; it is not a
  // movement of collateral.
  if (taken <= BigInt(1)) return "0";
  return taken.toString();
}
