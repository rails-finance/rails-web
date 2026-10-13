// The MakerDAO event prose generator: one vault row in, its explanation (L4)
// and "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/makerdao/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read and its text as segments, so the card can
// echo a figure into its receipt without the text changing
// (components/protocol/makerdao/makerdao-event-explainer.tsx).
//
// Figures the card's cells, notes and price row show (the ratio, the room to
// borrow, the price, the auction's legs, the owners) stay on the card. Every
// sentence reads the vault after the row; one that needs the page's extras
// (the ilk read, the debt split, the auction) is left out until they land.

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { knownContract } from "@/lib/makerdao/known-contracts";
import {
  dropAt,
  inAndOutPartner,
  MAKER_EPS,
  openedViaContract,
  resultingState,
  type MakerRowExtras,
} from "@/lib/makerdao/event-figures";
import { MAKER_WORDS, makerModal, PROSE, type MakerL5Key } from "@/lib/makerdao/event-templates";

/** The receipt a figure echoes on the card. */
export type MakerEchoKey = "coll_change" | "debt_change" | "coll_after";

export type MakerEventProse = EventProseCore<MakerL5Key, MakerEchoKey>;

export interface MakerProseInput {
  ctx: MakerDAOContext;
  extras?: MakerRowExtras;
}

/** A LockStake urn's debt token: its modals take the `_usds` forms. */
const USDS = "USDS";

function pick(ctx: MakerDAOContext, extras: MakerRowExtras): { id: string; variant: string } {
  if (ctx.inkAfter == null || ctx.artAfter == null) return { id: "maker.fallback", variant: "unloaded" };
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  switch (ctx.eventType) {
    case "frob": {
      if (extras.leftover) return { id: "maker.returned", variant: extras.leftover.role === "in" ? "in" : "out" };
      if (ctx.isOpen) return { id: "maker.open", variant: dart > 0 ? "draw" : "collateral" };
      const c = dink > 0 ? "deposit" : dink < 0 ? "withdraw" : "";
      const d = dart > 0 ? "draw" : dart < 0 ? "repay" : "";
      const variant = [c, d].filter(Boolean).join("_") || "none";
      return { id: "maker.adjust", variant };
    }
    case "grab": {
      const a = extras.auction;
      return {
        id: "maker.liquidation",
        variant: !a ? "unread" : a.kind !== "clipper" ? "flip" : a.settled ? "auction" : "running",
      };
    }
    case "give":
      return { id: "maker.ownership", variant: "default" };
    case "fork-out":
    case "fork-in":
      return { id: "maker.fork", variant: ctx.eventType === "fork-out" ? "out" : "in" };
    case "lse-kick":
    case "lse-take":
    case "lse-remove":
      return {
        id: "maker.lse",
        variant: ctx.eventType === "lse-kick" ? "kick" : ctx.eventType === "lse-take" ? "take" : "remove",
      };
    default:
      return { id: "maker.fallback", variant: "default" };
  }
}

/** The modal each template and variant opens. */
function l5Of(id: string, variant: string): MakerL5Key {
  switch (id) {
    case "maker.open":
      return "open";
    case "maker.adjust":
      return variant === "deposit"
        ? "deposit"
        : variant === "withdraw"
          ? "withdraw"
          : variant === "draw"
            ? "generate"
            : variant === "repay"
              ? "repay"
              : "adjust";
    case "maker.returned":
      return "returned";
    case "maker.liquidation":
    case "maker.lse":
      return "liquidation";
    case "maker.ownership":
      return "ownership";
    case "maker.fork":
      return "fork";
    default:
      return "adjust";
  }
}

/** The event's "?" modal. */
export function makerEventModal(ctx: MakerDAOContext, extras: MakerRowExtras = {}) {
  const sel = pick(ctx, extras);
  return makerModal(l5Of(sel.id, sel.variant), ilkDebtSymbol(ctx.ilk) === USDS);
}

/** One row's explanation and modal. */
export function makerEventProse(input: MakerProseInput): MakerEventProse {
  const { ctx } = input;
  const extras = input.extras ?? {};
  const sel = pick(ctx, extras);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), null);
  const { t, values, sp } = run;
  const v = values;
  const rs = resultingState(ctx);
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  const debtAfter = ctx.debtAfter != null ? Number(ctx.debtAfter) : 0;
  // The debt the row moved: dart × the rate at the block, where the row has it.
  const debtMoved = ctx.debtChange != null && dart !== 0 ? Number(ctx.debtChange) : null;
  const rows = extras.txRows ?? [];
  const tx = extras.txContext;

  v.coll_symbol = ctx.collateralSymbol;
  v.debt_symbol = ilkDebtSymbol(ctx.ilk);
  v.ilk = ctx.ilk;
  v.coll_change = Math.abs(dink);
  v.coll_after = rs.inkAfter;
  if (debtMoved != null) v.debt_change = Math.abs(debtMoved);
  const echo = { coll_change: "coll_change", debt_change: "debt_change", coll_after: "coll_after" } as const;

  // Another address signed, outside the owner's proxy: the header's "by" chip.
  const actor = () => {
    if (extras.createdForSigner || !ctx.txFrom || !ctx.txTo || !ctx.ownerAt) return;
    sp.say(dart <= 0 && dink >= 0 ? "actor.other" : "actor.permitted");
  };
  // A contract that opened the vault in its name and handed it over.
  const created = (): boolean => {
    const via = openedViaContract(rows, tx);
    if (via && tx) {
      v.creator = via.contract;
      v.recipient = tx.from;
      sp.say("created");
      return true;
    }
    if (extras.createdForSigner && ctx.txFrom && ctx.ownerAt) {
      v.creator = ctx.ownerAt;
      v.recipient = ctx.txFrom;
      sp.say("created");
      return true;
    }
    return false;
  };
  // How far the price at the row's block could fall before the minimum.
  const risk = () => {
    const drop = dropAt(rs.inkAfter, debtAfter, extras.ilkAt);
    if (drop == null || !(drop > 0)) return;
    if (drop < 0.005) {
      sp.say("risk.at_line");
      return;
    }
    v.drop = drop;
    const cap = extras.ilkAt?.priceCap;
    const capped = cap != null && cap.oracleUsd != null && cap.oracleUsd > cap.capUsd;
    if (extras.matStep && t.id !== "maker.open") {
      v.mat = extras.matStep.to;
      sp.say("risk.drop_mat");
    } else sp.say(capped ? "risk.drop_capped" : "risk.drop");
  };

  switch (t.id) {
    case "maker.open": {
      if (variant === "collateral") sp.say("open.what", echo);
      else sp.say(debtMoved != null ? "open.what_draw" : "open.what_draw_plain", echo);
      if (!created()) actor();
      if (tx?.migratedCup) {
        v.cup = tx.migratedCup;
        sp.say("migrated");
      }
      if (rs.collateralOnly) sp.say("state.no_debt");
      else risk();
      break;
    }
    case "maker.adjust": {
      const plain = debtMoved == null;
      if (variant === "deposit") sp.say("adj.deposit", echo);
      else if (variant === "withdraw") sp.say("adj.withdraw", echo);
      else if (variant === "draw") sp.say(plain ? "adj.draw_plain" : "adj.draw", echo);
      else if (variant === "repay") sp.say(plain ? "adj.repay_plain" : "adj.repay", echo);
      else if (variant === "deposit_draw") sp.say(plain ? "adj.deposit_draw_plain" : "adj.deposit_draw", echo);
      else if (variant === "deposit_repay") sp.say(plain ? "adj.deposit_repay_plain" : "adj.deposit_repay", echo);
      else if (variant === "withdraw_draw") sp.say(plain ? "adj.withdraw_draw_plain" : "adj.withdraw_draw", echo);
      else if (variant === "withdraw_repay") sp.say(plain ? "adj.withdraw_repay_plain" : "adj.withdraw_repay", echo);
      else sp.say("adj.none");
      if (variant === "none") break;
      actor();

      // The transaction: the same collateral in and out again, or several changes.
      const self = rows.find((r) => r.id === extras.eventId);
      const partner = self ? inAndOutPartner(self, rows) : null;
      if (partner) sp.say(dink > 0 ? "tx.in" : "tx.out", echo);
      else if (rows.length >= 2 && rows.every((r) => r.context.data.eventType === "frob")) {
        v.tx_changes = rows.length;
        sp.say("tx.steps");
      }

      // What the debt is made of: the principal drawn since the vault last
      // owed nothing, and the fee (the card's and the flows panel's split).
      const split = extras.split;
      if (split && split.drawnBefore != null && dart !== 0 && split.stretchStartAt != null) {
        const repaid = dart < 0 && debtMoved != null ? -debtMoved : 0;
        const intoFee = repaid - split.drawnBefore;
        if (repaid > 0 && intoFee > 0.005) {
          v.principal = split.drawnBefore;
          v.fee_part = intoFee;
          sp.say("fee.covered");
        } else if (split.feeAfter != null && split.feeAfter >= 0.005 && debtAfter > MAKER_EPS) {
          v.fee_after = split.feeAfter;
          sp.say("fee.split");
        }
      }

      if (rs.closedPosition) sp.say("state.empty");
      else if (rs.collateralOnly) sp.say(dart < 0 ? "state.cleared" : "state.no_debt");
      else risk();
      break;
    }
    case "maker.returned": {
      v.auction_date = extras.leftover!.grabAt;
      if (variant === "in") {
        sp.say("returned.in", echo);
        break;
      }
      sp.say("returned.out", echo);
      if (rs.inkAfter >= 1e-6) sp.say("returned.left", echo);
      else if (rs.inkAfter > MAKER_EPS) sp.say("returned.trace");
      else sp.say("state.empty");
      break;
    }
    case "maker.liquidation": {
      sp.say(debtMoved != null ? "liq.what" : "liq.what_plain", echo);
      sp.say("liq.why");
      if (extras.matStep) {
        v.mat_from = extras.matStep.from;
        v.mat = extras.matStep.to;
        sp.say("liq.why_mat");
      }
      const a = extras.auction?.kind === "clipper" ? extras.auction : null;
      if (variant === "auction" && a) {
        sp.say("liq.kept");
        if (Number(a.leftoverInk) > 0 && extras.leftoverTakenAt != null) {
          v.taken_date = extras.leftoverTakenAt;
          sp.say("liq.taken");
        }
      } else if (variant === "running") sp.say("liq.running");
      else if (variant === "flip") sp.say("liq.flip");
      break;
    }
    case "maker.ownership": {
      sp.say("give.what");
      const step = extras.ownership;
      if (!created()) {
        const caller = step?.caller ?? ctx.giveCaller ?? null;
        const known = knownContract(caller);
        const party = caller ? tx?.parties[caller] : undefined;
        if (known) {
          v.caller_name = known.name;
          sp.say("give.by_name");
        } else if (party?.kind === "dsproxy" && party.owner) {
          v.caller = party.owner;
          sp.say("give.by_proxy");
        } else if (caller) {
          v.caller = caller;
          sp.say("give.by");
        }
      }
      // What the whole transaction did, on its first give only.
      const gives = rows.filter((r) => r.context.data.eventType === "give");
      const first = gives[0]?.id === extras.eventId;
      if (tx?.migratedCup != null && step && knownContract(step.before.holder)?.role === "maker") {
        v.cup = tx.migratedCup;
        sp.say("migrated");
      } else if (first && rows.length >= 2) {
        v.tx_changes = rows.length;
        sp.say("tx.steps");
      }
      const all = extras.ownershipAll;
      if (first && gives.length >= 2 && all) {
        const a = all.get(gives[0].id);
        const b = all.get(gives[gives.length - 1].id);
        const key = (r: { holder: string | null; owner: string | null }) => r.holder ?? r.owner;
        const sum = (f: (d: MakerDAOContext) => string | undefined) =>
          rows.reduce((s, r) => s + (r.context.data.eventType === "frob" ? Number(f(r.context.data)) || 0 : 0), 0);
        if (
          a &&
          b &&
          key(a.before) === key(b.after) &&
          Math.abs(sum((d) => d.dink)) < 1e-9 &&
          Math.abs(sum((d) => d.debtChange)) < 1e-6
        )
          sp.say("give.round");
      }
      break;
    }
    case "maker.fork": {
      v.fork_dir = variant === "out" ? MAKER_WORDS.fork_out : MAKER_WORDS.fork_in;
      if (dink !== 0 && debtMoved != null) sp.say("fork.both", echo);
      else if (dink !== 0) sp.say("fork.coll", echo);
      else if (debtMoved != null) sp.say("fork.debt", echo);
      else sp.say("fork.none");
      break;
    }
    case "maker.lse": {
      sp.say(variant === "kick" ? "lse.kick" : variant === "take" ? "lse.take" : "lse.remove");
      break;
    }
    default: {
      v.event_type = ctx.eventType;
      sp.say(variant === "unloaded" ? "fallback.unloaded" : "fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const key = l5Of(t.id, variant);
  return { ...said, L5: { key, content: makerModal(key, v.debt_symbol === USDS) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const makerExplanationRuns = PROSE.explanationRuns;
