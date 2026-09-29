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
import type { ServedFolder } from "@/lib/shared/timeline-folder";

export interface MorphoNeighbours {
  /** The block of the position's latest event in an earlier block. */
  prevBlock?: number;
  /** The event kinds that run before this one in the same transaction. */
  earlierInTx: MorphoContext["eventType"][];
  /** The event just before this one, so a sentence that reads "after the
   *  previous event" can name it. `run` counts the collapsed run it closes,
   *  where it sits inside one. Absent where the order is not known. */
  prev?: { kind: MorphoContext["eventType"]; at: number; run?: number };
}

const Ctx = createContext<Map<string, MorphoNeighbours> | null>(null);

const logIndex = (id: string) => Number(id.split(":")[1] ?? 0) || 0;
const txOf = (ev: BaseActivityEvent) => ev.txHash || ev.id.split(":")[0];

type Anchor =
  | { row: true; ev: BaseActivityEvent & { context: { data: MorphoContext } } }
  | { row: false; block: number; at: number; kind: MorphoContext["eventType"] | null; count: number };
const blockOfAnchor = (a: Anchor) => (a.row ? a.ev.blockNumber : a.block);

/** `folders`: the runs the index collapsed. Their members are not rows here,
 *  but each one's last member is a previous event for the row after it. */
export function MorphoNeighboursProvider({
  events,
  folders,
  children,
}: {
  events: BaseActivityEvent[];
  folders?: readonly ServedFolder[] | null;
  children: ReactNode;
}) {
  const map = useMemo(() => {
    const rows = events
      .filter(isMorphoEvent)
      .slice()
      .sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
    const anchors: Anchor[] = [
      ...rows.map((ev) => ({ row: true as const, ev })),
      ...(folders ?? []).map((f) => ({
        row: false as const,
        block: f.lastBlock,
        at: f.lastAt,
        kind: f.kind === "liquidation" ? ("liquidation" as const) : null,
        count: f.count,
      })),
    ].sort((a, b) => blockOfAnchor(a) - blockOfAnchor(b));
    const out = new Map<string, MorphoNeighbours>();
    let lastBlock: number | undefined;
    let blockOf: number | undefined;
    let prev: Anchor | undefined;
    for (const a of anchors) {
      const block = blockOfAnchor(a);
      if (block !== blockOf) {
        lastBlock = blockOf;
        blockOf = block;
      }
      if (a.row) {
        const ev = a.ev;
        const earlierInTx = rows
          .filter((r) => txOf(r) === txOf(ev) && logIndex(r.id) < logIndex(ev.id))
          .map((r) => r.context.data.eventType);
        // A run ending in this row's block leaves the order within the block
        // unknown, and the previous event unnamed.
        const known = prev && (prev.row || prev.block < block) ? prev : undefined;
        out.set(ev.id, {
          prevBlock: lastBlock,
          earlierInTx,
          ...(known
            ? known.row
              ? { prev: { kind: known.ev.context.data.eventType, at: known.ev.timestamp } }
              : known.kind
                ? { prev: { kind: known.kind, at: known.at, run: known.count } }
                : {}
            : {}),
        });
      }
      prev = a;
    }
    return out;
  }, [events, folders]);
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

export function useMorphoNeighbours(eventId: string | undefined): MorphoNeighbours | undefined {
  const map = useContext(Ctx);
  return eventId ? map?.get(eventId) : undefined;
}
