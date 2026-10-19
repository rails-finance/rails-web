// MakerDAO's timeline head as words (rails-ops decision 0045, TO-DO-ui-jobs
// 367): the past-participle kind in Rails's words, the `t1_*` entries of
// content/makerdao/event-prose.yaml. A frob reads as its legs in the order
// they run ("Added collateral · Borrowed"; a repayment before a withdrawal);
// an open names the kind only; a grab reads "Liquidated"; a give
// "Transferred" with the new owner as its clause. Server-safe.

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import { MAKER_WORDS } from "@/lib/makerdao/event-templates";

/** The row's past-participle kind. */
export function makerT1Kind(ctx: MakerDAOContext): string {
  switch (ctx.eventType) {
    case "grab":
      return MAKER_WORDS.t1_liquidated;
    case "fork-out":
      return MAKER_WORDS.t1_moved_out;
    case "fork-in":
      return MAKER_WORDS.t1_moved_in;
    case "give":
      return MAKER_WORDS.t1_transferred;
    case "lse-kick":
      return MAKER_WORDS.t1_auction_started;
    case "lse-take":
      return MAKER_WORDS.t1_auction_sale;
    case "lse-remove":
      return MAKER_WORDS.t1_auction_settled;
    case "frob":
      return ctx.isOpen ? MAKER_WORDS.t1_opened : (frobLegs(ctx) ?? MAKER_WORDS.t1_adjusted);
  }
}

/** A frob's legs as participles: what goes into the vault before what comes
 *  out, the collateral first where both go one way (rails-ops
 *  reference/shared-event-card-spec.md, "Spine order"). */
function frobLegs(ctx: MakerDAOContext): string | null {
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  if (dink === 0 && dart === 0) return null;
  const c = dink > 0 ? MAKER_WORDS.t1_added_coll : MAKER_WORDS.t1_withdrew_coll;
  const d = dart > 0 ? MAKER_WORDS.t1_borrowed : MAKER_WORDS.t1_repaid;
  if (dart === 0) return c;
  if (dink === 0) return d;
  return dart < 0 && dink < 0 ? `${d} ${MAKER_WORDS.t1_sep} ${c}` : `${c} ${MAKER_WORDS.t1_sep} ${d}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Borrowed", "Transferred · to 0x1234…abcd". `to`: a
 *  give's new owner, its name or address. */
export function makerT1Caption(ctx: MakerDAOContext, to?: { address: string; name?: string | null }): string {
  const kind = makerT1Kind(ctx);
  if (!to) return kind;
  return `${kind} ${MAKER_WORDS.t1_sep} ${MAKER_WORDS.t1_to} ${to.name ?? short(to.address)}`;
}

/** The warning spine's leg words: collateral seized, debt cleared. */
export const MAKER_LEG_WORDS = { seized: MAKER_WORDS.t1_leg_seized, cleared: MAKER_WORDS.t1_leg_cleared };
