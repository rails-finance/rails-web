"use client";

// The opened card's state cells for a Liquity V2 fork event (Ebisu, Asymmetry,
// Basedollar) — the Liquity V2 grid's four cells on the fork's receipts:
//
//   Collateral        after, before → after, and its dollar value at the
//                     branch price for the block
//   Debt              after, before → after, with the interest accrued since
//                     the last touch and any upfront fee under it
//   Collateral ratio  before → after, both at the block's price
//   Interest rate     before → after, with the cost per year under it
//
// A batch manager's change (server mig 342) takes the V2 batch row's cells: the
// rate before → after with its cost per year, the Trove's debt at the change,
// and the premature-adjustment fee it carried.
//
// Every figure the fork explainer restates is registered here under the value
// string the explainer echoes (`fmt`, `forkCrText`, `forkRateText`), so a
// prose figure and its cell pulse as one receipt.

import type { ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import type { OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { LiquityForkEventContext } from "@/lib/shared/liquity-fork-explainer-clauses";
import type { LiquityForkCoords, DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import {
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { formatCompact, formatNumber, formatUsdValue } from "@/lib/utils/format";
import { forkAmount, forkCollAmount, forkDebtMove, forkRedistArrival } from "@/lib/shared/liquity-fork-ops";
import { AmountText } from "@/components/shared/amount-text";
import { faceUsdProv } from "@/lib/shared/flows-timeline-provenance";

/** The fork vocabulary's builders the cells read (lib/<fork>/event-provenance.ts). */
export interface LiquityForkStateProvs {
  collAfterProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  debtAfterProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  collDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  debtDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  collBeforeProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  debtBeforeProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null, known?: boolean) => Provenance;
  rateAtEventProv: (coords?: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  upfrontFeeProv: (coords: LiquityForkCoords, vals: { fee: string }) => Provenance;
  accruedInterestProv: (
    coords: LiquityForkCoords,
    vals: {
      interest: string;
      debtDelta: string;
      fromOperation: string;
      fee: string;
      redist: string;
      batched?: boolean;
    },
  ) => Provenance;
  atBlockPriceProv: (coords: LiquityForkCoords, priceUsd: number) => Provenance;
  collUsdProv: (
    coords: LiquityForkCoords,
    vals: { coll: string; priceUsd: number; which: "before" | "after" },
  ) => Provenance;
  collRatioProv: (
    coords: LiquityForkCoords,
    vals: { coll: string; debt: string; priceUsd: number; which: "before" | "after" },
  ) => Provenance;
  rateBeforeProv: (coords: LiquityForkCoords, vals: { rate: string; batchRow?: boolean }) => Provenance;
  costPerYearProv: (coords: LiquityForkCoords, vals: { debt: string; rate: string }) => Provenance;
  batchDebtShareProv: (
    coords: LiquityForkCoords,
    vals: { debt?: string; batchDebt: string; shares?: string; totalShares: string },
  ) => Provenance;
  batchFeeShareProv: (
    coords: LiquityForkCoords,
    vals: { fee?: string; batchFee: string; shares?: string; totalShares: string },
  ) => Provenance;
}

/** A figure as the grid prints it — the echo key the explainer builds too.
 *  The fork's one precision rule (forkAmount), shared with the header. */
export const fmt = (human?: string): string => (human == null ? "—" : forkAmount(Number(human)));
/** A collateral figure as the grid prints it (forkCollAmount). */
export const fmtColl = (human?: string): string => (human == null ? "—" : forkCollAmount(Number(human)));

/** The headline figure of a cell: thousands in the grid's compact form, the
 *  smaller figures at the fork's rule, so 0.0115 reads as it does in the row
 *  header. */
const gridFigure = (human?: string, small: (n: number) => string = forkAmount): string => {
  if (human == null) return "—";
  const n = Number(human);
  return Math.abs(n) >= 1000 ? formatCompact(n) : small(n);
};

/** A reconstructed transition restated at the same rule, so the grid's
 *  before and change read like the header and the prose. */
function atForkPrecision(
  t: ChainTruthTransition | undefined,
  after: string | undefined,
  change: string | undefined,
  small: (n: number) => string = forkAmount,
) {
  if (!t || after == null || change == null) return t;
  const c = Number(change);
  const before = Number(after) - c;
  // Thousands keep the grid's compact form; the smaller figures take the rule.
  const f = (x: number) => (Math.abs(x) >= 1000 ? formatCompact(x) : small(x));
  return {
    ...t,
    before: f(before),
    change: `${c >= 0 ? "+" : "−"}${f(Math.abs(c))}`,
    shownAsIs: true,
  };
}
export const forkCrText = (cr: number): string => `${cr.toFixed(2)}%`;
export const forkRateText = (rate: number): string => `${rate.toFixed(2)}%`;

const BATCH_ROW = new Set(["setBatchManagerAnnualInterestRate", "lowerBatchManagerAnnualFee"]);
export const isForkBatchRow = (ctx: LiquityForkEventContext): boolean => BATCH_ROW.has(ctx.eventType);

/** The valued figures of one fork event: the branch price at its block and the
 *  ratios it makes, the rate either side and a year's interest after. Each is
 *  absent where its inputs are. */
export interface LiquityForkStateFigures {
  price?: number;
  collUsdAfter?: number;
  crBefore?: number;
  crAfter?: number;
  rate?: number;
  rateBefore?: number;
  /** The debt the year's cost is taken on (the Trove's debt at a batch change). */
  costDebt?: string;
  costPerYear?: number;
}

export function liquityForkStateFigures(ctx: LiquityForkEventContext): LiquityForkStateFigures {
  const out: LiquityForkStateFigures = {};
  const price = ctx.priceAtBlock?.usd;
  const collAfter = Number(ctx.collAfter);
  const debtAfter = Number(ctx.debtAfter);
  const collBefore = Number(ctx.collBefore);
  const debtBefore = Number(ctx.debtBefore);
  if (price != null && price > 0 && !isForkBatchRow(ctx)) {
    out.price = price;
    if (collAfter > 0) out.collUsdAfter = collAfter * price;
    if (collAfter > 0 && debtAfter > 0) out.crAfter = ((collAfter * price) / debtAfter) * 100;
    if (collBefore > 0 && debtBefore > 0) out.crBefore = ((collBefore * price) / debtBefore) * 100;
  }
  const rate = ctx.interestRate != null ? Number(ctx.interestRate) : NaN;
  if (Number.isFinite(rate) && rate > 0) out.rate = rate;
  const rb = ctx.rateBefore != null ? Number(ctx.rateBefore) : NaN;
  if (Number.isFinite(rb) && rb > 0) out.rateBefore = rb;
  const costDebt = isForkBatchRow(ctx) ? ctx.batchRate?.troveDebt : ctx.debtAfter;
  if (out.rate != null && costDebt != null && Number(costDebt) > 0 && ctx.eventType !== "closeTrove") {
    out.costDebt = costDebt;
    out.costPerYear = (Number(costDebt) * out.rate) / 100;
  }
  return out;
}

/** A percentage cell's before → after, where the two differ. */
function pctTransition(before: number, after: number, beforeProv: Provenance, what: string): ChainTruthTransition {
  const change = after - before;
  const sign = change >= 0 ? "+" : "−";
  const changeText = `${sign}${Math.abs(change).toFixed(2)}%`;
  return {
    before: `${before.toFixed(2)}%`,
    beforeExact: `${before}%`,
    beforeProv,
    change: changeText,
    changeExact: `${sign}${Math.abs(change)}%`,
    changeProv: {
      kind: "derived",
      summary: `${what} change at this event, in percentage points — the figure after minus the figure before.`,
      formula: "after − before",
    },
  };
}

function Figure({ info, value, children }: { info: Provenance; value: string; children: ReactNode }) {
  return (
    <Prov info={info} value={value}>
      {children}
    </Prov>
  );
}

/** The cells, in the Liquity V2 grid's order. `debtSymbol` names the fork's
 *  stable. */
export function liquityForkStateStats(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  debtSymbol: string,
  p: LiquityForkStateProvs,
): ChainTruthStat[] {
  const f = liquityForkStateFigures(ctx);
  const stats: ChainTruthStat[] = [];

  const rateCell = (): ChainTruthStat | null => {
    if (f.rate == null) return null;
    const moved = f.rateBefore != null && Math.abs(f.rateBefore - f.rate) > 1e-9;
    const batchRow = isForkBatchRow(ctx);
    return {
      label: "Interest rate",
      value: forkRateText(f.rate),
      display: forkRateText(f.rate),
      symbol: "",
      prov: p.rateAtEventProv(coords, ctx.origin?.annualInterestRate),
      changed: moved || ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch",
      ...(moved
        ? {
            transition: pctTransition(
              f.rateBefore!,
              f.rate,
              p.rateBeforeProv(coords, { rate: String(f.rateBefore), batchRow }),
              "Interest rate",
            ),
          }
        : {}),
      ...(f.costPerYear != null && f.costPerYear > 0.01 && f.costDebt != null
        ? {
            sub: (
              <>
                <Figure
                  info={p.costPerYearProv(coords, { debt: f.costDebt, rate: String(f.rate) })}
                  value={formatNumber(f.costPerYear)}
                >
                  <AmountText value={f.costPerYear} />
                </Figure>{" "}
                {debtSymbol} / year
              </>
            ),
          }
        : {}),
    };
  };

  // ── A batch manager's change ──────────────────────────────────────────────
  const br = ctx.batchRate;
  if (isForkBatchRow(ctx) && br) {
    const rc = rateCell();
    if (rc) stats.push(rc);
    if (ctx.eventType === "lowerBatchManagerAnnualFee") {
      const fee = Number(br.managementFee);
      const before = br.managementFeeBefore != null ? Number(br.managementFeeBefore) : NaN;
      stats.push({
        label: "Management fee",
        value: forkRateText(fee),
        display: forkRateText(fee),
        symbol: "",
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: "Management fee after this change — as the batch logged it.",
          via: "BatchUpdated log · _annualManagementFee · ÷10^16",
          inputs: [{ label: "fee", value: `${br.managementFee}%`, kind: "chain", pclass: "emitted" }],
        },
        ...(Number.isFinite(before) && before !== fee
          ? {
              transition: pctTransition(
                before,
                fee,
                {
                  kind: "chain",
                  pclass: "emitted",
                  summary: "Management fee before this change — from the batch's previous update.",
                  via: "the batch's previous BatchUpdated log · _annualManagementFee · ÷10^16",
                  inputs: [{ label: "fee", value: `${before}%`, kind: "chain", pclass: "emitted" }],
                },
                "Management fee",
              ),
            }
          : {}),
      });
    }
    if (br.troveDebt != null) {
      const troveFee = br.troveFee != null ? Number(br.troveFee) : 0;
      stats.push({
        label: "Debt",
        value: fmt(br.troveDebt),
        symbol: debtSymbol,
        prov: p.batchDebtShareProv(coords, {
          debt: br.troveDebt,
          batchDebt: br.batchDebt,
          shares: br.troveShares,
          totalShares: br.totalShares,
        }),
        changed: troveFee > 0,
        ...(troveFee > 0
          ? {
              sub: (
                <>
                  incl. +
                  <Figure
                    info={p.batchFeeShareProv(coords, {
                      fee: br.troveFee,
                      batchFee: br.batchFee,
                      shares: br.troveShares,
                      totalShares: br.totalShares,
                    })}
                    value={fmt(br.troveFee)}
                  >
                    {fmt(br.troveFee)}
                  </Figure>{" "}
                  adjustment fee
                </>
              ),
            }
          : {}),
      });
    }
    return stats;
  }

  // ── The Trove's operation ─────────────────────────────────────────────────
  const redist = forkRedistArrival(ctx);
  stats.push({
    label: "Collateral",
    ledger: "collateral",
    value: fmtColl(ctx.collAfter),
    display: gridFigure(ctx.collAfter, forkCollAmount),
    symbol: ctx.collateralSymbol,
    prov: p.collAfterProv(coords, ctx.origin?.coll),
    transition: atForkPrecision(
      reconstructTransition({
        after: ctx.collAfter,
        change: ctx.collDelta,
        changeProv: p.collDeltaProv(coords, undefined, ctx.origin?.coll),
        beforeProv: p.collBeforeProv(coords, ctx.originBefore?.coll),
      }),
      ctx.collAfter,
      ctx.collDelta,
      forkCollAmount,
    ),
    ...(redist && redist.coll > 0
      ? {
          sub: <>incl. +{forkCollAmount(redist.coll)} from a liquidation</>,
        }
      : {}),
    ...(f.collUsdAfter != null && f.price != null
      ? {
          usd: {
            value: f.collUsdAfter,
            prov: p.collUsdProv(coords, { coll: ctx.collAfter, priceUsd: f.price, which: "after" }),
          },
          ...(Number(ctx.collBefore) > 0
            ? {
                usdBefore: {
                  value: Number(ctx.collBefore) * f.price,
                  prov: p.collUsdProv(coords, { coll: ctx.collBefore, priceUsd: f.price, which: "before" }),
                },
              }
            : {}),
          // The Display menu's USD switches govern it (lib/shared/usd-display.ts).
          usdAmount: Number(ctx.collAfter),
        }
      : {}),
  });

  // Under the debt: the interest accrued since the last touch and the upfront
  // fee this act added — the two parts of the change the act itself did not
  // move (V2's "incl. +X interest + Y fee").
  const op = ctx.operation;
  const accrued = op?.accruedInterest;
  // What a liquidated neighbour's redistribution added on this touch, and on a
  // redemption the amount redeemed, each as its own part of the change.
  const redistDebt = redist && redist.debt >= 0.01 ? redist.debt : 0;
  const redeemed = ctx.eventType === "redeemCollateral" ? Math.abs(forkDebtMove(ctx).value) : 0;
  const feeN = op?.debtUpfrontFee != null ? Number(op.debtUpfrontFee) : 0;
  const hasFee = Number.isFinite(feeN) && feeN > 0;
  const debtSub =
    accrued != null || hasFee ? (
      <>
        {accrued != null && (
          <>
            incl. +
            <Figure
              info={p.accruedInterestProv(coords, {
                interest: accrued,
                debtDelta: ctx.debtDelta,
                fromOperation: op!.debtFromOperation,
                fee: op!.debtUpfrontFee,
                redist: op!.debtFromRedist,
                batched: op!.accruedIncludesBatchFees,
              })}
              value={fmt(accrued)}
            >
              {fmt(accrued)}
            </Figure>{" "}
            {op!.accruedIncludesBatchFees ? "interest and batch fees" : "interest"}
          </>
        )}
        {hasFee && (
          <>
            {accrued != null ? " + " : "incl. +"}
            <Figure info={p.upfrontFeeProv(coords, { fee: op!.debtUpfrontFee })} value={fmt(op!.debtUpfrontFee)}>
              {fmt(op!.debtUpfrontFee)}
            </Figure>{" "}
            fee
          </>
        )}
        {redistDebt > 0 && (
          <>
            {accrued != null || hasFee ? " + " : "incl. +"}
            {forkAmount(redistDebt)} from a liquidation
          </>
        )}
        {redeemed > 0.01 && accrued != null && <>, then −{forkAmount(redeemed)} redeemed</>}
      </>
    ) : redistDebt > 0 ? (
      <>incl. +{forkAmount(redistDebt)} from a liquidation</>
    ) : undefined;
  stats.push({
    label: "Debt",
    ledger: "debt",
    value: fmt(ctx.debtAfter),
    display: gridFigure(ctx.debtAfter),
    symbol: debtSymbol,
    prov: p.debtAfterProv(coords, ctx.origin?.debt),
    transition: atForkPrecision(
      reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.debtDelta,
        changeProv: p.debtDeltaProv(coords, undefined, ctx.origin?.debt),
        beforeProv: p.debtBeforeProv(coords, ctx.originBefore?.debt, ctx.originBefore != null),
      }),
      ctx.debtAfter,
      ctx.debtDelta,
    ),
    ...(debtSub ? { sub: debtSub } : {}),
    // The debt's USD at its $1 face, as the cell's ledger counts it.
    ...(Number(ctx.debtAfter) > 0
      ? {
          usd: { value: Number(ctx.debtAfter), prov: faceUsdProv(debtSymbol, fmt(ctx.debtAfter), "after") },
          usdAmount: Number(ctx.debtAfter),
          ...(Number(ctx.debtBefore) > 0
            ? {
                usdBefore: {
                  value: Number(ctx.debtBefore),
                  prov: faceUsdProv(debtSymbol, fmt(ctx.debtBefore), "before"),
                },
              }
            : {}),
        }
      : {}),
  });

  if (f.crAfter != null && f.price != null) {
    const moved = f.crBefore != null && Math.abs(f.crBefore - f.crAfter) >= 0.005;
    stats.push({
      label: "Collateral ratio",
      value: forkCrText(f.crAfter),
      display: forkCrText(f.crAfter),
      symbol: "",
      prov: p.collRatioProv(coords, { coll: ctx.collAfter, debt: ctx.debtAfter, priceUsd: f.price, which: "after" }),
      changed: moved || f.crBefore == null,
      ...(moved
        ? {
            transition: pctTransition(
              f.crBefore!,
              f.crAfter,
              p.collRatioProv(coords, {
                coll: ctx.collBefore,
                debt: ctx.debtBefore,
                priceUsd: f.price,
                which: "before",
              }),
              "Collateral ratio",
            ),
          }
        : {}),
    });
  }

  const rc = rateCell();
  if (rc) stats.push(rc);

  // The price the cells are valued at, where no other cell on the card states
  // it: a redemption states the price its log emitted, a liquidation's
  // forensics the price it acted at.
  if (f.price != null && ctx.eventType !== "liquidate" && ctx.priceAtBlock?.source !== "redemption-event-price") {
    stats.push({
      label: `${ctx.collateralSymbol} price`,
      value: formatUsdValue(f.price),
      display: formatUsdValue(f.price),
      symbol: "",
      prov: p.atBlockPriceProv(coords, f.price),
      changed: false,
    });
  }
  return stats;
}
