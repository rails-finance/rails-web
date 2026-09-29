"use client";

// What an event's explanation needs from the events around it: the block of the
// position's previous event (for the borrow rate between the two), and the
// other kinds in its own transaction (a repay and a withdrawal that close a
// position together). The detail page provides it from the rows it loaded; a
// page without the provider (or an event outside those rows) gets nothing, and
// the explanation leaves those sentences out.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BaseActivityEvent, MorphoContext } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";

export interface MorphoNeighbours {
  /** The block of the position's latest event in an earlier block. */
  prevBlock?: number;
  /** The event kinds that run before this one in the same transaction. */
  earlierInTx: MorphoContext["eventType"][];
}

const Ctx = createContext<Map<string, MorphoNeighbours> | null>(null);

const logIndex = (id: string) => Number(id.split(":")[1] ?? 0) || 0;
const txOf = (ev: BaseActivityEvent) => ev.txHash || ev.id.split(":")[0];

export function MorphoNeighboursProvider({ events, children }: { events: BaseActivityEvent[]; children: ReactNode }) {
  const map = useMemo(() => {
    const rows = events
      .filter(isMorphoEvent)
      .slice()
      .sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
    const out = new Map<string, MorphoNeighbours>();
    let lastBlock: number | undefined;
    let blockOf: number | undefined;
    for (let i = 0; i < rows.length; i++) {
      const ev = rows[i];
      if (ev.blockNumber !== blockOf) {
        lastBlock = blockOf;
        blockOf = ev.blockNumber;
      }
      const earlierInTx = rows
        .slice(0, i)
        .filter((r) => txOf(r) === txOf(ev))
        .map((r) => r.context.data.eventType);
      out.set(ev.id, { prevBlock: lastBlock, earlierInTx });
    }
    return out;
  }, [events]);
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

export function useMorphoNeighbours(eventId: string | undefined): MorphoNeighbours | undefined {
  const map = useContext(Ctx);
  return eventId ? map?.get(eventId) : undefined;
}
