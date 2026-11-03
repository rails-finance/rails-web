// A head read rails-server made, as a receipt states it.
// ----------------------------------------------------------------------------
// The head routes (`/api/at-block/aave-v3/position`, `/compound/position`,
// `/morpho/position`, …) answer with `head`: the block's time, when
// rails-server read it and the leg that answered. A receipt over such an
// answer names the block for "@ head" and ends its via line with the time of
// the read: "@ block 26,311,357 · read at 07:51:02 UTC". Who read it and
// through which leg stay out of the receipt (rails-ops
// standards/provenance-receipts-grammar.md §3). A receipt over a read the web
// made itself keeps "@ head". A figure computed over the stored snapshot
// (lib/sources/api/head-snapshot.ts) says so: "@ block N · stored read, taken
// 2026-11-01 07:51:02 UTC, because the latest read failed".

import type { Provenance } from "@/components/shared/provenance";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";

/** rails-server's head read and the block it read at; `stored` when the
 *  figure came from its stored snapshot because the latest read failed. */
export type ServerRead = PositionHeadStamp & { block: number; stored?: true };

/** rails-server's stored snapshot a figure was computed over
 *  (`GET /api/at-block/head/snapshot`). */
export interface StoredHeadRead {
  blockNumber: number;
  blockTimestamp: number | null;
  readAt: string;
  provider: string;
}

/** Who answered a head read: rails-server live, rails-server's stored
 *  snapshot, or the web's own chain read. */
export type HeadReadSource = "rails-server" | "rails-server-stored" | "chain";

/** The stamp of a loader's answer: its stored snapshot, else rails-server's
 *  live read at `block`; undefined where the web read the chain. */
export function headReadOf(
  head: PositionHeadStamp | null | undefined,
  block: number | null | undefined,
  stored?: StoredHeadRead | null,
): ServerRead | undefined {
  if (stored)
    return {
      blockTime: stored.blockTimestamp ?? 0,
      readAt: stored.readAt,
      provider: stored.provider,
      block: stored.blockNumber,
      stored: true,
    };
  return serverReadAt(head, block);
}

export const headReadSource = (readBy: ServerRead | null | undefined): HeadReadSource =>
  !readBy ? "chain" : readBy.stored ? "rails-server-stored" : "rails-server";

/** The read stamp of an answer that carries one; undefined on a web chain read. */
export function serverReadOf(
  answer: { head?: PositionHeadStamp; blockNumber: number } | null | undefined,
): ServerRead | undefined {
  return answer?.head ? { ...answer.head, block: answer.blockNumber } : undefined;
}

/** The stamp and block of a reader that read through rails-server's head routes
 *  (`lib/sources/api/server-head-stamps.ts`); undefined where any read went to the chain. */
export function serverReadAt(
  head: PositionHeadStamp | null | undefined,
  block: number | null | undefined,
): ServerRead | undefined {
  return head && block != null ? { ...head, block } : undefined;
}

/** The via line's tail for a read rails-server made: when it was read, and
 *  for a stored read that the latest read failed. Empty where the web read the chain. */
export function serverReadVia(readBy?: (PositionHeadStamp & { stored?: true }) | null): string {
  if (!readBy) return "";
  if (readBy.stored)
    return ` · stored read, taken ${readBy.readAt.slice(0, 10)} ${readBy.readAt.slice(11, 19)} UTC, because the latest read failed`;
  return ` · read at ${readBy.readAt.slice(11, 19)} UTC`;
}

/** A receipt over rails-server's read: "@ head" or "at head" in the via line and the
 *  inputs' notes becomes the block, and the via line names the read. */
export function stampServerRead(p: Provenance, readBy?: ServerRead | null): Provenance {
  if (!readBy) return p;
  const at = `@ block ${readBy.block.toLocaleString("en-US")}`;
  const name = (t: string) => t.replace(/(?:@|\bat) head\b|\bat the block\b|@ the pinned block/g, at);
  // A via line that names no head ("Vat.ilks(ilk).rate (live)") gains the block.
  const viaNamed = (via: string) => (name(via) === via ? `${via} ${at}` : name(via));
  return {
    ...p,
    via: p.via != null ? `${viaNamed(p.via)}${serverReadVia(readBy)}` : p.via,
    inputs: p.inputs?.map((i) => (i.note ? { ...i, note: name(i.note) } : i)),
  };
}

/** A receipt stamped with rails-server's read when its via line speaks of the
 *  head or the block the page pinned; left alone when it speaks of a census or
 *  another stored block. */
export function stampHeadRead(p: Provenance, readBy?: ServerRead | null): Provenance {
  return readBy && /@ the pinned block|(?:@|\bat) head\b|eth_blockNumber/.test(p.via ?? "")
    ? stampServerRead(p, readBy)
    : p;
}

/** A receipt builder over coordinates that may carry rails-server's read,
 *  stamped as `stampHeadRead` stamps. */
export function withServerRead<C extends { readBy?: ServerRead | null }, R extends unknown[]>(
  build: (c: C, ...rest: R) => Provenance,
): (c: C, ...rest: R) => Provenance {
  return (c, ...rest) => stampHeadRead(build(c, ...rest), c.readBy);
}
