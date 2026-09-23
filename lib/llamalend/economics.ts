// LlamaLend economics reduction — the dual tower with lifetime flows.
// ----------------------------------------------------------------------------
// Current lines are the live user_state legs when the chain read landed, and
// the last emitted UserState absolutes otherwise — the provenance asserts
// which basis each line carries. The COLLATERAL side has up to two lines:
// what still sits as collateral (collateral token) and what the AMM has
// already converted (borrowed token, soft-liquidation) — both are the user's
// holdings inside the AMM, and the converted line exists ONLY when the chain
// overlay landed (it lives in no event; absence of the read renders nothing,
// never zero).
//
// Lifetime flows replay the events' own emitted deltas, bucketed by event
// type. ⚠️ The Liquidate-paired Repay is already deduped in the index, so
// nothing double-counts. There is deliberately NO principal-vs-interest
// split: debt accrues per second into the Controller's accounting, and an
// exact split would need the rate integral at each event — nothing is
// estimated in its place.
//
// USD ONLY on crvUSD-borrowed markets (~$1): debt is already in crvUSD;
// collateral values through the AMM's own price_oracle (needs the overlay).
// The non-crvUSD markets keep their own token — the strict guard drops the
// tower to token lines rather than assert a dollar that was never read.

import type { LlamalendPositionView } from "@/components/protocol/llamalend/llamalend-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import { positionStateProv, positionIndexProv, llamalendLifetimeFlowProv } from "@/lib/llamalend/event-provenance";
import { llamalendConvertedProv } from "@/lib/llamalend/live-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-12;

interface LifetimeFlows {
  collateralAdded: number;
  collateralWithdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  collateralTaken: number;
  /** Already-converted borrowed token taken in hard liquidations — the AMM
   *  holding's other leg (the log's stablecoin_received), seized alongside
   *  the collateral. */
  convertedTaken: number;
}

function replayLlamalendLifetime(events: BaseActivityEvent[]): LifetimeFlows {
  const f: LifetimeFlows = {
    collateralAdded: 0,
    collateralWithdrawn: 0,
    borrowed: 0,
    repaid: 0,
    liquidatedDebt: 0,
    collateralTaken: 0,
    convertedTaken: 0,
  };
  for (const ev of events) {
    if (!isLlamalendEvent(ev)) continue;
    const ctx = ev.context.data;
    const coll = Number(ctx.collateralDelta ?? "0");
    const debt = Number(ctx.debtDelta ?? "0");
    // A liquidator-side row narrates the subject ACTING on someone else's
    // position — not this position's own flows; it never buckets here.
    if (ctx.role === "liquidator") continue;
    if (ctx.eventType === "liquidation") {
      // Self-liquidations are a normal close: the debt clears as a repay and
      // the remaining collateral as a withdrawal; third-party liquidations
      // get the loss buckets.
      if (ctx.selfLiquidation || ctx.role === "self") {
        if (Number.isFinite(debt) && debt < 0) f.repaid += -debt;
        if (Number.isFinite(coll) && coll < 0) f.collateralWithdrawn += -coll;
      } else {
        if (Number.isFinite(debt) && debt !== 0) f.liquidatedDebt += Math.abs(debt);
        if (Number.isFinite(coll) && coll !== 0) f.collateralTaken += Math.abs(coll);
        // A hard liquidation seizes the AMM holding's OTHER leg too — the
        // already-converted borrowed token (stablecoin_received).
        const taken = Number(ctx.convertedTaken ?? "0");
        if (Number.isFinite(taken) && taken > 0) f.convertedTaken += taken;
      }
      continue;
    }
    if (Number.isFinite(coll) && coll !== 0) {
      if (coll > 0) f.collateralAdded += coll;
      else f.collateralWithdrawn += -coll;
    }
    if (Number.isFinite(debt) && debt !== 0) {
      if (debt > 0) f.borrowed += debt;
      else f.repaid += -debt;
    }
  }
  return f;
}

/** Which token each lifetime leg is denominated in. The summary's one flow
 *  bucket is keyed by controller and carries BOTH tokens, so its `decimals`
 *  is null by design and the merge scales each leg with the decimals the view
 *  already carries for the pair. */
const COLLATERAL_LEGS = new Set(["collateralAdded", "collateralWithdrawn", "collateralTaken"]);

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation. The leg names are the LifetimeFlows fields verbatim
 * (rails-server's flowsSql restates replayLlamalendLifetime branch for
 * branch, self-liquidations and the liquidator-leg exclusion included), so
 * the merge needs no translation table. A leg that cannot be scaled returns
 * undefined for the WHOLE layer: a lifetime figure short by whatever the
 * summarised part held is a wrong answer, not a partial one.
 */
export function llamalendLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  decimals: { collateral: number; borrowed: number },
): LifetimeFlows | undefined {
  if (!opening) return undefined;
  const f = replayLlamalendLifetime(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f)) continue;
      const value = scaleBaseUnits(raw, COLLATERAL_LEGS.has(leg) ? decimals.collateral : decimals.borrowed);
      if (value == null) return undefined;
      f[leg as keyof LifetimeFlows] += value;
    }
  }
  return f;
}

export function computeLlamalendEconomics(
  view: LlamalendPositionView,
  events?: BaseActivityEvent[],
  /** The merged whole-history flows on a windowed page (see
   *  llamalendLifetimeWithOpening). Present, it IS the lifetime layer and
   *  `events` takes no part in it; absent, the events replay as they always
   *  did. A windowed page whose opening balance has not arrived passes
   *  NEITHER — the lifetime layer states nothing rather than a window's
   *  arithmetic. */
  precomputedLifetime?: LifetimeFlows,
): ChainTruthTowerData {
  const isCrvusd = view.borrowedIsCrvusd;
  const price = view.priceOracle; // borrowed per collateral (chain overlay)
  const collUsd = (amount: number): number | null => (isCrvusd && price != null ? amount * price : null);
  const debtUsd = (amount: number): number | null => (isCrvusd ? amount : null);

  const chainBasis = view.stateBasis === "chain";
  const collProv = chainBasis
    ? positionStateProv(view.collateralSymbol, "collateral", view.controller)
    : positionIndexProv(view.collateralSymbol, "collateral", view.controller);
  const debtProv = chainBasis
    ? positionStateProv(view.borrowedSymbol, "debt", view.controller)
    : positionIndexProv(view.borrowedSymbol, "debt", view.controller);

  const collateralLines: TowerLine[] = [];
  // ⚠️ null collateral = the chain did not state it (sentinel path) — no
  // line renders, never a zero.
  if (view.collateral != null && view.collateral > DUST) {
    collateralLines.push({
      key: "collateral",
      symbol: view.collateralSymbol,
      amount: view.collateral,
      usd: collUsd(view.collateral),
      prov: collProv,
    });
  }
  // The converted line — soft-liquidation holdings, chain-only.
  if (view.converted != null && view.converted > DUST) {
    collateralLines.push({
      key: "converted",
      symbol: `${view.borrowedSymbol} (converted)`,
      amount: view.converted,
      usd: debtUsd(view.converted),
      prov: llamalendConvertedProv(
        view.borrowedSymbol,
        view.convertedCrossCheckExact ?? null,
        view.controller,
        view.amm ?? undefined,
      ),
    });
  }

  const debtLines: TowerLine[] =
    view.debt > DUST
      ? [
          {
            key: "debt",
            symbol: view.borrowedSymbol,
            amount: view.debt,
            usd: debtUsd(view.debt),
            prov: debtProv,
          },
        ]
      : [];

  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayLlamalendLifetime(events) : null);
  const flowLine = (
    amount: number,
    symbol: string,
    usd: number | null,
    flow: Parameters<typeof llamalendLifetimeFlowProv>[0],
    key: string,
  ): TowerLine[] =>
    amount > DUST ? [{ key, symbol, amount, usd, prov: llamalendLifetimeFlowProv(flow, symbol, view.controller) }] : [];

  const collExited = lifetime
    ? flowLine(
        lifetime.collateralWithdrawn,
        view.collateralSymbol,
        collUsd(lifetime.collateralWithdrawn),
        "collateral withdrawn",
        "coll-withdrawn",
      )
    : [];
  const collLiquidated = lifetime
    ? [
        ...flowLine(
          lifetime.collateralTaken,
          view.collateralSymbol,
          collUsd(lifetime.collateralTaken),
          "collateral taken",
          "coll-taken",
        ),
        // The AMM holding's other leg — already-converted borrowed token,
        // seized in the same liquidations (the log's stablecoin_received).
        ...flowLine(
          lifetime.convertedTaken,
          view.borrowedSymbol,
          debtUsd(lifetime.convertedTaken),
          "collateral taken",
          "converted-taken",
        ),
      ]
    : [];
  const debtExited = lifetime
    ? flowLine(lifetime.repaid, view.borrowedSymbol, debtUsd(lifetime.repaid), "repaid", "debt-repaid")
    : [];
  const debtLiquidated = lifetime
    ? flowLine(
        lifetime.liquidatedDebt,
        view.borrowedSymbol,
        debtUsd(lifetime.liquidatedDebt),
        "liquidated debt",
        "debt-liq",
      )
    : [];

  // Value the tower only when EVERY contributing line carries USD — the
  // strict guard: a non-crvUSD market (or a missing oracle read) drops the
  // whole tower to token lines rather than assert a partial dollar.
  const contributing = [
    ...collateralLines,
    ...debtLines,
    ...collExited,
    ...collLiquidated,
    ...debtExited,
    ...debtLiquidated,
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  const inflow = (amount: number, usd: number | null): number => {
    if (amount <= DUST) return 0;
    return valued ? (usd ?? 0) : amount;
  };

  return {
    valued,
    // crvUSD (~$1) through the AMM's own oracle → chain-derived; survives
    // the render gate.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collateralLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      lifetimeInflow: lifetime ? inflow(lifetime.collateralAdded, collUsd(lifetime.collateralAdded)) : 0,
    },
    debt: {
      current: debtLines,
      interest: null,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: lifetime ? inflow(lifetime.borrowed, debtUsd(lifetime.borrowed)) : 0,
    },
    interestNote: `Current figures are the position's live balances where the latest read landed, and its last recorded balances otherwise; each line's receipt says which. Debt grows every second, so no stored figure stays current for long. The "(converted)" collateral line is the soft-liquidation surface — collateral the AMM has already turned into ${view.borrowedSymbol}, a live balance that no past event records. The lifetime flows add up the position's own transactions, so interest that built up between events isn't counted there, and no split between principal and interest is drawn.${
      view.borrowedIsCrvusd
        ? " This market's debt is crvUSD, worth about a dollar, so the dollar figures use the market's own prices."
        : ` This market borrows ${view.borrowedSymbol}, not a dollar stablecoin — amounts stay in their own tokens and no dollar value is shown.`
    }`,
  };
}
