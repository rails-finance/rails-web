// Fluid economics reduction — the amounts-only dual tower with lifetime flows.
// ----------------------------------------------------------------------------
// A Fluid position lives in ONE vault, so each side is a single token: the
// collateral tower in the vault's supply token, the debt tower in its borrow
// token (smart-vault legs render as DEX shares). No USD at this depth — the
// two towers are NOT height-comparable and the component labels them so (the
// Spark amounts-only mode; an oracle lane is a later layer).
//
// Current lines are the settled overlay when present (the resolver's own math
// at a stamped block: liquidations + accrued interest applied) and the Σ
// replay otherwise — the provenance names which basis each line carries. With
// the position's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid segments and the faded
// lifetime-inflow bar from the operate deltas (composites contribute both
// legs), plus the liquidated buckets from the attribution rows — seized
// collateral and cleared debt as the difference of each row's settled
// boundary reads (exact, partial-liquidation math included). The
// principal-vs-accrued interest split is NOT asserted: the Σ lane is
// interest-blind between events, so an "interest" segment would be the
// settled−Σ gap, which also carries liquidation dust — `interestNote` says so
// instead.
//
// On a WINDOWED page the event stream is only the most recent slice, so the
// lifetime layer arrives pre-merged instead: `fluidLifetimeWithOpening` seeds
// the opening balance below the cut and adds the loaded rows on top, and
// `precomputedLifetime` carries it in. A leg that merge cannot state is null,
// not zero.

import type { FluidPositionView } from "@/components/protocol/fluid/fluid-position-card";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFluidEvent } from "@/lib/shared/types/event-shape";
import { settledNowProv, positionSigmaProv, fluidLifetimeFlowProv } from "@/lib/fluid/event-provenance";
import { poolShareLabel } from "@/lib/fluid/asset-catalog";
import { liveSettledProv } from "@/lib/fluid/live-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Lifetime gross flows on the position's two legs, replayed from its own
 *  events. One vault per position, so one flows record — no per-market map. */
interface FluidFlows {
  deposited: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  seizedCollateral: number;
  liquidatedDebt: number;
}

/** The same six figures where one of them may be UNSTATABLE. A windowed page
 *  merges an opening balance into the replay, and a leg the opening balance
 *  cannot scale is null rather than zero — see `fluidLifetimeWithOpening`. */
export type FluidLifetimeFlows = { [K in keyof FluidFlows]: number | null };

/** The position's two legs, and which of the six figures each one owns. The
 *  keys are rails-server's own bucket keys and the leg names are the field
 *  names above, chosen on that side to be exactly these so the merge needs no
 *  translation table to drift out of date. */
const OPENING_LEGS = {
  collateral: ["deposited", "withdrawn", "seizedCollateral"],
  debt: ["borrowed", "repaid", "liquidatedDebt"],
} as const satisfies Record<string, readonly (keyof FluidFlows)[]>;

function replayFluidLifetime(events: BaseActivityEvent[]): FluidFlows {
  const f: FluidFlows = { deposited: 0, withdrawn: 0, borrowed: 0, repaid: 0, seizedCollateral: 0, liquidatedDebt: 0 };
  for (const ev of events) {
    if (!isFluidEvent(ev)) continue;
    const ctx = ev.context.data;
    // Liquidation attribution rows: the impact is the difference of the row's
    // own settled boundary reads — the operate buckets never see it, so the
    // voluntary and involuntary flows stay exclusive by construction.
    if (ctx.eventType === "liquidated" || ctx.eventType === "absorbed") {
      const seized = Number(ctx.liqSupplyBefore ?? "0") - Number(ctx.liqSupplyAfter ?? "0");
      const cleared = Number(ctx.liqBorrowBefore ?? "0") - Number(ctx.liqBorrowAfter ?? "0");
      if (Number.isFinite(seized) && seized > 0) f.seizedCollateral += seized;
      if (Number.isFinite(cleared) && cleared > 0) f.liquidatedDebt += cleared;
      continue;
    }
    if (ctx.eventType === "mint" || ctx.eventType === "transfer") continue; // NFT lane, no token amount
    // Operate deltas — composites carry both legs, each bucketed by its sign.
    const col = Number(ctx.colDelta ?? "0");
    if (Number.isFinite(col) && col !== 0) {
      if (col > 0) f.deposited += col;
      else f.withdrawn += -col;
    }
    const debt = Number(ctx.debtDelta ?? "0");
    if (Number.isFinite(debt) && debt !== 0) {
      if (debt > 0) f.borrowed += debt;
      else f.repaid += -debt;
    }
  }
  return f;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * loaded rows added on top.
 *
 * Pass the result to `computeFluidEconomics` as `precomputedLifetime`. The two
 * halves never overlap — the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it — so putting them
 * together is addition and not reconciliation.
 *
 * Fluid's flow vocabulary is its own: a position is one vault's collateral
 * against its debt for its whole life, so there is no per-asset map to merge,
 * just the two legs and the six gross figures the replay already keeps.
 * rails-server buckets by the SIGN of each operate delta and reads the
 * liquidation rows' own settled boundary, exactly as `replayFluidLifetime`
 * does either side of the cut, so voluntary and involuntary flows stay
 * exclusive across the line as well as within each half.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for it — is NOT added
 * as zero. Its whole side leaves the lifetime layer, the window's own
 * contribution included, so the tower shows nothing for that side rather than a
 * total short by whatever the summarised part held. A vault the index does not
 * know is exactly the case that must not read as zero.
 */
export function fluidLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): FluidLifetimeFlows | undefined {
  if (!opening) return undefined;
  // No flow histogram at all: the summarised half moved amounts this response
  // cannot state, so NOTHING lifetime can be stated. Reducing the window alone
  // here would be the one thing the checkpoint model exists to prevent.
  if (!opening.flows) {
    const unstatable = {} as FluidLifetimeFlows;
    for (const legs of Object.values(OPENING_LEGS)) for (const leg of legs) unstatable[leg] = null;
    return unstatable;
  }

  const merged: FluidLifetimeFlows = { ...replayFluidLifetime(events) };
  for (const [side, legs] of Object.entries(OPENING_LEGS) as [
    keyof typeof OPENING_LEGS,
    readonly (keyof FluidFlows)[],
  ][]) {
    const bucket = opening.flows.find((f) => f.key === side);
    // No bucket is a real zero: rails-server groups over the rows below the
    // cut, so a leg that never moved down there has nothing to group.
    if (!bucket) continue;
    const scaled = new Map<keyof FluidFlows, number>();
    let scalable = true;
    for (const leg of legs) {
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) {
        scalable = false;
        break;
      }
      scaled.set(leg, value);
    }
    // The refusal: the side goes unknown whole, not short.
    if (!scalable) {
      for (const leg of legs) merged[leg] = null;
      continue;
    }
    for (const leg of legs) merged[leg] = (merged[leg] ?? 0) + (scaled.get(leg) ?? 0);
  }
  return merged;
}

export function computeFluidEconomics(
  view: FluidPositionView,
  events?: BaseActivityEvent[],
  chain?: FluidPositionChainResponse | null,
  /** A lifetime already merged across a window's cut — see
   *  `fluidLifetimeWithOpening`. Omitted, the replay over `events` stands, which
   *  is what every unwindowed position does and did. */
  precomputedLifetime?: FluidLifetimeFlows,
): ChainTruthTowerData {
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  // Leg names by lane: the index's symbol, the chain read's (it names token
  // legs the index left blank), the pool pair a smart leg is shares OF —
  // chain-read first, then the indexed roster's copy of the same identity.
  const supplySym =
    view.supplySymbol ??
    live?.supplySymbol ??
    poolShareLabel(live?.supplyPoolPair) ??
    poolShareLabel(view.supplyPoolPair) ??
    "DEX shares";
  const borrowSym =
    view.borrowSymbol ??
    live?.borrowSymbol ??
    poolShareLabel(live?.borrowPoolPair) ??
    poolShareLabel(view.borrowPoolPair) ??
    "DEX shares";

  // Current lines, by lane strength: the page's LIVE resolver read at head
  // when it landed, the worker's stamped settled overlay next, the Σ replay
  // last — the provenance asserts which basis each line carries.
  const currentLine = (side: "supply" | "borrow"): TowerLine[] => {
    const sym = side === "supply" ? supplySym : borrowSym;
    const settled = view.settled ? (side === "supply" ? view.settled.supply : view.settled.borrow) : null;
    const liveExact = live != null ? (side === "supply" ? live.supplyExact : live.borrowExact) : null;
    const amount = Number(liveExact ?? settled ?? (side === "supply" ? view.colNet : view.debtNet));
    if (!Number.isFinite(amount) || amount <= DUST) return [];
    return [
      {
        key: `${side}-current`,
        symbol: sym,
        amount,
        usd: null,
        prov:
          liveExact != null
            ? liveSettledProv(side, sym, live?.blockNumber)
            : settled != null
              ? settledNowProv(side, sym, view.settled?.updatedBlock)
              : positionSigmaProv(side, sym),
      },
    ];
  };

  const supplyLines = currentLine("supply");
  const debtLines = currentLine("borrow");

  // ── Lifetime layer (needs the event stream) ────────────────────────────────
  const lifetime: FluidLifetimeFlows | null =
    precomputedLifetime ?? (events && events.length > 0 ? replayFluidLifetime(events) : null);
  const flowLine = (
    amount: number | null,
    flow: "withdrawn" | "repaid" | "seized collateral" | "liquidated debt",
    sym: string,
    key: string,
  ): TowerLine[] =>
    lifetime && amount != null && amount > DUST
      ? [{ key, symbol: sym, amount, usd: null, prov: fluidLifetimeFlowProv(flow, sym) }]
      : [];

  const collExited = flowLine(lifetime?.withdrawn ?? null, "withdrawn", supplySym, "coll-withdrawn");
  const collLiquidated = flowLine(lifetime?.seizedCollateral ?? null, "seized collateral", supplySym, "coll-liq");
  const debtExited = flowLine(lifetime?.repaid ?? null, "repaid", borrowSym, "debt-repaid");
  const debtLiquidated = flowLine(lifetime?.liquidatedDebt ?? null, "liquidated debt", borrowSym, "debt-liq");

  return {
    valued: false, // no oracle at this depth — token amounts only, per side
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: collLiquidated,
      // An unstatable leg reads 0 here, and that is the refusal rather than a
      // figure: the tower's only way to say nothing about a side's lifetime is
      // to draw no inflow bar, and with its exited and liquidated lines empty
      // the side drops out of the lifetime layer altogether.
      lifetimeInflow: lifetime?.deposited ?? 0,
    },
    debt: {
      current: debtLines,
      interest: null,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: lifetime?.borrowed ?? 0,
    },
    collateralUnit: supplySym,
    debtUnit: borrowSym,
    // The settled read already includes accrued interest, so the gated list's
    // default "· principal" caption would misname it.
    collateralListLabel: view.settled || live ? "Collateral · current" : undefined,
    debtListLabel: view.settled || live ? "Debt · current" : undefined,
    interestNote: live
      ? "Current figures are read live from the vault — every liquidation and all interest accrued so far is included. The lifetime flows add up the position's own transactions, so interest that built up between events isn't counted there — that's why no principal-vs-interest split is shown. Fluid uses no dollar prices: each side is shown in its own token, and the vault's oracle prices the pair in the debt token."
      : view.settled
        ? "Current figures are the vault's own totals as of the stamped time, liquidations and accrued interest included. The lifetime flows add up the position's own transactions, so interest that built up between events isn't counted there — that's why no principal-vs-interest split is shown. Fluid uses no dollar prices: each side is shown in its own token."
        : "Figures add up the position's own transactions, including liquidations. Interest that builds up between events isn't counted, so totals can run slightly behind the vault's own books. Fluid uses no dollar prices: each side is shown in its own token.",
  };
}
