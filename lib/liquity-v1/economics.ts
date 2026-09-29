// Liquity V1 economics reduction — the valued dual tower with lifetime flows.
// ----------------------------------------------------------------------------
// A Liquity V1 Trove is single-collateral (ETH) + single-debt (LUSD), and the
// TroveManager emits ABSOLUTE balances on every event, so the current lines are
// directly emitted chain values and the lifetime flows are sums of chain-derived
// deltas (after − before over consecutive emitted absolutes).
//
// The protocol charges NO ongoing interest, so there is no principal-vs-accrued
// split to draw: the emitted LUSD debt is the Trove's whole debt (the
// LUSD received + one-time borrowing fees + the 200 LUSD liquidation reserve).
//
// Pricing: when the live chain read has landed, ETH is valued at the protocol's
// OWN PriceFeed price (the same figure the liquidation path uses this block)
// and LUSD at its $1 redemption face value — the value the protocol itself
// assigns LUSD debt in every collateral-ratio check and redemption. Both are
// the protocol's own on-chain pricing, so the USD tower is chain-derived and
// survives the on-chain-only view. Without the chain read the tower degrades
// to the token-only gated state.
//
// Lifetime flows render only when they RECONCILE: net(deposits − exits) must
// equal the current emitted balance on both sides (1% tolerance), so a partial
// capture can never masquerade as an all-time history.

import type { LiquityV1PositionView } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import { positionCollateralProv, positionDebtProv, lifetimeFlowProv } from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { LIQUIDATION_COLL_VERB, LIQUIDATION_DEBT_VERB, redemptionSplit } from "@/lib/liquity-v1/event-figures";

const DUST = 1e-9;

/** Lifetime gross flows on both axes, replayed from the Trove's own signed
 *  TroveUpdated deltas. Redemptions and liquidations are kept apart from the
 *  voluntary flows — each is its own legend row. */
export interface TroveFlows {
  deposited: number; // ETH in (open / adjust)
  withdrawn: number; // ETH out, voluntary (adjust / close)
  collLiquidated: number; // ETH seized by liquidation
  collRedeemed: number; // ETH that went to redeemers
  /** ETH a full redemption moved to the CollSurplusPool for the owner. Summed
   *  from the loaded rows only: the opening balance carries no such leg, so on
   *  a windowed page a surplus below the cut stays inside collRedeemed. */
  collSurplus: number;
  borrowed: number; // debt taken on (LUSD received + one-time fees + the 200 LUSD reserve)
  repaid: number; // LUSD repaid, voluntary
  debtLiquidated: number; // LUSD cleared by liquidation
  debtRedeemed: number; // LUSD repaid by redemptions
}

function replayLifetime(events: BaseActivityEvent[], epoch: number | null): TroveFlows {
  const f: TroveFlows = {
    deposited: 0,
    withdrawn: 0,
    collLiquidated: 0,
    collRedeemed: 0,
    collSurplus: 0,
    borrowed: 0,
    repaid: 0,
    debtLiquidated: 0,
    debtRedeemed: 0,
  };
  for (const ev of events) {
    if (!isLiquityV1Event(ev)) continue;
    const ctx = ev.context.data;
    if (epoch != null && ctx.epoch != null && ctx.epoch !== epoch) continue;
    const collDelta = Number(ctx.collDelta) || 0;
    const debtDelta = Number(ctx.debtDelta) || 0;
    if (ctx.eventType === "liquidation") {
      f.collLiquidated += Math.abs(Math.min(collDelta, 0));
      f.debtLiquidated += Math.abs(Math.min(debtDelta, 0));
      continue;
    }
    if (ctx.eventType === "redemption") {
      // A full redemption splits the collateral: the redeemer's ETH, and the
      // rest left to the owner in the CollSurplusPool.
      const split = redemptionSplit(ctx);
      if (split?.full) {
        f.collRedeemed += split.ethToRedeemer;
        f.collSurplus += split.ethSurplus;
      } else f.collRedeemed += Math.abs(Math.min(collDelta, 0));
      f.debtRedeemed += Math.abs(Math.min(debtDelta, 0));
      continue;
    }
    if (collDelta > 0) f.deposited += collDelta;
    else f.withdrawn += -collDelta;
    if (debtDelta > 0) f.borrowed += debtDelta;
    else f.repaid += -debtDelta;
  }
  return f;
}

/** The eight leg names the summary states, which are exactly this reducer's own
 *  field names — chosen that way on the rails-server side so the merge needs no
 *  translation table to drift out of date. */
const OPENING_LEGS = [
  "deposited",
  "withdrawn",
  "collLiquidated",
  "collRedeemed",
  "borrowed",
  "repaid",
  "debtLiquidated",
  "debtRedeemed",
] as const;

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * loaded rows replayed on top.
 *
 * Pass the result to `computeLiquityV1Economics` as `precomputedLifetime`. The
 * two halves never overlap — the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it — so summing them is
 * addition and not reconciliation.
 *
 * ⚠️ EPOCH FIRST. A Liquity V1 wallet closes a Trove and opens another under
 * the same address, and each life is its own position: the page renders one
 * life, and `replayLifetime` already drops every loaded event belonging to
 * another. The summary's buckets carry the same epoch for the same reason, so
 * they are selected on it here. Merging across epochs would add a previous
 * Trove's deposits and draws into this one's lifetime — a plausible total that
 * is simply about a different position. With no life selected there is no
 * lifetime to state, so the layer is refused rather than guessed at.
 *
 * ⚠️ A bucket the summary cannot scale — no decimals for its leg — is NOT added
 * as zero, and does not merely drop its own leg: the whole lifetime layer is
 * refused. Liquity V1's two legs feed ONE joint reconcile gate (net flows
 * against the emitted balance on both axes), so a leg short by an unknown amount
 * would not quietly understate one bar — it would drag the gate, and with it
 * every bar the tower draws. A total short by an unknown amount is worse than no
 * total.
 */
export function liquityV1LifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  epoch: number | null,
): TroveFlows | undefined {
  if (!opening) return undefined;
  if (epoch == null) return undefined;

  // The window's own half, scoped by the SAME reducer the unwindowed page runs
  // — so the two halves cannot disagree about which life an event belongs to.
  const merged = replayLifetime(events, epoch);

  for (const bucket of opening.flows ?? []) {
    if (bucket.epoch !== epoch) continue;
    const scaled: Partial<Record<(typeof OPENING_LEGS)[number], number>> = {};
    for (const leg of OPENING_LEGS) {
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      scaled[leg] = value;
    }
    for (const leg of OPENING_LEGS) merged[leg] += scaled[leg] ?? 0;
  }

  return merged;
}

export function computeLiquityV1Economics(
  view: LiquityV1PositionView,
  events?: BaseActivityEvent[],
  chain?: LiquityV1PositionChainResponse | null,
  /** The merged lifetime of a windowed page — the opening balance plus the
   *  loaded rows, from `liquityV1LifetimeWithOpening`. Omitted (the default, and
   *  every unwindowed page) replays `events` alone, exactly as before. */
  precomputedLifetime?: TroveFlows,
): ChainTruthTowerData {
  // The protocol's own pricing: ETH at the PriceFeed price the chain read
  // delivered; LUSD at its $1 redemption face value. Null without the read.
  const ethPrice = chain && !chain.chainStale && chain.price > 0 ? chain.price : null;
  const usdOf = (symbol: string, amount: number): number | null =>
    symbol === DEBT_SYMBOL ? amount : ethPrice != null ? amount * ethPrice : null;

  const line = (
    key: string,
    symbol: string,
    amount: number,
    prov: TowerLine["prov"],
    flowLabel?: string,
    flowKind?: TowerLine["flowKind"],
  ): TowerLine => ({
    key,
    symbol,
    amount,
    usd: usdOf(symbol, amount),
    prov,
    ...(flowLabel ? { flowLabel } : {}),
    ...(flowKind ? { flowKind } : {}),
  });

  const collateral: TowerLine[] =
    view.collateral > 0 ? [line("ETH", COLLATERAL_SYMBOL, view.collateral, positionCollateralProv(view.atBlock))] : [];
  const debt: TowerLine[] = view.debt > 0 ? [line("LUSD", DEBT_SYMBOL, view.debt, positionDebtProv(view.atBlock))] : [];

  // ── Lifetime layer — only when the replayed flows reconcile to the current
  //    emitted balances (a partial capture must not pose as all-time truth). ──
  const f = precomputedLifetime ?? (events && events.length > 0 ? replayLifetime(events, view.epoch ?? null) : null);
  const reconciles =
    f != null &&
    flowsReconcile(
      f.deposited - f.withdrawn - f.collLiquidated - f.collRedeemed - f.collSurplus,
      view.collateral,
      f.deposited + f.withdrawn + f.collLiquidated + f.collRedeemed + f.collSurplus,
    ) &&
    flowsReconcile(
      f.borrowed - f.repaid - f.debtLiquidated - f.debtRedeemed,
      view.debt,
      f.borrowed + f.repaid + f.debtLiquidated + f.debtRedeemed,
    );

  const flowLine = (
    amount: number,
    symbol: string,
    key: string,
    flow: Parameters<typeof lifetimeFlowProv>[0],
    label?: string,
    flowKind?: TowerLine["flowKind"],
  ): TowerLine[] =>
    reconciles && amount > DUST ? [line(key, symbol, amount, lifetimeFlowProv(flow), label, flowKind)] : [];

  const collExited = [
    ...flowLine(f?.withdrawn ?? 0, COLLATERAL_SYMBOL, "coll-withdrawn", "withdrawn"),
    ...flowLine(f?.collSurplus ?? 0, COLLATERAL_SYMBOL, "coll-surplus", "surplus collateral", "To surplus pool"),
  ];
  const collLiquidated = [
    ...flowLine(f?.collLiquidated ?? 0, COLLATERAL_SYMBOL, "coll-liq", "liquidated collateral", LIQUIDATION_COLL_VERB),
    ...flowLine(
      f?.collRedeemed ?? 0,
      COLLATERAL_SYMBOL,
      "coll-redeemed",
      "redeemed collateral",
      "Redeemed",
      "redeemed",
    ),
  ];
  const debtExited = flowLine(f?.repaid ?? 0, DEBT_SYMBOL, "debt-repaid", "repaid");
  const debtLiquidated = [
    ...flowLine(f?.debtLiquidated ?? 0, DEBT_SYMBOL, "debt-liq", "liquidated debt", LIQUIDATION_DEBT_VERB),
    ...flowLine(f?.debtRedeemed ?? 0, DEBT_SYMBOL, "debt-redeemed", "redeemed debt", "Redeemed", "redeemed"),
  ];

  // Value the tower only when EVERY contributing line is priced (the strict
  // per-total guard) — without the chain read the ETH lines are unpriced and
  // the tower stays in token mode.
  const contributing = [...collateral, ...debt, ...collExited, ...collLiquidated, ...debtExited, ...debtLiquidated];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  const inflow = (amount: number, symbol: string): number => {
    if (!reconciles || amount <= DUST) return 0;
    return valued ? (usdOf(symbol, amount) ?? 0) : amount;
  };

  return {
    valued,
    // The protocol's own PriceFeed (ETH) + redemption face value (LUSD) →
    // chain-derived, so the USD bars survive the on-chain-only view.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collateral,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: inflow(f?.deposited ?? 0, COLLATERAL_SYMBOL),
    },
    debt: {
      current: debt,
      interest: null,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: inflow(f?.borrowed ?? 0, DEBT_SYMBOL),
    },
    collateralListLabel: "Collateral · ETH",
    debtListLabel: "Debt · LUSD",
    interestNote: valued
      ? `Liquity V1 charges no interest, so the LUSD figure is the Trove's whole debt: the LUSD received, the one-time borrowing fees, the 200 LUSD liquidation reserve, and any debt shared out to it from liquidations the Stability Pool could not cover. ETH is valued at today's PriceFeed price of $${(ethPrice as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, LUSD at $1.`
      : "Liquity V1 charges no interest, so the LUSD figure is the Trove's whole debt: the LUSD received, the one-time borrowing fees, the 200 LUSD liquidation reserve, and any debt shared out to it from liquidations the Stability Pool could not cover. Dollar values appear once the PriceFeed's ETH price has loaded.",
  };
}

/** A Trove life's redemptions, from the rows that carry a price: the LUSD the
 *  redeemers paid in, the ETH they took, and that ETH's value at each
 *  redemption's PriceFeed price. Null when there were none, or when a row is
 *  unpriced (a partial sum would state the wrong outcome). */
export interface LiquityV1RedemptionTotals {
  count: number;
  lusdRedeemed: number;
  ethTaken: number;
  ethValueAtRedemption: number;
  /** Reserves burned by full redemptions (LUSD). */
  reserveBurned: number;
}

export function liquityV1RedemptionTotals(
  events: BaseActivityEvent[] | undefined,
  epoch: number | null,
): LiquityV1RedemptionTotals | null {
  if (!events) return null;
  const t: LiquityV1RedemptionTotals = {
    count: 0,
    lusdRedeemed: 0,
    ethTaken: 0,
    ethValueAtRedemption: 0,
    reserveBurned: 0,
  };
  for (const ev of events) {
    if (!isLiquityV1Event(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.eventType !== "redemption") continue;
    if (epoch != null && ctx.epoch != null && ctx.epoch !== epoch) continue;
    const split = redemptionSplit(ctx);
    if (!split) return null;
    t.count += 1;
    t.lusdRedeemed += split.lusdRedeemed;
    t.ethTaken += split.ethToRedeemer;
    t.ethValueAtRedemption += split.ethToRedeemer * split.price;
    t.reserveBurned += split.reserveBurned;
  }
  return t.count > 0 ? t : null;
}
