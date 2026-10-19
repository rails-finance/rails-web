// Fluid's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367). The kind is a past participle; an operate names its legs in leg
// order, collateral then debt ("Added collateral · Borrowed", "Withdrew
// collateral · Repaid"), each by its own signed amount; an open names the
// kind only. An ownership transfer's new owner follows as its clause. The
// spine carries the figures.

import type { FluidContext } from "@/lib/shared/types/event-shape";

export const FLUID_HEAD_WORDS = {
  sep: "·",
  opened: "Opened position",
  addedColl: "Added collateral",
  withdrewColl: "Withdrew collateral",
  borrowed: "Borrowed",
  repaid: "Repaid",
  liquidated: "Liquidated",
  absorbed: "Absorbed",
  minted: "Minted",
  transferred: "Transferred",
  roundTrip: "Round trip in this transaction",
  to: "to",
  legSeized: "seized",
  legCleared: "cleared",
} as const;

const W = FLUID_HEAD_WORDS;

/** The row's words: the kind, and a state the spine cannot show. `opened`:
 *  the position's Open row (the first operate and its mint as one card);
 *  `roundTrip`: an ownership hop that came back within the transaction. */
export function fluidT1Words(
  ctx: FluidContext,
  fallback: string,
  opts: { opened?: boolean; roundTrip?: boolean } = {},
): { kind: string; clause?: string } {
  if (opts.opened) return { kind: W.opened };
  switch (ctx.eventType) {
    case "liquidated":
      return { kind: W.liquidated };
    case "absorbed":
      return { kind: W.absorbed };
    case "mint":
      return { kind: W.minted };
    case "transfer":
      return { kind: W.transferred, clause: opts.roundTrip ? W.roundTrip : undefined };
  }
  const col = Number(ctx.colDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const legs = [
    col > 0 ? W.addedColl : col < 0 ? W.withdrewColl : null,
    debt > 0 ? W.borrowed : debt < 0 ? W.repaid : null,
  ].filter((w): w is NonNullable<typeof w> => w != null);
  return { kind: legs.length > 0 ? legs.join(` ${W.sep} `) : fallback };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Added collateral · Borrowed", "Transferred · to 0x…". */
export function fluidT1Caption(
  ctx: FluidContext,
  fallback: string,
  opts: { opened?: boolean; roundTrip?: boolean } = {},
): string {
  const w = fluidT1Words(ctx, fallback, opts);
  if (w.clause) return `${w.kind} ${W.sep} ${w.clause}`;
  if (ctx.eventType === "transfer" && ctx.transferTo) return `${w.kind} ${W.sep} ${W.to} ${short(ctx.transferTo)}`;
  return w.kind;
}
