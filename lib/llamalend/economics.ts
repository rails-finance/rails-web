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
import {
  positionStateProv,
  positionIndexProv,
  llamalendLifetimeFlowProv,
  llamalendLostProv,
  llamalendSoldBeforeLiqProv,
  llamalendConvertedInProv,
  llamalendNetBorrowedProv,
  llamalendAccruedInterestProv,
  llamalendInterestPaidProv,
} from "@/lib/llamalend/event-provenance";
import { llamalendConvertedProv } from "@/lib/llamalend/live-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-12;

export interface LifetimeFlows {
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

export function replayLlamalendLifetime(events: BaseActivityEvent[]): LifetimeFlows {
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

/**
 * Collateral the AMM sold and did not buy back over the position's life:
 * deposited − withdrawn − held now. Stated only where every other way out is
 * zero and the rest is known: an open position with the live read landed,
 * nothing converted at head (a converted balance still holds part of it as
 * the borrowed token), and no hard liquidation (which takes the converted
 * leg with it). A gap within the AMM's rounding is none.
 */
export function llamalendLostToSoftLiq(view: LlamalendPositionView, lifetime: LifetimeFlows | null | undefined) {
  if (!lifetime || view.status !== "open" || view.stateBasis !== "chain" || view.collateral == null) return null;
  if (view.converted == null || view.converted > DUST) return null;
  if (view.liquidationCount > 0 || lifetime.collateralTaken > DUST || lifetime.convertedTaken > DUST) return null;
  const gap = lifetime.collateralAdded - lifetime.collateralWithdrawn - view.collateral;
  if (gap <= Math.max(lifetime.collateralAdded * 1e-9, DUST)) return null;
  return gap;
}

/**
 * Collateral the AMM has sold net of buy-backs on a position in its bands now:
 * deposited − withdrawn − held. The converted balance at head is what it holds
 * for it. Stated only on an open position with the live read landed, something
 * converted, and no hard liquidation (which takes the converted leg with it).
 */
export function llamalendSoldInBands(view: LlamalendPositionView, lifetime: LifetimeFlows | null | undefined) {
  if (!lifetime || view.status !== "open" || view.stateBasis !== "chain" || view.collateral == null) return null;
  if (view.converted == null || view.converted <= DUST) return null;
  if (view.liquidationCount > 0 || lifetime.collateralTaken > DUST || lifetime.convertedTaken > DUST) return null;
  const gap = lifetime.collateralAdded - lifetime.collateralWithdrawn - view.collateral;
  if (gap <= Math.max(lifetime.collateralAdded * 1e-9, DUST)) return null;
  return gap;
}

/**
 * On a position with hard liquidations, the collateral side as a ledger in
 * each token: what the AMM sold net of buy-backs (deposited − withdrawn −
 * taken − held) and the borrowed token those sales left in the position
 * (converted taken + converted held). Deposited + converted in then equals
 * held + withdrawn + sold + taken, token by token. A closed loan holds 0 of
 * both; an open one needs the live read.
 */
export function llamalendLiquidatedLedger(view: LlamalendPositionView, lifetime: LifetimeFlows | null | undefined) {
  if (!lifetime || (lifetime.collateralTaken <= DUST && lifetime.convertedTaken <= DUST)) return null;
  const closed = view.status !== "open";
  const heldColl = closed ? 0 : view.stateBasis === "chain" ? view.collateral : null;
  const heldConv = closed ? 0 : view.stateBasis === "chain" ? view.converted : null;
  if (heldColl == null || heldConv == null) return null;
  const sold = lifetime.collateralAdded - lifetime.collateralWithdrawn - lifetime.collateralTaken - heldColl;
  const convertedIn = lifetime.convertedTaken + heldConv;
  if (sold <= Math.max(lifetime.collateralAdded * 1e-9, DUST) || convertedIn <= DUST) return null;
  return { sold, convertedIn };
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
  /** The two tokens' contracts (from the events' flows), for the icon chips. */
  addresses?: { collateral?: string; borrowed?: string },
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
      groupLabel: `${view.collateralSymbol} and converted ${view.borrowedSymbol}`,
    });
  }
  // The converted line — soft-liquidation holdings, chain-only.
  if (view.converted != null && view.converted > DUST) {
    collateralLines.push({
      key: "converted",
      symbol: `${view.borrowedSymbol} (converted)`,
      amount: view.converted,
      usd: debtUsd(view.converted),
      groupLabel: `${view.collateralSymbol} and converted ${view.borrowedSymbol}`,
      prov: llamalendConvertedProv(
        view.borrowedSymbol,
        view.convertedCrossCheckExact ?? null,
        view.controller,
        view.amm ?? undefined,
      ),
    });
  }

  const lifetime = precomputedLifetime ?? (events && events.length > 0 ? replayLlamalendLifetime(events) : null);
  // Once the events say what was drawn and not repaid, the debt line is that
  // net and the interest that built up on it is its own line; the "Current
  // debt" total is their sum. Where the events cannot say (no lifetime, or the
  // repayments already exceed the draws) the line stays the whole debt.
  const netBorrowed = lifetime ? lifetime.borrowed - lifetime.repaid - lifetime.liquidatedDebt : null;
  const accrued = netBorrowed != null ? view.debt - netBorrowed : null;
  const splitInterest =
    netBorrowed != null && accrued != null && netBorrowed > DUST && accrued > Math.max(DUST, netBorrowed * 1e-9);
  const debtLines: TowerLine[] =
    view.debt > DUST
      ? [
          splitInterest
            ? {
                key: "debt",
                symbol: view.borrowedSymbol,
                amount: netBorrowed,
                usd: debtUsd(netBorrowed),
                prov: llamalendNetBorrowedProv(view.borrowedSymbol, view.controller),
                heldLabel: "Net borrowed",
              }
            : {
                key: "debt",
                symbol: view.borrowedSymbol,
                amount: view.debt,
                usd: debtUsd(view.debt),
                prov: debtProv,
              },
        ]
      : [];
  const debtInterest: TowerLine | null = splitInterest
    ? {
        key: "interest-accrued",
        symbol: view.borrowedSymbol,
        amount: accrued,
        usd: debtUsd(accrued),
        prov: llamalendAccruedInterestProv(view.borrowedSymbol, view.controller),
      }
    : null;
  // A loan closed by repayment alone returned more than it drew: the excess is
  // the interest it paid.
  const interestPaid =
    lifetime && view.debt <= DUST && view.status === "closed" && lifetime.liquidatedDebt <= DUST
      ? lifetime.repaid - lifetime.borrowed
      : 0;
  const debtCosts: TowerLine[] =
    lifetime && interestPaid > Math.max(DUST, lifetime.borrowed * 1e-9)
      ? [
          {
            key: "debt-interest-paid",
            symbol: view.borrowedSymbol,
            amount: interestPaid,
            usd: debtUsd(interestPaid),
            prov: llamalendInterestPaidProv(view.borrowedSymbol, view.controller),
            flowLabel: "Interest paid",
          },
        ]
      : [];
  const flowLine = (
    amount: number,
    symbol: string,
    usd: number | null,
    flow: Parameters<typeof llamalendLifetimeFlowProv>[0],
    key: string,
  ): TowerLine[] =>
    amount > DUST ? [{ key, symbol, amount, usd, prov: llamalendLifetimeFlowProv(flow, symbol, view.controller) }] : [];

  const lost = llamalendLostToSoftLiq(view, lifetime);
  const ledger = llamalendLiquidatedLedger(view, lifetime);
  // The borrowed token the AMM's sales put into the position: a "+" row under
  // Deposited, so the side reconciles in each token.
  const collReceived: TowerLine[] = ledger
    ? [
        {
          key: "converted-in",
          symbol: view.borrowedSymbol,
          amount: ledger.convertedIn,
          usd: debtUsd(ledger.convertedIn),
          prov: llamalendConvertedInProv(view.borrowedSymbol, view.controller),
          flowLabel: "Converted by the AMM",
          tipLabel: "Converted by the AMM",
        },
      ]
    : [];
  const collExited = lifetime
    ? [
        ...flowLine(
          lifetime.collateralWithdrawn,
          view.collateralSymbol,
          collUsd(lifetime.collateralWithdrawn),
          "collateral withdrawn",
          "coll-withdrawn",
        ),
        // What the AMM sold and did not buy back, so deposited = held +
        // withdrawn + lost.
        ...(lost != null
          ? [
              {
                key: "coll-lost",
                symbol: view.collateralSymbol,
                amount: lost,
                usd: collUsd(lost),
                prov: llamalendLostProv(view.collateralSymbol, view.controller),
                flowLabel: "Lost to soft-liquidation",
                flowKind: "external" as const,
              },
            ]
          : []),
        ...(ledger
          ? [
              {
                key: "coll-sold",
                symbol: view.collateralSymbol,
                amount: ledger.sold,
                usd: collUsd(ledger.sold),
                prov: llamalendSoldBeforeLiqProv(view.collateralSymbol, view.controller),
                flowLabel: "Sold by the AMM",
                flowKind: "external" as const,
              },
            ]
          : []),
      ]
    : [];
  // Each leg keeps its own row (distinct captions never merge): the
  // collateral taken, and the converted borrowed token taken with it (the
  // log's stablecoin_received).
  const collLiquidated = lifetime
    ? [
        ...flowLine(
          lifetime.collateralTaken,
          view.collateralSymbol,
          collUsd(lifetime.collateralTaken),
          "collateral taken",
          "coll-taken",
        ).map((l) => ({ ...l, flowLabel: "Taken in liquidation" })),
        ...flowLine(
          lifetime.convertedTaken,
          view.borrowedSymbol,
          debtUsd(lifetime.convertedTaken),
          "collateral taken",
          "converted-taken",
        ).map((l) => ({ ...l, flowLabel: "Converted, taken in liquidation" })),
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
  // The deposit row names its token: the side's other lines can speak a
  // second one (the converted borrowed token), and the row's chip would
  // otherwise follow them.
  const collInflowLines: TowerLine[] =
    lifetime && lifetime.collateralAdded > DUST
      ? [
          {
            key: "coll-deposited",
            symbol: view.collateralSymbol,
            amount: lifetime.collateralAdded,
            usd: collUsd(lifetime.collateralAdded),
            prov: llamalendLifetimeFlowProv("collateral added", view.collateralSymbol, view.controller),
          },
        ]
      : [];
  const contributing = [
    ...collInflowLines,
    ...collReceived,
    ...collateralLines,
    ...debtLines,
    ...(debtInterest ? [debtInterest] : []),
    ...debtCosts,
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

  // Each segment's hover names what it is.
  const label = (lines: TowerLine[], text: string) => lines.forEach((l) => (l.tipLabel = text));
  collateralLines.forEach((l) => (l.tipLabel = l.key === "converted" ? "Converted" : "Collateral held"));
  label(debtLines, "Debt now");
  collExited.forEach(
    (l) =>
      (l.tipLabel =
        l.key === "coll-lost" ? "Lost to soft-liquidation" : l.key === "coll-sold" ? "Sold by the AMM" : "Withdrawn"),
  );
  collLiquidated.forEach(
    (l) => (l.tipLabel = l.key === "converted-taken" ? "Converted, taken in liquidation" : "Taken in liquidation"),
  );
  label(debtExited, "Repaid");
  label(debtLiquidated, "Cleared in liquidation");
  // Each line carries its token's contract, so the chip draws the token's mark.
  if (addresses) {
    for (const l of contributing) {
      const a =
        l.symbol === view.collateralSymbol
          ? addresses.collateral
          : l.symbol.startsWith(view.borrowedSymbol)
            ? addresses.borrowed
            : undefined;
      if (a && !l.address) l.address = a;
    }
  }

  return {
    valued,
    // The side counts the converted balance with the collateral token, so its
    // title says so where there is one.
    ...((view.converted != null && view.converted > DUST) || ledger
      ? { collateralTitle: "Collateral and converted" }
      : {}),
    // A row's label wraps and keeps its chip beside the last word.
    wrapFlowLabels: true,
    // crvUSD (~$1) through the AMM's own oracle → chain-derived; survives
    // the render gate.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: collateralLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      ...(collReceived.length > 0 ? { received: collReceived } : {}),
      ...(collInflowLines.length > 0 ? { inflowLines: collInflowLines } : {}),
      lifetimeInflow: lifetime ? inflow(lifetime.collateralAdded, collUsd(lifetime.collateralAdded)) : 0,
    },
    debt: {
      current: debtLines,
      interest: debtInterest,
      costs: debtCosts,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: lifetime ? inflow(lifetime.borrowed, debtUsd(lifetime.borrowed)) : 0,
    },
    interestNote: `Current figures are the position's live balances where the latest read landed, and its last recorded balances otherwise; each line's receipt says which. Debt grows every second, so no stored figure stays current for long. The "(converted)" collateral line is the soft-liquidation surface — collateral the AMM has already turned into ${view.borrowedSymbol}, a live balance that no past event records. The lifetime flows add up the position's own transactions. On an open loan, accrued interest is the debt now less what was borrowed and not repaid; on a loan closed by repayment, interest paid is what was repaid less what was borrowed.${
      view.borrowedIsCrvusd
        ? " This market's debt is crvUSD, worth about a dollar, so the dollar figures use the market's own prices."
        : ` This market borrows ${view.borrowedSymbol}, not a dollar stablecoin — amounts stay in their own tokens and no dollar value is shown.`
    }`,
  };
}
