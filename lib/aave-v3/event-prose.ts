// The Aave V3 event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/aave-v3/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values. It serves
// Aave V3 on Ethereum and Base and Seamless: the protocol and brand are
// values, and the modal takes the deployment's wording.
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read and its text as segments, so the card can
// echo a figure into its receipt without the text changing
// (components/protocol/aave-v3/aave-v3-event-explainer.tsx).
//
// Figures the card's cells, notes and price row show (the balances either
// side, the interest since the previous event, the health factor either side,
// a liquidation's valued legs and premium) stay on the card. The health
// factor is said only where it means something: close to or past the
// liquidation line, or cleared.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import type { ChainId } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { externalActor } from "@/lib/shared/external-actor";
import { v3Brand, isSeamless, type V3Protocol } from "@/lib/aave-v3/protocol-name";
import { feeLiquidation, liquidationBonus, liquidationFee } from "@/lib/aave-v3/liquidation-fee";
import type { AaveV3TimelineEvent } from "@/lib/aave-v3/event-neighbours";
import { CLOSE_LIQUIDATION_HF, NEAR_LIQUIDATION_HF, type V3StateRead } from "@/lib/aave-v3/event-state";
import { aaveV3Modal, PROSE, V3_WORDS, type AaveV3L5Key } from "@/lib/aave-v3/event-templates";

/** The receipt a figure echoes on the card. */
export type AaveV3EchoKey =
  | "amount"
  | "transfer"
  | "written_off"
  | "seized"
  | "cleared"
  | "given"
  | "received"
  | "back";

export type AaveV3EventProse = EventProseCore<AaveV3L5Key, AaveV3EchoKey>;

export interface AaveV3ProseInput {
  ctx: AaveV3Context;
  /** The page's Pool: Aave V3 or Seamless. */
  protocol: V3Protocol;
  chainId: ChainId;
  /** The position state around this event, where the page reads it. */
  state?: V3StateRead;
  /** The position's owner: the third-party sentences key on it. */
  owner?: string;
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: readonly AaveV3TimelineEvent[];
  /** The last row of the previous transaction, and this event's time. */
  previousEvent?: AaveV3TimelineEvent;
  timestamp?: number;
}

const num = (s: string | undefined | null): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const abs = (s: string | undefined | null): number => Math.abs(num(s) ?? 0);

function pick(
  ctx: AaveV3Context,
  chainId: ChainId,
  siblings?: readonly AaveV3TimelineEvent[],
): { id: string; variant: string } {
  switch (ctx.eventType) {
    case "supply":
      return { id: "aave3.supply", variant: "default" };
    case "withdraw":
      return { id: "aave3.withdraw", variant: "default" };
    case "borrow":
      return { id: "aave3.borrow", variant: "default" };
    case "repay":
      return { id: "aave3.repay", variant: "default" };
    case "liquidation":
      return { id: "aave3.liquidation", variant: "default" };
    case "bad_debt_written_off":
      return { id: "aave3.bad_debt", variant: "default" };
    case "transfer_in":
      return { id: "aave3.transfer_in", variant: "default" };
    case "transfer_out": {
      if (feeLiquidation(ctx, siblings, chainId)) return { id: "aave3.liq_fee", variant: "default" };
      // The gateway pulls aWETH only to withdraw it as ETH: a withdrawal.
      if (getProtocolContract(ctx.counterparty, chainId)?.kind === "gateway")
        return { id: "aave3.withdraw", variant: "gateway" };
      return { id: "aave3.transfer_out", variant: "default" };
    }
    case "swap": {
      const s = ctx.swap;
      return s ? { id: "aave3.swap", variant: s.kind } : { id: "aave3.fallback", variant: "default" };
    }
    default:
      return { id: "aave3.fallback", variant: "default" };
  }
}

/** The event's "?" modal: its kind's, a swap's by kind and venue. */
function modalKey(ctx: AaveV3Context, templateId: string): AaveV3L5Key {
  if (templateId === "aave3.swap" && ctx.swap) {
    const para = ctx.swap.route === "paraswap";
    switch (ctx.swap.kind) {
      case "collateral_swap":
        return para ? "collateral_swap" : "collateral_swap_cow";
      case "debt_swap":
        return para ? "debt_swap" : "debt_swap_cow";
      case "repay_with_collateral":
        return para ? "repay_with_collateral" : "fallback";
      case "withdraw_and_swap":
        return para ? "withdraw_and_swap" : "fallback";
      default:
        return "fallback";
    }
  }
  return PROSE.template(templateId).L5;
}

/** The previous row, when it sent the same reserve to the same account and the
 *  supply index between the two rows accounts for the amount that came back
 *  (to a millionth of it): its time. */
function returnedFrom(ctx: AaveV3Context, prev: AaveV3TimelineEvent | undefined): number | null {
  const p = prev?.context.data;
  if (!p || !prev || p.eventType !== "transfer_out") return null;
  if (!ctx.counterparty || p.counterparty?.toLowerCase() !== ctx.counterparty.toLowerCase()) return null;
  if (p.reserveSymbol !== ctx.reserveSymbol) return null;
  const inIdx = ctx.raw?.supplyIndex;
  const outIdx = p.raw?.supplyIndex;
  const outAmt = p.raw?.amount;
  if (!inIdx || !outIdx || !outAmt) return null;
  let ratio: number;
  try {
    const i1 = BigInt(outIdx);
    const i2 = BigInt(inIdx);
    if (i1 <= BigInt(0) || i2 <= BigInt(0)) return null;
    ratio = Number((BigInt(outAmt) * i2) / i1) / Number(BigInt(outAmt));
  } catch {
    return null;
  }
  const received = abs(ctx.amount);
  const sent = abs(p.amount);
  if (!(sent > 0) || !(received > 0)) return null;
  return Math.abs(sent * ratio - received) / received > 1e-6 ? null : prev.timestamp;
}

/** One event's explanation and modal. */
export function aaveV3EventProse(input: AaveV3ProseInput): AaveV3EventProse {
  const { ctx, protocol, chainId, state, owner, siblings, previousEvent, timestamp } = input;
  const sel = pick(ctx, chainId, siblings);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id));
  const { t, values, sp } = run;
  const v = values;
  const sym = ctx.reserveSymbol ?? "";

  v.symbol = sym;
  v.protocol = protocol;
  v.brand = v3Brand(protocol);
  v.amount = abs(ctx.amount);
  const actor =
    owner && (ctx.eventType === "supply" || ctx.eventType === "repay" || ctx.eventType === "borrow")
      ? externalActor(ctx, owner)
      : null;
  if (actor) v.actor = actor;

  // The health factor after the event, where it means something: past, close
  // to or near the liquidation line, cleared, or the account emptied.
  const hfLine = (ends: boolean) => {
    if (!state) return;
    if (ends && state.emptyAfter) return sp.say("hf.closed");
    const a = state.hfAfter;
    const b = state.hfBefore;
    if (a == null) {
      if (ends && b != null) sp.say("hf.cleared");
      return;
    }
    const coll = state.collateralSymbols?.length === 1 ? state.collateralSymbols[0] : null;
    const owed = [...new Set((state.left ?? []).filter((l) => l.side === "debt").map((l) => l.symbol))];
    const same = coll != null && owed.length === 1 && owed[0] === coll;
    v.hf_after = a;
    v.drop_pct = a > 1 ? 1 - 1 / a : 0;
    if (coll) v.coll_symbol = coll;
    if (a < 1) sp.say("hf.under");
    else if (a < CLOSE_LIQUIDATION_HF) sp.say(same ? "hf.close_same" : coll ? "hf.close" : "hf.close_basket");
    else if (a < NEAR_LIQUIDATION_HF) sp.say(same ? "hf.near_same" : coll ? "hf.near" : "hf.near_basket");
    else if (b != null && b < CLOSE_LIQUIDATION_HF) {
      v.hf_before = b;
      sp.say("hf.started_close");
    }
  };

  // How the health factor moved between the previous event and this one, by
  // its largest cause.
  const priorLine = () => {
    if (!state || state.prevHf == null || state.hfBefore == null) return;
    const from = state.prevHf;
    const to = state.hfBefore;
    if (Math.abs(to - from) < 0.01 || Math.min(from, to) >= 100) return;
    v.hf_prev = from;
    v.hf_before = to;
    const parts = state.moveParts?.parts ?? [];
    const top = [...parts].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    if (!top) return sp.say("prior.plain");
    switch (top.kind) {
      case "price":
        v.price_symbol = top.symbol ?? "";
        return sp.say("prior.price");
      case "prices":
        return sp.say("prior.prices");
      case "debt-interest":
      case "supply-interest":
        return sp.say("prior.interest");
      case "threshold":
        return sp.say(top.emodeSwitch ? "prior.emode" : "prior.threshold");
    }
  };

  // The event reserve's rate on its side: the average since the previous
  // event, or its two ends.
  const rateLine = (): boolean => {
    const r = state?.rate;
    if (!r) return false;
    v.side_word = r.side === "debt" ? V3_WORDS.side_borrow : V3_WORDS.side_supply;
    // A rate at 0 at both ends (a reserve no one borrows) says nothing.
    if (!(r.now > 0) && !(r.then > 0)) return false;
    if (r.avg != null) {
      v.rate_avg = r.avg;
      sp.say("rate.avg");
    } else if (Math.abs(r.now - r.then) < 0.00005) {
      v.rate_now = r.now;
      sp.say("rate.held");
    } else {
      v.rate_then = r.then;
      v.rate_now = r.now;
      sp.say("rate.moved");
    }
    return true;
  };

  // A supply that was on as collateral and is gone.
  const switchedOff = () => state?.collateral?.before === true && state.collateral.after === false;

  const amount = { amount: "amount" } as const;

  switch (t.id) {
    case "aave3.supply": {
      sp.say(actor ? "supply.by" : "supply.what", amount);
      const coll = state?.collateral;
      if (coll && !coll.before && coll.after) sp.say("coll.on");
      else if (coll?.after) sp.say("coll.was_on");
      else if (coll) sp.say(state?.reserveLtvBps === 0 ? "coll.zero_ltv" : "coll.stays_off");
      hfLine(false);
      priorLine();
      rateLine();
      break;
    }
    case "aave3.withdraw": {
      sp.say(variant === "gateway" ? "withdraw.gateway" : "withdraw.what", {
        amount: variant === "gateway" ? "transfer" : "amount",
      });
      if (switchedOff()) sp.say("off.switched");
      hfLine(true);
      priorLine();
      rateLine();
      break;
    }
    case "aave3.borrow": {
      sp.say(actor ? "borrow.by" : "borrow.what", amount);
      hfLine(false);
      priorLine();
      if (!rateLine() && ctx.borrowRate && Number(ctx.borrowRate) > 0) {
        v.rate_now = Number(ctx.borrowRate) / 1e27;
        sp.say("rate.at");
      }
      break;
    }
    case "aave3.repay": {
      const cleared = (num(ctx.debtAfter) ?? 1) <= 0;
      sp.say(
        actor
          ? cleared
            ? "repay.by_cleared"
            : "repay.by"
          : ctx.useATokens
            ? cleared
              ? "repay.atokens_cleared"
              : "repay.atokens"
            : cleared
              ? "repay.cleared"
              : "repay.what",
        amount,
      );
      // A repay of the token a withdraw and swap sent to the wallet within the hour.
      const s = previousEvent?.context.data.swap;
      const minutes = previousEvent && timestamp != null ? (timestamp - previousEvent.timestamp) / 60 : null;
      if (
        s?.kind === "withdraw_and_swap" &&
        s.receivedSymbol === sym &&
        minutes != null &&
        minutes >= 0 &&
        minutes <= 60
      ) {
        v.swap_received = abs(s.receivedAmount);
        sp.say("repay.funded");
      }
      hfLine(true);
      priorLine();
      rateLine();
      break;
    }
    case "aave3.swap": {
      const s = ctx.swap!;
      const para = s.route === "paraswap";
      v.given = abs(ctx.amount);
      v.received = abs(s.receivedAmount);
      v.r_symbol = s.receivedSymbol ?? "";
      v.venue = para ? V3_WORDS.venue_paraswap : V3_WORDS.venue_cow;
      const legs = { given: "given", received: "received" } as const;
      // What a ParaSwap adapter returned unused (server mig 248).
      const back = s.events?.find((e) => e.leftover);
      if (variant === "debt_swap") {
        sp.say("swap.debt", legs);
        const funded = s.events?.find((e) => e.action === "borrow" && !e.leftover);
        if (para && funded && back) {
          v.funded = abs(funded.amount);
          v.back = abs(back.amount);
          sp.say("swap.debt_funded", { back: "back" });
        }
        sp.say("swap.debt_owes");
      } else if (variant === "repay_with_collateral") {
        sp.say("swap.repay", legs);
        const sent = back ? s.events?.find((e) => e.action === "transfer_out" && !e.leftover) : undefined;
        if (para && back && sent) {
          v.sent = abs(sent.amount);
          v.back = abs(back.amount);
          sp.say("swap.repay_net", { back: "back" });
        }
      } else if (variant === "supply_from_swap") {
        sp.say("swap.supply_from", legs);
        sp.say("swap.supply_wallet");
        break;
      } else if (variant === "withdraw_and_swap") {
        sp.say("swap.withdraw", legs);
        sp.say(para ? "swap.withdraw_wallet" : "swap.withdraw_receiver");
      } else sp.say("swap.collateral", legs);
      if (variant !== "debt_swap" && switchedOff()) sp.say("swap.off");
      hfLine(true);
      priorLine();
      break;
    }
    case "aave3.transfer_in": {
      const named = getProtocolContract(ctx.counterparty, chainId);
      v.sender = named?.name ?? V3_WORDS.another_account;
      sp.say("tin.what", { amount: "transfer" });
      if (named) {
        v.role = named.role;
        sp.say("tin.named");
      }
      const sentAt = returnedFrom(ctx, previousEvent);
      if (sentAt != null && timestamp != null) {
        v.sent_on = sentAt;
        sp.say("tin.returned");
      }
      break;
    }
    case "aave3.transfer_out": {
      const named = getProtocolContract(ctx.counterparty, chainId);
      v.recipient = named?.name ?? V3_WORDS.another_account;
      sp.say("tout.what", { amount: "transfer" });
      if (named) {
        v.role = named.role;
        sp.say("tout.named");
      }
      if (switchedOff()) sp.say("off.switched");
      hfLine(true);
      priorLine();
      break;
    }
    case "aave3.liq_fee": {
      const liq = feeLiquidation(ctx, siblings, chainId)!;
      v.seized = abs(liq.liquidatedCollateralAmount);
      sp.say("fee.what", { amount: "transfer" });
      sp.say("fee.split");
      const b = liquidationBonus(liq, ctx);
      if (b?.feeShare != null) {
        v.fee_share = b.feeShare;
        sp.say("fee.share");
      }
      break;
    }
    case "aave3.liquidation": {
      const fee = liquidationFee(ctx, siblings, chainId);
      v.cleared = abs(ctx.debtToCover);
      v.seized = abs(ctx.liquidatedCollateralAmount);
      v.debt_symbol = sym;
      v.coll_symbol = ctx.collateralSymbol ?? "";
      sp.say("liq.what", { cleared: "cleared", seized: "seized" });
      // The health factor before the call on the basis it ran at: block N's
      // prices where the read has them, else the end of N−1.
      const hfCall = state?.hfAtCall ?? state?.hfBefore ?? null;
      if (hfCall != null) {
        v.hf_call = hfCall;
        sp.say("liq.why");
      } else sp.say("liq.why_unread");
      // The bonus the Pool paid on this collateral: the Base rows carry it at
      // the block; on Ethereum it is read off the liquidation's legs and fee.
      const atBlock = ctx.liquidationBonusAtBlock;
      const b = atBlock
        ? {
            bonus: (atBlock.bonusBps - 10000) / 10000,
            feeShare: atBlock.protocolFeeBps > 0 ? atBlock.protocolFeeBps / 10000 : null,
          }
        : liquidationBonus(ctx, fee);
      const feeAmt = fee ? abs(fee.amount) : 0;
      if (feeAmt > 0) v.fee = feeAmt;
      if (b && b.bonus > 0) {
        v.bonus = b.bonus;
        if (feeAmt > 0) sp.say("liq.bonus_fee");
        else if (atBlock && atBlock.protocolFeeBps === 0) sp.say("liq.bonus_all");
        else sp.say("liq.bonus");
      } else if (feeAmt > 0) sp.say("liq.fee");
      // How much one call may take: Aave V3 (v3.3+) half the account's whole
      // debt; Seamless (Pool revision 2) half of the one debt asset's balance.
      if (isSeamless(protocol)) {
        const before = num(ctx.debtBefore);
        if (before != null && before > 0 && Math.abs(abs(ctx.debtToCover) / before - 0.5) < 0.001) {
          v.debt_before = before;
          sp.say("liq.half_asset");
        }
      } else {
        const clearedUsd = ctx.debtPrice ? abs(ctx.debtToCover) * ctx.debtPrice.usd : null;
        const owed = state?.debtUsdBefore;
        if (clearedUsd != null && owed && Math.abs(clearedUsd / owed - 0.5) < 0.002) {
          v.cleared_usd = clearedUsd;
          v.debt_usd = owed;
          sp.say("liq.half_usd");
        }
      }
      const other = [
        ...new Set((state?.left ?? []).filter((l) => l.side === "debt" && l.symbol !== sym).map((l) => l.symbol)),
      ];
      if (state?.hfAfter != null && state.hfAfter < 1) {
        v.hf_after = state.hfAfter;
        sp.say("liq.again_now");
      } else if (other.length > 0) {
        v.other_debt = other.join(` ${V3_WORDS.and} `);
        sp.say("liq.left");
      } else sp.say("liq.again");
      break;
    }
    case "aave3.bad_debt": {
      sp.say("bad.what", { amount: "written_off" });
      sp.say("bad.deficit");
      break;
    }
    default: {
      v.event_type = ctx.eventType;
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const key = modalKey(ctx, t.id);
  return { ...said, L5: { key, content: aaveV3Modal(key, isSeamless(protocol) ? "seamless" : "aave-v3") } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const aaveV3ExplanationRuns = PROSE.explanationRuns;
