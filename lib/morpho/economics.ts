// Morpho economics reducer — the amounts-only twin of the Maker tower.
// ----------------------------------------------------------------------------
// Morpho has no oracle at this tier, so the tower is drawn in token units, not
// USD. That's fine for the faithful artifact: interest accrues in the SAME loan
// token as principal, so the debt split (principal vs accrued interest) stacks
// without a price. Collateral is a separate token magnitude beside it.
//
// The accrued-interest segment is real here, sourced now (no backend needed):
// the `api` arm carries the live per-market index, so current debt = borrow
// shares → assets (toAssetsUp), and accrued = current − principal. When a
// position has no index (closed, or the index wasn't supplied) the segment is
// gated off with an explicit note rather than implying zero interest.
//
// Two lanes feed this one reducer. On Ethereum the lifetime flows are reduced
// here from the events on the page, which the index serves whole. On Base the
// events arrive from a live sweep whose DRAWN list is capped, so the flows are
// summed server-side over every row and handed in as `precomputedLifetime` —
// reducing the capped list would label a recent window "all time". The receipts
// differ by lane too (`vocab`): the arithmetic is shared, the claim about where
// the numbers came from is not.

import type { MorphoPositionView } from "@/components/protocol/morpho/morpho-position-card";
import {
  positionCollateralProv,
  positionBorrowedProv,
  morphoCurrentDebtProv,
  morphoFlowProv,
  morphoLifetimeInterestProv,
} from "@/lib/morpho/event-provenance";
import type { Provenance } from "@/components/shared/provenance";
import type { MorphoIndexRead } from "@/lib/sources/api/morpho-positions";
import { formatNumber } from "@/lib/utils/format";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { type ChainTruthTowerData, type TowerLine, flowsReconcile } from "@/lib/shared/chain-truth-economics";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { unreadToken } from "@/lib/shared/decimals-unread";
import type { UnreadToken } from "@/lib/shared/types/event-shape";

const DUST = 1e-9;

/** The receipts the tower's figures carry — one set per lane, because an
 *  indexed replay and a live sweep are different custodies of the same
 *  arithmetic, and a receipt has to name the one that produced its number. */
export interface MorphoTowerVocabulary {
  collateral: (symbol: string, atBlock?: number) => Provenance;
  borrowed: (symbol: string, atBlock?: number) => Provenance;
  currentDebt: (
    symbol: string,
    sharesHuman: string,
    totalBorrowAssets: string,
    totalBorrowShares: string,
    index?: MorphoIndexRead,
  ) => Provenance;
  flow: (flow: "withdrawn" | "liquidated" | "repaid", symbol: string) => Provenance;
}

/** The Ethereum explorer's receipts — the rails-server index. */
export const MORPHO_INDEXED_VOCABULARY: MorphoTowerVocabulary = {
  collateral: positionCollateralProv,
  borrowed: positionBorrowedProv,
  currentDebt: (sym, sharesHuman, totalBorrowAssets, totalBorrowShares, index) =>
    morphoCurrentDebtProv(sym, sharesHuman, totalBorrowAssets, totalBorrowShares, undefined, index),
  flow: morphoFlowProv,
};

/** Lifetime gross flows for one position — the collateral ones in the
 *  collateral token, the rest in the loan token. */
export interface MorphoTowerLifetime {
  deposited: number;
  collateralWithdrawn: number;
  collateralLiquidated: number;
  borrowed: number;
  repaid: number;
  /** The debt liquidations cleared (Σ each Liquidate log's repaid assets plus
   *  any bad debt), where the rows carry it. Undefined on a lane that does
   *  not, and the debt side then reconciles without it or not at all. */
  debtLiquidated?: number;
  /** Interest the debt accrued between rows (Σ each row's interest since the
   *  previous one), where the rows carry the chain debt. Undefined where they do
   *  not (the swept Base lane), so no lifetime interest is stated. */
  interest?: number;
  /** The debt the newest row states after it, where rows carry the chain debt:
   *  the head read less this is the interest since the last event. */
  lastDebtAfter?: number;
}

/** Reduce a position's events into its lifetime gross flows. Morpho events
 *  carry real token `assets`, so these are exact (no index needed).
 *  Collateral: deposited / withdrawn / liquidated; debt: borrowed / repaid.
 *  (Liquidation's debt reduction isn't a separate captured amount, so the debt
 *  side has no liquidated segment.) */
function reduceLifetime(events: BaseActivityEvent[]): MorphoTowerLifetime {
  const out: MorphoTowerLifetime = {
    deposited: 0,
    collateralWithdrawn: 0,
    collateralLiquidated: 0,
    borrowed: 0,
    repaid: 0,
  };
  let lastBlock = -1;
  for (const ev of events) {
    if (!isMorphoEvent(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.debtAfter != null && !unreadToken(ev, ctx.loanSymbol)) {
      out.interest = (out.interest ?? 0) + (Number(ctx.interestSincePrevious ?? 0) || 0);
      if (ev.blockNumber >= lastBlock) {
        lastBlock = ev.blockNumber;
        out.lastDebtAfter = Number(ctx.debtAfter);
      }
    }
    // An amount in a token whose decimals did not load joins no sum.
    if (unreadToken(ev, ctx.side === "collateral" ? ctx.collateralSymbol : ctx.loanSymbol)) continue;
    const amt = Math.abs(Number(ctx.assetsDelta));
    if (!Number.isFinite(amt) || amt === 0) continue;
    switch (ctx.eventType) {
      case "supply_collateral":
        out.deposited += amt;
        break;
      case "withdraw_collateral":
        out.collateralWithdrawn += amt;
        break;
      case "liquidation": {
        out.collateralLiquidated += amt;
        const cleared = Number(ctx.loanRepaid);
        if (Number.isFinite(cleared) && cleared > 0 && !unreadToken(ev, ctx.loanSymbol))
          out.debtLiquidated = (out.debtLiquidated ?? 0) + cleared;
        break;
      }
      case "borrow":
        out.borrowed += amt;
        break;
      case "repay":
        out.repaid += amt;
        break;
    }
  }
  return out;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' reduction added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation, and the per-side reconcile gates then check the MERGED
 * totals exactly as they always have. This is the third lane into the
 * `precomputedLifetime` seam the swept Base reader already uses.
 *
 * The opening legs arrive as base-unit integer strings under the summary's
 * own names — `deposited`/`withdrawn`/`liquidated` on the collateral bucket,
 * `borrowed`/`repaid` on the debt one — with decimals filled by the summary
 * proxy from the baked market catalog. A leg that cannot be scaled returns
 * undefined for the WHOLE layer: a lifetime figure short by whatever the
 * summarised part held is a wrong answer, not a partial one.
 */
export function morphoLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): MorphoTowerLifetime | undefined {
  // Undefined = nothing outside `events`, so the reducer reads them as the
  // whole history. On a grouped answer the folders hold members `events` does
  // not, and their flows are the third half of the partition (the summary
  // below the cut, the events and the folders above it).
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const f = reduceLifetime(events);
  // (bucket key, summary leg) → the MorphoTowerLifetime field it lands on.
  const FIELD: Record<string, Partial<Record<string, keyof MorphoTowerLifetime>>> = {
    collateral: { deposited: "deposited", withdrawn: "collateralWithdrawn", liquidated: "collateralLiquidated" },
    debt: { borrowed: "borrowed", repaid: "repaid", interest: "interest", liquidated: "debtLiquidated" },
  };
  for (const bucket of mergeFlowBuckets(opening?.flows, folderFlows(folders))) {
    const fields = FIELD[bucket.key];
    if (!fields) continue;
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      const field = fields[leg];
      if (!field) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      f[field] = (f[field] ?? 0) + value;
    }
  }
  return f;
}

export function computeMorphoEconomics(
  view: MorphoPositionView,
  events: BaseActivityEvent[] = [],
  vocab: MorphoTowerVocabulary = MORPHO_INDEXED_VOCABULARY,
  precomputedLifetime?: MorphoTowerLifetime,
): ChainTruthTowerData {
  // A side whose token's decimals did not load (on the card, or on any event)
  // is left out whole: no current line, no flow, no lifetime total. The tower
  // names it instead.
  const eventUnread = (sym: string | null | undefined) =>
    sym ? events.map((e) => unreadToken(e, sym)).find((t) => t != null) : undefined;
  const collUnread: UnreadToken | undefined = view.collateralDecimalsUnread
    ? { address: (view.collateralToken ?? "").toLowerCase(), label: view.collateralSymbol ?? "collateral" }
    : eventUnread(view.collateralSymbol);
  const loanUnread: UnreadToken | undefined = view.loanDecimalsUnread
    ? { address: (view.loanToken ?? "").toLowerCase(), label: view.loanSymbol }
    : eventUnread(view.loanSymbol);
  const notLoaded = [collUnread, loanUnread].filter((t): t is UnreadToken => t != null);
  const coll = collUnread ? 0 : Math.max(0, view.collateral);
  const principal = loanUnread ? 0 : Math.max(0, view.borrowed);
  const collSym = view.collateralSymbol ?? "—";
  const cd = loanUnread ? undefined : view.currentDebt;
  const accrued = cd ? Math.max(0, cd.accruedAmount) : 0;

  const {
    deposited,
    collateralWithdrawn: cWithdrawn,
    collateralLiquidated: cLiquidated,
    borrowed,
    repaid,
    debtLiquidated = 0,
    interest: rowInterest,
    lastDebtAfter,
  } = precomputedLifetime ?? reduceLifetime(events);
  const lifetimeInterest =
    !loanUnread && rowInterest != null
      ? rowInterest + (cd && lastDebtAfter != null ? Math.max(0, cd.amount - lastDebtAfter) : 0)
      : undefined;
  // Surface lifetime flows only where the captured events reconcile to current
  // state (history complete from the position's first event). Per side, since
  // one can be complete while the other isn't.
  const collComplete =
    !collUnread && flowsReconcile(deposited - cWithdrawn - cLiquidated, coll, deposited + cWithdrawn + cLiquidated);
  const debtComplete =
    !loanUnread && flowsReconcile(borrowed - repaid - debtLiquidated, principal, borrowed + repaid + debtLiquidated);
  // Every tower line carries the token's own address beside its symbol. Morpho
  // Blue is permissionless — the market params ARE two addresses — so the
  // symbol alone leaves the icon chip to guess from the 88-entry house table,
  // and an unlisted asset (apxUSD, PT-apyUSD, EURCV …) draws as its initial
  // letter. The view has both tokens already; nothing new is fetched.
  const collAddr = view.collateralToken;
  const loanAddr = view.loanToken;
  const flowLine = (
    key: string,
    amt: number,
    sym: string,
    address: string | undefined,
    flow: "withdrawn" | "liquidated" | "repaid",
    complete: boolean,
    flowLabel?: string,
  ): TowerLine[] =>
    complete && amt > DUST
      ? [
          {
            key,
            symbol: sym,
            amount: amt,
            address,
            usd: null,
            prov: vocab.flow(flow, sym),
            ...(flowLabel ? { flowLabel } : {}),
          },
        ]
      : [];

  return {
    valued: false,
    collateralUnit: view.collateralSymbol ?? undefined,
    debtUnit: view.loanSymbol,
    collateral: {
      current:
        coll > 0
          ? [
              {
                key: "coll",
                symbol: collSym,
                address: collAddr,
                amount: coll,
                usd: null,
                prov: vocab.collateral(collSym, view.atBlock),
              },
            ]
          : [],
      interest: null,
      exited: flowLine("coll-withdrawn", cWithdrawn, collSym, collAddr, "withdrawn", collComplete),
      liquidated: flowLine("coll-liquidated", cLiquidated, collSym, collAddr, "liquidated", collComplete),
      lifetimeInflow: collComplete ? deposited : 0,
    },
    debt: {
      current:
        principal > 0
          ? [
              {
                key: "principal",
                symbol: view.loanSymbol,
                address: loanAddr,
                amount: principal,
                usd: null,
                prov: vocab.borrowed(view.loanSymbol, view.atBlock),
              },
            ]
          : [],
      interest:
        cd && accrued > 0
          ? {
              key: "interest",
              symbol: view.loanSymbol,
              address: loanAddr,
              amount: accrued,
              usd: null,
              prov: vocab.currentDebt(
                view.loanSymbol,
                formatNumber(Number(view.borrowSharesRaw)),
                cd.totalBorrowAssets,
                cd.totalBorrowShares,
                cd.index,
              ),
            }
          : null,
      exited: flowLine("debt-repaid", repaid, view.loanSymbol, loanAddr, "repaid", debtComplete),
      // The interest the debt accrued over its life: Σ each row's interest
      // since the previous one, plus the head read less the newest row's debt.
      // Where the accrued-interest segment is drawn it is this same interest,
      // so the row is left out rather than stated twice.
      costs:
        !(cd && accrued > 0) && lifetimeInterest != null && lifetimeInterest > DUST
          ? [
              {
                key: "debt-interest-accrued",
                symbol: view.loanSymbol,
                address: loanAddr,
                amount: lifetimeInterest,
                usd: null,
                flowLabel: "Interest accrued",
                prov: morphoLifetimeInterestProv(view.loanSymbol),
              },
            ]
          : [],
      liquidated: flowLine(
        "debt-liquidated",
        debtLiquidated,
        view.loanSymbol,
        loanAddr,
        "liquidated",
        debtComplete,
        "Cleared by liquidation",
      ),
      lifetimeInflow: debtComplete ? borrowed : 0,
    },
    interestNote:
      cd || loanUnread
        ? undefined
        : "Accrued interest isn't shown here — the position has no open debt for it to build on.",
    ...(notLoaded.length > 0 ? { notLoaded } : {}),
  };
}
