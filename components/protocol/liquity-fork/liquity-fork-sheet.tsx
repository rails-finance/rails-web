// The Liquity V2 forks' balance sheet (ui-jobs 330): the `sheet` slot of the
// event card for Ebisu, Asymmetry and Basedollar, built on the Liquity V2
// sheet (components/protocol/liquity/liquity-cells.tsx) from the figures the
// fork's cells already compute (liquity-fork-state-stats.tsx).
//
// Collateral and Debt carry the Trove's balances forward from its previous
// event: the fork's context holds that event's after-state as collBefore and
// debtBefore, and the interest accrued since in the operation facts. The fork
// timeline carries no price for the previous event, so the collateral's
// "Last event" row states its amount alone and "Market move" is left out; a
// block with no price draws no collateral layer.
// Risk is the collateral ratio and the price that liquidates the Trove;
// Limits the interest rate (and the delegate's fee in a batch), with the
// branch's minimum and critical ratios as the parameters. The debt ahead in
// the redemption queue is a live read and is not on the sheet, as on Liquity V2.
//
// The gas compensation escrow is a footnote under Risk and Limits where the
// fork's constant is established (LiquityForkEscrow).
//
// A batch manager's rate and fee rows carry no balance of the
// Trove: they return no sheet and the shell draws their cells.

import type { AssetFlow } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";
import { soleFlowAddress } from "@/lib/shared/format-event";
import {
  FORK_DEBT_DUST_FLOAT,
  forkAmount,
  forkCollAmount,
  forkCollMove,
  forkDebtMove,
  forkDebtMoveOps,
  forkMcrAt,
  forkRedistArrival,
  type ForkMcrStep,
} from "@/lib/shared/liquity-fork-ops";
import { faceUsdProv } from "@/lib/shared/flows-timeline-provenance";
import {
  SHEET_WORDS,
  sheetUsd,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import {
  forkCrText,
  forkRateText,
  isForkBatchRow,
  liquityForkStateFigures,
  type LiquityForkStateProvs,
} from "./liquity-fork-state-stats";
import type { LiquityForkEventContext, LiquityForkHeaderBuilders } from "./liquity-fork-event-header";
import { forkEscrowTip, type LiquityForkEscrow } from "./liquity-fork-escrow";
import { gasEscrowMove } from "@/lib/shared/liquity-gas-escrow";
import { gasEscrowNote } from "@/components/protocol/liquity-family/gas-escrow";

/** What the sheet reads of a fork's branch: the collateral token, the
 *  governance ratios and the contract that holds them. */
export interface LiquityForkSheetBranch {
  collateralAddr?: string;
  mcr: number;
  mcrBefore?: readonly ForkMcrStep[];
  ccr: number;
  /** The contract the ratios are read from. */
  constants: { name: string; address?: string };
}

/** The vocabulary the sheet reads: the cells' builders and the header's
 *  redistribution receipt. */
export type LiquityForkSheetProvs = LiquityForkStateProvs & Pick<LiquityForkHeaderBuilders, "redistProv">;

export interface LiquityForkSheetArgs {
  ctx: LiquityForkEventContext;
  coords: LiquityForkCoords;
  debtSymbol: string;
  provs: LiquityForkSheetProvs;
  branch?: LiquityForkSheetBranch;
  actionLabel: string;
  flows?: AssetFlow[];
  /** The fork's gas compensation escrow, where its constant is established. */
  escrow?: LiquityForkEscrow;
}

const WORDS = {
  open: "Open",
  close: "Close",
  liquidation: "Liquidation",
  redemption: "Redemption",
  add: "Add",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  redistribution: "Redistribution",
  upfrontFee: "Upfront fee",
  face: "$1.00 face",
  ratio: "Collateral ratio",
  liquidatesAt: "Liquidates at",
  rate: "Interest rate",
  delegateFee: "Delegate's fee",
  minimumRatio: "Minimum ratio",
  criticalRatio: "Critical ratio",
  closed: "CLOSED",
  notApplicable: "N/A",
  unread: "Not read on this page",
};

/** Each row's read-more, worded for Miles's prose review. */
function tips(coll: string, debt: string, noun: string) {
  return {
    collLast: `The Trove's ${coll} after its previous event, from the TroveManager's log.`,
    collBefore: `The Trove's ${coll} just before this event, at the branch's ${coll} price at this block.`,
    collEvent: `The ${coll} this event moved, from the TroveManager's log, at the branch's ${coll} price at this block.`,
    collRedist: `The ${coll} that liquidated Troves passed to this one, applied at this event, from the TroveManager's log.`,
    collTotal: `The Trove's ${coll} after this event, from the TroveManager's log, and its dollars at the branch's ${coll} price at this block.`,
    collTotalUnpriced: `The Trove's ${coll} after this event, from the TroveManager's log. The page carries no ${coll} price for this block, so there is no dollar figure.`,
    debtLast: `The Trove's debt after its previous event, from the TroveManager's log, at $1 per ${debt}.`,
    debtInterest: `The ${noun} the debt accrued between the previous event and this one, at $1 per ${debt}.`,
    debtInterestAsset: `The ${noun} in ${debt}, counted at its $1.00 face.`,
    debtBefore: `The debt just before this event: the previous event's debt plus the ${noun} since.`,
    debtEvent: `The debt this event moved, from the TroveManager's log.`,
    debtUpfront: `A one-off borrowing fee this operation added to the Trove's debt, from the TroveManager's log.`,
    debtRedist: `The debt that liquidated Troves passed to this one, applied at this event.`,
    debtTotal: `The Trove's debt after this event, from the TroveManager's log, at $1 per ${debt}.`,
    cr: `The collateral's dollar value divided by the debt after this event, at the branch's ${coll} price at this block.`,
    liquidatesAt: `The ${coll} price at which the Trove's collateral ratio meets the branch's minimum: the debt times the minimum ratio, divided by the collateral.`,
    rate: `The annual interest rate on the Trove's debt after this event, from the TroveManager's log.`,
    delegateFee: `The batch's annual management fee, set by its batch manager and charged on top of the interest rate.`,
    minimumRatio: `The collateral ratio below which a Trove on the ${coll} branch can be liquidated, a constant of the branch's contracts.`,
    criticalRatio: `The branch-wide collateral ratio below which the ${coll} branch restricts borrowing, a constant of the branch's contracts.`,
  };
}

const num = (s: string | undefined | null): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};
const signed = (n: number, text: string) => (n < 0 ? `−${text}` : text);
const pts = (a: number) => `${a.toFixed(2)} pts`;
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (ratio: number) => `${+(ratio * 100).toFixed(1)}%`;

/** A token amount's dollars at the block's price. */
function usdMoveProv(sym: string, amount: number, price: number): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `${sym} this event moved, in US dollars — the amount times the branch's price for ${sym} at this block.`,
    formula: "amount × price",
    inputs: [
      { label: "amount", value: `${forkCollAmount(amount)} ${sym}`, kind: "chain" },
      {
        label: "price",
        value: usd2(price),
        kind: "chain-derived",
        pclass: "oracle",
        note: "branch price feed @ event block",
      },
    ],
  };
}

function sinceProv(what: string, formula: string): Provenance {
  return {
    kind: "derived",
    summary: `${what} — the figure after this event less the figure before it.`,
    formula,
  };
}

/** The fork's sheet, or undefined for the rows it cannot state. */
export function liquityForkSheet({
  ctx,
  coords,
  debtSymbol,
  provs,
  branch,
  actionLabel,
  flows,
  escrow,
}: LiquityForkSheetArgs): EventSheet | undefined {
  if (isForkBatchRow(ctx)) return undefined;

  const collSym = ctx.collateralSymbol;
  const debtSym = debtSymbol;
  const f = liquityForkStateFigures(ctx);
  const price = f.price;
  const op = ctx.operation;
  const isClose = ctx.eventType === "closeTrove";
  const collAddr = soleFlowAddress(flows, collSym) ?? branch?.collateralAddr;
  const debtAddr = soleFlowAddress(flows, debtSym);

  const collAfter = num(ctx.collAfter);
  const collBefore = num(ctx.collBefore);
  const debtAfter = num(ctx.debtAfter);
  const debtBefore = num(ctx.debtBefore);
  const accrued = op?.accruedInterest != null ? num(op.accruedInterest) : 0;
  const upfrontFee = num(op?.debtUpfrontFee);
  const redist = forkRedistArrival(ctx);
  const redistColl = redist?.coll ?? 0;
  const redistDebt = redist?.debt ?? 0;
  const opColl = forkCollMove(ctx);
  const opDebt = forkDebtMove(ctx).value;
  const hasPrev = !ctx.isOpen && ctx.eventType !== "openTrove" && ctx.eventType !== "openTroveAndJoinBatch";
  const noun = op?.accruedIncludesBatchFees ? "interest and batch fees" : "interest";
  const TIP = tips(collSym, debtSym, noun);
  const DUST_COLL = 1e-9;

  // The event's word on a side: an adjust names its act per side.
  const sideWord = (side: "coll" | "debt"): string => {
    switch (ctx.eventType) {
      case "openTrove":
      case "openTroveAndJoinBatch":
        return WORDS.open;
      case "closeTrove":
        return WORDS.close;
      case "liquidate":
        return WORDS.liquidation;
      case "redeemCollateral":
        return WORDS.redemption;
      case "adjustTrove":
        return side === "coll" ? (opColl > 0 ? WORDS.add : WORDS.withdraw) : opDebt > 0 ? WORDS.borrow : WORDS.repay;
      default:
        return actionLabel;
    }
  };

  const collBeforeProv = provs.collBeforeProv(coords, ctx.originBefore?.coll);
  const debtBeforeProv = provs.debtBeforeProv(coords, ctx.originBefore?.debt, ctx.originBefore != null);
  const collDeltaProv = (amount: number) =>
    provs.collDeltaProv(coords, { after: ctx.collAfter, before: Number(ctx.collAfter) - amount }, ctx.origin?.coll);
  const debtMoveProv: Provenance = {
    kind: "derived",
    summary: `Debt (${debtSym}) this event moved, in US dollars — the ${debtSym} at its $1 face.`,
    formula: `${debtSym} × $1`,
  };

  // ── Collateral ──
  const collRows: SheetRow[] = [];
  if (Math.abs(opColl) >= DUST_COLL)
    collRows.push({
      key: "event",
      label: sideWord("coll"),
      amount: {
        text: signed(opColl, forkCollAmount(Math.abs(opColl))),
        symbol: collSym,
        address: collAddr,
        info: collDeltaProv(opColl),
      },
      usd: price != null ? { text: sheetUsd(opColl * price), info: usdMoveProv(collSym, opColl, price) } : undefined,
      tip: TIP.collEvent,
    });
  if (redistColl > 0)
    collRows.push({
      key: "redistribution",
      label: WORDS.redistribution,
      amount: {
        text: forkCollAmount(redistColl),
        symbol: collSym,
        address: collAddr,
        info: provs.redistProv?.(coords, { leg: "coll", amount: redist!.collText }) ?? collDeltaProv(redistColl),
      },
      usd:
        price != null
          ? { text: sheetUsd(redistColl * price), info: usdMoveProv(collSym, redistColl, price) }
          : undefined,
      tip: TIP.collRedist,
    });

  const collCarry: SheetSide["carry"] = [];
  // Without a price at this block the layer would repeat the amount twice and
  // state no dollar figure, so it is left out.
  if (hasPrev && collBefore > 0 && price != null)
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: { text: forkCollAmount(collBefore), symbol: collSym, address: collAddr, info: collBeforeProv },
      tip: TIP.collLast,
    });
  const collAfterUsd = price != null ? collAfter * price : null;
  const collSide: SheetSide = {
    side: "collateral",
    icons: [collSym],
    carry: collCarry,
    before:
      collCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: { text: forkCollAmount(collBefore), symbol: collSym, address: collAddr, info: collBeforeProv },
            usd:
              price != null
                ? {
                    text: sheetUsd(collBefore * price),
                    info: provs.collUsdProv(coords, { coll: ctx.collBefore, priceUsd: price, which: "before" }),
                  }
                : undefined,
            tip: TIP.collBefore,
          }
        : undefined,
    rows: collRows,
    total:
      collAfter === 0
        ? { text: "$0", info: provs.collAfterProv(coords, ctx.origin?.coll) }
        : collAfterUsd != null && price != null
          ? {
              text: sheetUsd(collAfterUsd),
              info: provs.collUsdProv(coords, { coll: ctx.collAfter, priceUsd: price, which: "after" }),
            }
          : { none: WORDS.unread },
    totalAmount: {
      text: forkCollAmount(collAfter),
      symbol: collSym,
      address: collAddr,
      info: provs.collAfterProv(coords, ctx.origin?.coll),
    },
    totalTip: collAfter > 0 && price == null ? TIP.collTotalUnpriced : TIP.collTotal,
  };

  // ── Debt ──
  const debtRows: SheetRow[] = [];
  const debtFig = (n: number) => signed(n, forkAmount(Math.abs(n)));
  if (Math.abs(opDebt) >= FORK_DEBT_DUST_FLOAT)
    debtRows.push({
      key: "event",
      label: sideWord("debt"),
      amount: {
        text: debtFig(opDebt),
        symbol: debtSym,
        address: debtAddr,
        info: provs.debtDeltaProv(coords, forkDebtMoveOps(ctx), ctx.origin?.debt),
      },
      usd: { text: sheetUsd(opDebt), info: debtMoveProv },
      tip: TIP.debtEvent,
    });
  if (upfrontFee >= FORK_DEBT_DUST_FLOAT)
    debtRows.push({
      key: "upfront-fee",
      label: WORDS.upfrontFee,
      amount: {
        text: forkAmount(upfrontFee),
        symbol: debtSym,
        address: debtAddr,
        info: provs.upfrontFeeProv(coords, { fee: op!.debtUpfrontFee }),
      },
      usd: { text: sheetUsd(upfrontFee), info: faceUsdProv(debtSym, forkAmount(upfrontFee), "after") },
      tip: TIP.debtUpfront,
    });
  if (redistDebt >= FORK_DEBT_DUST_FLOAT)
    debtRows.push({
      key: "redistribution",
      label: WORDS.redistribution,
      amount: {
        text: forkAmount(redistDebt),
        symbol: debtSym,
        address: debtAddr,
        info: provs.redistProv?.(coords, { leg: "debt", amount: redist!.debtText }) ?? debtMoveProv,
      },
      usd: { text: sheetUsd(redistDebt), info: debtMoveProv },
      tip: TIP.debtRedist,
    });

  const accrualProv =
    accrued >= FORK_DEBT_DUST_FLOAT && op
      ? provs.accruedInterestProv(coords, {
          interest: op.accruedInterest!,
          debtDelta: ctx.debtDelta,
          fromOperation: op.debtFromOperation,
          fee: op.debtUpfrontFee,
          redist: op.debtFromRedist,
          batched: op.accruedIncludesBatchFees,
        })
      : undefined;
  const debtBeforeEvent = debtBefore + (accrualProv ? accrued : 0);
  const debtBeforeEventProv: Provenance = {
    kind: "derived",
    summary: `Debt (${debtSym}) immediately before this event — the debt the Trove's previous event recorded plus the ${noun} accrued since.`,
    formula: "debt at the previous event + accrual since",
    inputs: [
      { label: "debt at the previous event", value: `${forkAmount(debtBefore)} ${debtSym}`, kind: "chain" },
      ...(accrualProv
        ? [{ label: "accrual", value: `${forkAmount(accrued)} ${debtSym}`, kind: "chain-derived" as const }]
        : []),
    ],
  };
  const debtCarry: SheetSide["carry"] = [];
  if (hasPrev && debtBefore > 0) {
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: { text: forkAmount(debtBefore), symbol: debtSym, address: debtAddr, info: debtBeforeProv },
      usd: { text: sheetUsd(debtBefore), info: faceUsdProv(debtSym, forkAmount(debtBefore), "before") },
      tip: TIP.debtLast,
    });
    if (accrualProv)
      debtCarry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        usd: { text: sheetUsd(accrued), info: accrualProv },
        tip: TIP.debtInterest,
        sub: [
          {
            key: `interest-${debtSym}`,
            label: debtSym,
            note: WORDS.face,
            amount: { text: forkAmount(accrued), symbol: debtSym, address: debtAddr, info: accrualProv },
            usd: { text: sheetUsd(accrued), info: accrualProv },
            tip: TIP.debtInterestAsset,
          },
        ],
      });
  }
  const debtSide: SheetSide = {
    side: "debt",
    icons: [debtSym],
    carry: debtCarry,
    before:
      debtCarry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: {
              text: forkAmount(debtBeforeEvent),
              symbol: debtSym,
              address: debtAddr,
              info: debtBeforeEventProv,
            },
            usd: { text: sheetUsd(debtBeforeEvent), info: debtBeforeEventProv },
            tip: TIP.debtBefore,
          }
        : undefined,
    rows: debtRows,
    total: {
      text: debtAfter > 0 ? sheetUsd(debtAfter) : "$0",
      info: faceUsdProv(debtSym, forkAmount(debtAfter), "after"),
    },
    totalAmount: {
      text: forkAmount(debtAfter),
      symbol: debtSym,
      address: debtAddr,
      info: provs.debtAfterProv(coords, ctx.origin?.debt),
    },
    totalTip: TIP.debtTotal,
  };

  // ── The gas compensation escrow ──
  // A footnote under Risk and Limits on every event from the open to the
  // close or the liquidation (rails-ops TO-DO-ui-jobs 388). Priced on a WETH
  // branch alone: the fork timeline carries the branch's collateral price.
  const escrowMove = gasEscrowMove({
    open: ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch",
    close: isClose,
    liquidation: ctx.eventType === "liquidate",
  });
  const escrowNote = escrow
    ? gasEscrowNote({
        escrow: escrow.constant,
        move: escrowMove,
        tip: forkEscrowTip(escrow.constant),
        price: collSym === escrow.constant.symbol ? (price ?? null) : null,
        info: escrow.prov(escrowMove, coords),
        fmt: forkCollAmount,
      })
    : null;

  // ── Risk ──
  const open = !isClose && debtAfter > 0 && collAfter > 0;
  const noneFor = (): { none: string } => ({ none: isClose ? WORDS.closed : WORDS.notApplicable });
  const crChange =
    open && f.crAfter != null && f.crBefore != null
      ? {
          text: changeText(f.crAfter - f.crBefore, pts),
          info: sinceProv(
            "Collateral ratio change in percentage points, both ratios at this block's price",
            "after − before",
          ),
        }
      : null;
  const crRow: SheetStat = {
    key: "ratio",
    label: WORDS.ratio,
    tip: TIP.cr,
    value: !open
      ? noneFor()
      : f.crAfter != null && price != null
        ? {
            text: forkCrText(f.crAfter),
            info: provs.collRatioProv(coords, {
              coll: ctx.collAfter,
              debt: ctx.debtAfter,
              priceUsd: price,
              which: "after",
            }),
          }
        : { none: WORDS.unread },
    change: crChange,
  };

  const mcr = ctx.mcrAtEvent ?? (branch ? forkMcrAt(branch, { block: coords.blockNumber }) : undefined);
  const liqAfter = open && mcr != null ? (debtAfter * mcr) / collAfter : null;
  const liqPrev = open && mcr != null && collBefore > 0 && debtBefore > 0 ? (debtBefore * mcr) / collBefore : null;
  const liqProv: Provenance | undefined =
    mcr != null
      ? {
          kind: "chain-derived",
          summary: `The ${collSym} price at which this Trove's collateral ratio meets the branch's minimum, ${pct(mcr)} — the debt times the minimum ratio, divided by the collateral, after this event.`,
          formula: "debt × minimum ratio ÷ collateral",
          inputs: [
            { label: "debt", value: `${forkAmount(debtAfter)} ${debtSym}`, kind: "chain", note: "after" },
            { label: "collateral", value: `${forkCollAmount(collAfter)} ${collSym}`, kind: "chain", note: "after" },
            { label: "minimum ratio", value: pct(mcr), kind: "chain", pclass: "state" },
          ],
        }
      : undefined;
  const liqRow: SheetStat = {
    key: "liquidates-at",
    label: WORDS.liquidatesAt,
    tip: TIP.liquidatesAt,
    value:
      liqAfter != null && liqProv
        ? { text: usd2(liqAfter), info: liqProv }
        : !open
          ? noneFor()
          : { none: WORDS.unread },
    change:
      liqAfter != null && liqPrev != null
        ? {
            text: changeText(liqAfter - liqPrev, usd2),
            info: sinceProv("Liquidation price change, at this event's minimum ratio", "after − before"),
          }
        : null,
  };

  // ── Limits ──
  const rateRow: SheetStat = {
    key: "rate",
    label: WORDS.rate,
    tip: TIP.rate,
    value: isClose
      ? { none: WORDS.closed }
      : f.rate != null
        ? {
            text: forkRateText(f.rate),
            info: provs.rateAtEventProv(coords, ctx.origin?.annualInterestRate),
          }
        : { none: WORDS.notApplicable },
    change:
      !isClose && f.rate != null && f.rateBefore != null && Math.abs(f.rate - f.rateBefore) > 1e-9
        ? {
            text: changeText(f.rate - f.rateBefore, pts),
            info: provs.rateBeforeProv(coords, { rate: String(f.rateBefore) }),
          }
        : null,
  };
  const limits: SheetStat[] = [rateRow];
  // The batch's fee is on a batch manager's rate and fee rows alone; a batched Trove's
  // other events do not carry it.
  if (ctx.isBatched && !isClose)
    limits.push({
      key: "delegate-fee",
      label: WORDS.delegateFee,
      tip: TIP.delegateFee,
      value: { none: WORDS.unread },
    });

  const paramProv = (what: string, ratio: number): Provenance => ({
    kind: "chain",
    pclass: "state",
    summary: `The ${collSym} branch's ${what}, ${pct(ratio)} — a constant the branch's contracts were deployed with.`,
    contract: branch?.constants,
  });
  const params: SheetStat[] =
    branch && mcr != null
      ? [
          {
            key: "minimum-ratio",
            label: WORDS.minimumRatio,
            tip: TIP.minimumRatio,
            value: { text: pct(mcr), info: paramProv("minimum collateral ratio (MCR)", mcr) },
          },
          {
            key: "critical-ratio",
            label: WORDS.criticalRatio,
            tip: TIP.criticalRatio,
            value: { text: pct(branch.ccr), info: paramProv("critical collateral ratio (CCR)", branch.ccr) },
          },
        ]
      : [];

  return {
    sides: [collSide, debtSide],
    footnotes: escrowNote ? [escrowNote] : undefined,
    panels: [
      { panel: "risk", rows: [crRow, liqRow] },
      { panel: "limits", rows: limits, breakdown: params },
    ],
  };
}
