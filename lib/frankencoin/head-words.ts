// Frankencoin's timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367): the past-participle kind, the `t1_*` entries of
// content/frankencoin/event-prose.yaml. An owner's MintingUpdate reads as its
// legs in the order they run, a declared-price move as one of them ("Added
// collateral · Borrowed", "Raised liquidation price"); the challenge and the
// auction rows keep Frankencoin's names ("Challenged", "Challenge averted").
// Server-safe.

import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import { FRANKENCOIN_WORDS as W } from "@/lib/frankencoin/event-templates";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The legs an owner's MintingUpdate moved: what goes into the position
 *  before what comes out (a repayment before a withdrawal), the collateral
 *  first where both go one way, the declared price last. */
function updateLegs(ctx: FrankencoinContext): string | null {
  const dColl =
    !ctx.collateralUnderstated && ctx.collateral != null && ctx.collateralBefore != null
      ? num(ctx.collateral) - num(ctx.collateralBefore)
      : 0;
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : 0;
  const before = ctx.liqPriceBefore != null ? num(ctx.liqPriceBefore) : null;
  const after = ctx.liqPrice != null ? num(ctx.liqPrice) : null;
  const c = dColl === 0 ? null : dColl > 0 ? W.t1_added_coll : W.t1_withdrew_coll;
  const d = dMint === 0 ? null : dMint > 0 ? W.t1_borrowed : W.t1_repaid;
  const p =
    before == null || after == null || before === after
      ? null
      : after > before
        ? W.t1_raised_price
        : W.t1_lowered_price;
  const legs = dMint < 0 && dColl < 0 ? [d, c, p] : [c, d, p];
  const said = legs.filter((l): l is string => l != null);
  return said.length > 0 ? said.join(` ${W.t1_sep} `) : null;
}

/** The row's past-participle kind. `forcedTx`: a settlement written in a
 *  forced sale's transaction. */
export function frankencoinT1Kind(ctx: FrankencoinContext, opts: { forcedTx?: boolean } = {}): string {
  switch (ctx.eventType) {
    case "open":
      return W.t1_opened;
    case "clone":
      return W.t1_cloned;
    case "mint":
    case "repay":
    case "add_collateral":
    case "withdraw_collateral":
    case "adjust_price":
    case "adjust":
      return updateLegs(ctx) ?? W.t1_adjusted;
    case "close":
      return W.t1_closed;
    case "auction_settlement":
      return opts.forcedTx ? W.t1_forced_settled : W.t1_auction_settled;
    case "denied":
      return W.t1_denied;
    case "challenge_started":
      return W.t1_challenged;
    case "challenge_averted":
      return W.t1_challenge_averted;
    case "challenge_succeeded":
      return W.t1_challenge_succeeded;
    case "forced_sale":
      return W.t1_forced_sale;
    case "ownership_transferred":
      return ctx.initialization ? W.t1_owner_set : W.t1_transferred;
  }
}

/** The clause's party, where the row names one: a challenger, the vetoing
 *  address, a new owner. `lead` is the word before it. */
export function frankencoinT1Party(ctx: FrankencoinContext): { lead: string; address: string } | null {
  if (ctx.eventType === "challenge_started" && ctx.challenger) return { lead: W.t1_by, address: ctx.challenger };
  if (ctx.eventType === "denied" && ctx.deniedBy) return { lead: W.t1_by, address: ctx.deniedBy };
  if (ctx.eventType === "ownership_transferred" && ctx.newOwner)
    return { lead: ctx.initialization ? "" : W.t1_to, address: ctx.newOwner };
  return null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Borrowed", "Challenged · by 0x1234…abcd". */
export function frankencoinT1Caption(ctx: FrankencoinContext, opts: { forcedTx?: boolean } = {}): string {
  const kind = frankencoinT1Kind(ctx, opts);
  const party = frankencoinT1Party(ctx);
  if (!party) return kind;
  return `${kind} ${W.t1_sep} ${[party.lead, short(party.address)].filter(Boolean).join(" ")}`;
}

/** The warning spine's leg words. */
export const FRANKENCOIN_LEG_WORDS = {
  challenged: W.t1_leg_challenged,
  sold: W.t1_leg_sold,
  bid: W.t1_leg_bid,
  collateral: W.t1_leg_collateral,
  debtCleared: W.t1_leg_debt_cleared,
};
