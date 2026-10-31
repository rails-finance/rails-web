// A head read rails-server made, as a receipt states it.
// ----------------------------------------------------------------------------
// The head routes (`/api/at-block/aave-v3/position`, `/compound/position`,
// `/morpho/position`, …) answer with `head`: the block's time, when
// rails-server read it and the leg that answered. A receipt over such an
// answer names the block for "@ head" and ends its via line with who read it:
// "@ block 26,311,357 · read by rails-server at 07:51:02 UTC through <leg>".
// A receipt over a read the web made itself keeps "@ head".

import type { Provenance } from "@/components/shared/provenance";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";

/** rails-server's head read and the block it read at. */
export type ServerRead = PositionHeadStamp & { block: number };

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

/** The via line's tail for a read rails-server made: when it read it and the
 *  leg that answered. Empty where the web read the chain. */
export function serverReadVia(readBy?: PositionHeadStamp | null): string {
  if (!readBy) return "";
  return ` · read by rails-server at ${readBy.readAt.slice(11, 19)} UTC through ${readBy.provider}`;
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
