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

/** The via line's tail for a read rails-server made: when it read it and the
 *  leg that answered. Empty where the web read the chain. */
export function serverReadVia(readBy?: PositionHeadStamp | null): string {
  if (!readBy) return "";
  return ` · read by rails-server at ${readBy.readAt.slice(11, 19)} UTC through ${readBy.provider}`;
}

/** A receipt over rails-server's read: "@ head" in the via line and the
 *  inputs' notes becomes the block, and the via line names the read. */
export function stampServerRead(p: Provenance, readBy?: ServerRead | null): Provenance {
  if (!readBy) return p;
  const at = `@ block ${readBy.block.toLocaleString("en-US")}`;
  return {
    ...p,
    via: p.via != null ? `${p.via.replaceAll("@ head", at)}${serverReadVia(readBy)}` : p.via,
    inputs: p.inputs?.map((i) => (i.note ? { ...i, note: i.note.replaceAll("@ head", at) } : i)),
  };
}
