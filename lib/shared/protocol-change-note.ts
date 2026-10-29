// Protocol changes in the event history (rails-ops TO-DO-ui-jobs 448; Miles,
// 29 Oct 2026). A change the protocol made for every position (a collateral
// factor, a liquidation discount, a rate policy) is drawn on the Lifetime
// flows events row as a pink diamond (reference/lifetime-price-chart.md,
// ruling 10); the same list, from the same model, stands in the history as
// rows in the market-note format (components/shared/note-row-shell.tsx) with
// a spine glyph of their own.
//
// A change is not an event of the account's: like a market note it is placed
// between two of the account's events by block (`anchorMarketNotes`) and kept
// out of every count, filter and export the page takes from its events. The
// changes in one gap stand as one row, its lines by day as the events row's
// tip lists them.
//
// A change a rate note already states takes no row (ui-jobs 449; Miles,
// 29 Oct 2026): Maker's stability fee sets and Polaris's primary-rate sets
// inside a rate note's stretch are left out of the rows, their diamonds kept,
// and a gap whose changes are all stated draws none (`statingNote`).
//
// Pure: no DOM, no fetch.

import type { FlowChange, NotedQuantity } from "@/lib/shared/flows-changes";
import type { MarketNote } from "@/lib/shared/market-note";

/** One protocol change as a row the history can place. */
export interface ProtocolChangeNote {
  kind: "protocol-change";
  /** `protocol-change:<block>:<n>`, n its place among the block's changes. */
  id: string;
  change: FlowChange;
  /** Its place in the life's list, which orders a block's changes. */
  seq: number;
  /** Where placement reads it: the change's block and time. */
  to: { block: number; timestamp: number };
  anchorEventId?: string;
}

/** The changes in one gap of the history (between two of the account's
 *  events, or above the newest), as one row: a day's changes together, the
 *  days newest first as the list reads. */
export interface ProtocolChangeGroup {
  group: "protocol-changes";
  /** `protocol-changes:` and the newest member's id. */
  id: string;
  days: { day: number; notes: ProtocolChangeNote[] }[];
}

export const isProtocolChangeNote = (x: unknown): x is ProtocolChangeNote =>
  (x as ProtocolChangeNote | null)?.kind === "protocol-change";

export const isProtocolChangeGroup = (x: unknown): x is ProtocolChangeGroup =>
  (x as ProtocolChangeGroup | null)?.group === "protocol-changes";

/** The life's changes as rows to place. */
export function protocolChangeNotes(changes: readonly FlowChange[]): ProtocolChangeNote[] {
  const seen = new Map<number, number>();
  return changes.map((change, seq) => {
    const n = seen.get(change.block) ?? 0;
    seen.set(change.block, n + 1);
    return {
      kind: "protocol-change",
      id: `protocol-change:${change.block}:${n}`,
      change,
      seq,
      to: { block: change.block, timestamp: change.ts },
    };
  });
}

/** A gap's changes as one row, `notes` in the gap's order (newest first);
 *  each day's changes in the life's order. */
export function protocolChangeGroup(notes: readonly ProtocolChangeNote[]): ProtocolChangeGroup {
  const days: ProtocolChangeGroup["days"] = [];
  for (const note of notes) {
    const last = days[days.length - 1];
    if (last && last.day === note.change.day) last.notes.push(note);
    else days.push({ day: note.change.day, notes: [note] });
  }
  for (const d of days) d.notes.sort((a, b) => a.seq - b.seq);
  return { group: "protocol-changes", id: `protocol-changes:${notes[0].id}`, days };
}

/** The quantity a market note states, as a change names it in `noted`: a
 *  Maker rate step states the ilk's stability fee, a Polaris rate step the
 *  market's primary rate. Null for a note no change records (an Aave-family
 *  reserve rate, a PSM gap, a vault's terms). */
export function noteQuantity(note: MarketNote): NotedQuantity | null {
  if (note.kind !== "rate-step") return null;
  if (note.protocol === "makerdao") return "makerdao:stability-fee";
  return note.protocol == null ? "polaris:primary-rate" : null;
}

/** The note that states a change: one of its quantity whose stretch holds the
 *  change's block, after its earlier end and at or before its later (a live
 *  note's later end is the head). Undefined where none does, and the change
 *  takes a row. */
export function statingNote(change: FlowChange, notes: readonly MarketNote[]): MarketNote | undefined {
  if (!change.noted) return undefined;
  return notes.find(
    (n) => noteQuantity(n) === change.noted && n.from.block < change.block && change.block <= n.to.block,
  );
}
