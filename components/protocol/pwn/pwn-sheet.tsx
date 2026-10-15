// PWN's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the card's
// `sheet` slot, from the figures pwn-cells.tsx states and the loan's replay
// (pwn-ledger.tsx). A loan is a fixed-term position: Collateral is what the
// loan holds in escrow, Debt is the credit owed (principal plus the interest
// the terms fix or accrue), both in their tokens. The page holds no price,
// so no row has a dollar column and each total reads in its asset.
//
// Risk: the due date and the loan's state once the event had run. Limits: the
// repay amount; with the breakdown on, the deadline as struck, the extensions
// made, the interest rate and the extension limit. A row whose figure the
// page does not carry reads "Not read on this page".
//
// Drawn for the creation, a repayment and the lender's default claim, the rows
// the loan's replay states. The note's mint and burn, an extension (no replay
// row) and a non-default claim (which moves neither side) keep the cells.

import type { PwnContext } from "@/lib/shared/types/event-shape";
import {
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import {
  bookDueProv,
  collateralLockedProv,
  collateralReturnedProv,
  collateralSeizedProv,
  creditAdvancedProv,
  extendedDeadlineProv,
  flowCellProv,
  positionInterestProv,
  rowRepay,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { aprText, fixedInterestRate, interestRateText, minutesText } from "@/lib/pwn/economics";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import type { PwnSheetSide } from "./pwn-ledger";

const WORDS = {
  locked: "Collateral locked",
  returned: "Collateral returned",
  seized: "Collateral seized",
  lent: "Credit lent",
  interestFixed: "Interest · fixed",
  repaid: "Repaid · principal + interest",
  cleared: "Owed · cleared by the default claim",
  dueDate: "Due date",
  state: "Default state",
  repayAmount: "Repay amount",
  struck: "Deadline as struck",
  extensions: "Extensions made",
  rate: "Interest rate",
  extendLimit: "Extension limit",
  unread: "Not read on this page",
  accruing: "Accruing by the minute",
  running: "Running",
  wasRunning: "Was running",
  repaidState: "Repaid",
  defaulted: "Defaulted, claimed by the lender",
  none: "None",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  locked: "The collateral the borrower locked in escrow, from the loan's terms in the creation log.",
  returned: "The collateral the loan contract sent back to the borrower when the loan was repaid.",
  seized: "The collateral the lender took when the borrower let the deadline pass, from the claim's log.",
  lent: "The credit the lender handed the borrower, from the loan's terms in the creation log.",
  interestFixed: "The interest the terms fix at creation: the repay total less the principal.",
  repaid:
    "What the borrower paid to reclaim the collateral: the principal plus the interest, from the repayment's log and the loan's terms.",
  cleared: "The debt the lender's default claim cleared: what the loan owed at its deadline, from the loan's terms.",
  collateralLast: "The collateral in escrow once the loan's previous event had run.",
  debtLast: "The debt once the loan's previous event had run, from the loan's replay over its terms.",
  interest:
    "What the loan's rate added to the debt since the previous event, by the minute, up to this event or the deadline.",
  collateralBefore: "The collateral in escrow just before this event, from the loan's replay over its terms.",
  debtBefore: "The debt just before this event, interest included, from the loan's replay over its terms.",
  collateralTotal:
    "The collateral in escrow once this event had run: the terms' collateral from the creation until the repayment or the default claim releases it.",
  debtTotal:
    "The debt once this event had run: the principal plus the interest the terms fix or accrue, less what the repayment paid or the default claim cleared.",
  dueDate:
    "The loan's deadline once this event had run: the date its terms struck, or the date the extensions moved it to. Past it an unpaid loan can be claimed as defaulted.",
  state:
    "Where the loan stands once this event had run: running until it is repaid, or until the lender claims the collateral after the deadline.",
  repayAmount:
    "What the borrower must pay to reclaim the collateral: the principal plus the interest. A v1.1 loan fixes the total at creation; a loan with an APR accrues it by the minute until repayment.",
  struck: "The deadline the loan's terms struck at creation: a fixed date, or the creation time plus a duration.",
  extensions:
    "How many times the deadline has been extended, as the loan page counts them from the loan's extension events.",
  rate: "The interest as a rate: the terms' APR on a loan that accrues, or the fixed interest as a share of the principal over the term struck. An extension moves the deadline and leaves the rate alone.",
  extendLimit: "How far an extension may move the deadline, from the loan contract's rule.",
};

export interface PwnSheetArgs {
  ctx: PwnContext;
  coords: PwnCoords;
  /** The loan's replay around this row; null where the page draws none. */
  sides: Record<FlowSide, PwnSheetSide> | null;
  /** The event's time, unix seconds. */
  timestamp?: number;
  /** The loan's creation, where the page hands it down: its deadline, as the
   *  extensions left it, is the due date a repayment or a claim stands under. */
  creation?: { ctx: PwnContext; timestamp: number };
}

const fmt = (n: number): string => formatNumber(n);
const EPS = 1e-9;

/** "2024-06-15 10:21 UTC", the receipt's exact deadline. */
const utcMinute = (v: string | number): string =>
  `${new Date(Number(v) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function pwnSheet({ ctx, coords, sides, timestamp, creation }: PwnSheetArgs): EventSheet | undefined {
  const kind = ctx.eventType;
  const seized = kind === "claimed" && ctx.defaulted === true;
  if (kind === "minted" || kind === "burned") return undefined;
  if (kind === "claimed" && !seized) return undefined;
  if (!sides || !ctx.collateralSymbol || !ctx.creditSymbol) return undefined;

  const cs = ctx.collateralSymbol;
  const ds = ctx.creditSymbol;
  const isNft = ctx.collateralCategory === "ERC721" || ctx.collateralCategory === "ERC1155";
  const nftText = isNft && ctx.collateralId != null ? `#${shortTokenId(ctx.collateralId)}` : null;
  const collText = (n: number) => nftText ?? fmt(n);

  const coll = sides.collateral;
  const debt = sides.debt;
  const collMove = coll.after - coll.before;
  const debtMove = debt.after - debt.before;

  const lastProv = (side: FlowSide, sym: string): Provenance => ({
    ...flowCellProv(side, sym, coords),
    summary:
      side === "collateral"
        ? `Collateral in escrow (${sym}) — what the loan held once its previous event had run, from the loan's replay over its terms.`
        : `Debt (${sym}) — what the borrower owed once the loan's previous event had run: the principal plus the interest the terms fix or accrue, to that event.`,
  });
  const beforeProv = (side: FlowSide, sym: string): Provenance => ({
    ...flowCellProv(side, sym, coords),
    summary:
      side === "collateral"
        ? `Collateral in escrow (${sym}) — what the loan held just before this event: nothing before the creation, the terms' collateral after it.`
        : `Debt (${sym}) — what the borrower owed just before this event: nothing before the creation; before a repayment or a default claim, the principal plus the interest built by then (stopped at the deadline).`,
  });

  // ── Collateral ──
  const collRows: SheetRow[] = [];
  if (kind === "created" || kind === "paid_back" || seized) {
    const info =
      kind === "created"
        ? collateralLockedProv(cs, coords)
        : seized
          ? collateralSeizedProv(cs, coords)
          : collateralReturnedProv(cs, coords);
    const n = Number(ctx.collateralAmount ?? Math.abs(collMove));
    collRows.push({
      key: "collateral",
      label: kind === "created" ? WORDS.locked : seized ? WORDS.seized : WORDS.returned,
      amount: {
        text: `${kind === "created" ? "+" : "−"}${collText(n)}`,
        symbol: cs,
        address: ctx.collateralAsset,
        info,
        value: ctx.collateralAmount,
      },
      tip: kind === "created" ? TIPS.locked : seized ? TIPS.seized : TIPS.returned,
    });
  }
  const collBefore: SheetRow | undefined =
    coll.last != null
      ? {
          key: "before",
          label: SHEET_WORDS.before,
          amount: {
            text: coll.before > EPS ? collText(coll.before) : "0",
            symbol: cs,
            address: ctx.collateralAsset,
            info: beforeProv("collateral", cs),
            value: String(coll.before),
          },
          tip: TIPS.collateralBefore,
        }
      : undefined;
  const collTotal = {
    text: coll.after > EPS ? `${nftText ?? fmt(coll.after)} ${cs}` : `0 ${cs}`,
    info: flowCellProv("collateral", cs, coords),
    value: String(coll.after),
  };

  // ── Debt ──
  const repay = rowRepay(ctx, coords);
  const debtRows: SheetRow[] = [];
  const debtFig = (text: string, info: Provenance, value?: string): NonNullable<SheetRow["amount"]> => ({
    text,
    symbol: ds,
    address: ctx.creditAsset,
    info,
    value,
  });
  if (kind === "created") {
    debtRows.push({
      key: "credit",
      label: WORDS.lent,
      amount: debtFig(`+${fmt(Number(ctx.creditAmount ?? "0"))}`, creditAdvancedProv(ds, coords), ctx.creditAmount),
      tip: TIPS.lent,
    });
    const interest =
      ctx.loanRepayAmount != null && ctx.creditAmount != null
        ? Number(ctx.loanRepayAmount) - Number(ctx.creditAmount)
        : 0;
    if (interest > 0)
      debtRows.push({
        key: "interest-fixed",
        label: WORDS.interestFixed,
        amount: debtFig(`+${fmt(interest)}`, positionInterestProv(ds, ctx.version)),
        tip: TIPS.interestFixed,
      });
  } else if (kind === "paid_back") {
    const amount = repay ? Number(repay.amount) : Math.abs(debtMove);
    const a = ctx.accrued;
    debtRows.push({
      key: "repaid",
      label: WORDS.repaid,
      note:
        repay?.accrued && a
          ? `${fmt(a.interest)} interest at ${aprText(a.apr)} over ${minutesText(a.minutes)}`
          : undefined,
      amount: debtFig(`−${fmt(amount)}`, repay ? repay.prov : flowCellProv("debt", ds, coords), repay?.amount),
      tip: TIPS.repaid,
    });
  } else if (seized) {
    const amount = repay ? Number(repay.amount) : debt.before;
    debtRows.push({
      key: "cleared",
      label: WORDS.cleared,
      amount: debtFig(`−${fmt(amount)}`, repay ? repay.prov : flowCellProv("debt", ds, coords), repay?.amount),
      tip: TIPS.cleared,
    });
  }
  const debtCarry: SheetRow[] = [];
  let debtBeforeRow: SheetRow | undefined;
  // The debt just before the event's act: a closing row's replay figure
  // leaves out the interest built since the row before, which the repayment or
  // the claim states.
  const debtBefore = (kind === "paid_back" || seized) && repay ? Number(repay.amount) : debt.before;
  if (debt.last != null && (debt.last > EPS || debtBefore > EPS)) {
    // "Last event" and the interest since stand only where interest built;
    // otherwise the debt before the event is the debt the last event left.
    const built = debtBefore - debt.last;
    if (built > EPS * Math.max(1, debtBefore)) {
      debtCarry.push({
        key: "last",
        label: SHEET_WORDS.last,
        amount: debtFig(fmt(debt.last), lastProv("debt", ds), String(debt.last)),
        tip: TIPS.debtLast,
      });
      debtCarry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        amount: debtFig(
          fmt(built),
          {
            ...flowCellProv("debt", ds, coords),
            kind: "derived",
            summary: `Interest since the loan's previous event (${ds}) — the debt just before this event less the debt once the previous event had run — what the terms' APR added by the minute, stopped at the deadline.`,
            formula: "debt before − debt after the previous event",
          },
          String(built),
        ),
        tip: TIPS.interest,
      });
    }
    debtBeforeRow = {
      key: "before",
      label: SHEET_WORDS.before,
      amount: debtFig(fmt(debtBefore), beforeProv("debt", ds), String(debtBefore)),
      tip: TIPS.debtBefore,
    };
  }

  const collSide: SheetSide = {
    side: "collateral",
    icons: [cs],
    carry: [],
    before: collBefore,
    rows: collRows,
    total: collTotal,
    totalTip: TIPS.collateralTotal,
  };
  const debtSide: SheetSide = {
    side: "debt",
    icons: [ds],
    carry: debtCarry,
    before: debtBeforeRow,
    rows: debtRows,
    total: {
      text: `${fmt(debt.after)} ${ds}`,
      info: flowCellProv("debt", ds, coords),
      value: String(debt.after),
    },
    totalTip: TIPS.debtTotal,
  };

  // ── Risk: the due date and the loan's state ──
  const struckOf = (c: PwnContext, at: number | undefined) =>
    c.dueValue == null
      ? null
      : c.dueKind === "duration"
        ? at != null
          ? at + Number(c.dueValue)
          : null
        : Number(c.dueValue);
  const struck = struckOf(ctx, timestamp);
  const dueFig = (ts: number, info: Provenance) => ({ text: formatDate(ts), info, value: utcMinute(ts) });
  const unread = { none: WORDS.unread };
  let due: SheetStat["value"] = unread;
  if (kind === "created") {
    const end = ctx.finalDeadline ?? struck;
    if (end != null) {
      const moved = struck != null && ctx.finalDeadline != null && ctx.finalDeadline !== struck;
      due = dueFig(end, moved ? extendedDeadlineProv(coords) : bookDueProv(ctx.dueKind ?? null));
    }
  } else if ((kind === "paid_back" || kind === "claimed") && creation) {
    // A repayment or a claim ends the loan, so every extension came before
    // it: the creation's final deadline is the one it stood under.
    const c = creation.ctx;
    const cStruck = struckOf(c, creation.timestamp);
    const end = c.finalDeadline ?? cStruck;
    if (end != null) {
      const moved = cStruck != null && c.finalDeadline != null && c.finalDeadline !== cStruck;
      due = dueFig(end, moved ? extendedDeadlineProv(coords) : bookDueProv(c.dueKind ?? null));
    }
  }
  const stateText = kind === "paid_back" ? WORDS.repaidState : seized ? WORDS.defaulted : WORDS.running;
  const risk: SheetStat[] = [
    { key: "due-date", label: WORDS.dueDate, value: due, tip: TIPS.dueDate },
    {
      key: "state",
      label: WORDS.state,
      value: {
        text: stateText,
        info: {
          ...flowCellProv("debt", ds, coords),
          kind: "chain",
          summary: `The loan's state — where it stood once this event had run: ${
            kind === "paid_back"
              ? "repaid, the borrower paid the loan back and the collateral is released"
              : seized
                ? "defaulted and claimed, the lender took the collateral after the deadline"
                : "running, neither repaid nor claimed"
          }.`,
          via:
            kind === "paid_back"
              ? "captured PWN events (pwn_*) · LOANPaidBack log"
              : seized
                ? "captured PWN events (pwn_*) · LOANClaimed log (defaulted)"
                : "captured PWN events (pwn_*) · LOANCreated log",
        },
      },
      change:
        kind === "paid_back"
          ? {
              text: WORDS.wasRunning,
              info: {
                ...flowCellProv("debt", ds, coords),
                kind: "chain",
                summary:
                  "The loan's state before this event — running. A repayment is accepted only while the loan runs, before its deadline passes.",
                via: "captured PWN events (pwn_*) · LOANPaidBack log",
              },
            }
          : null,
      tip: TIPS.state,
    },
  ];

  // ── Limits: the repay amount ──
  const repayValue: SheetStat["value"] = repay
    ? { text: `${fmt(Number(repay.amount))} ${ds}`, info: repay.prov, value: repay.amount }
    : ctx.accruingInterestApr != null
      ? { none: WORDS.accruing }
      : unread;
  const limits: SheetStat[] = [
    { key: "repay-amount", label: WORDS.repayAmount, value: repayValue, tip: TIPS.repayAmount },
  ];

  // ── Breakdown: the extension rules ──
  const interest =
    ctx.loanRepayAmount != null && ctx.creditAmount != null
      ? Number(ctx.loanRepayAmount) - Number(ctx.creditAmount)
      : 0;
  const term = struck != null && timestamp != null && kind === "created" ? struck - timestamp : null;
  const fixedRate =
    kind === "created" && interest > 0 && ctx.creditAmount != null
      ? fixedInterestRate(interest, Number(ctx.creditAmount), term)
      : null;
  const rateValue: SheetStat["value"] =
    ctx.accruingInterestApr != null
      ? { text: aprText(ctx.accruingInterestApr), info: positionInterestProv(ds, ctx.version) }
      : fixedRate
        ? { text: interestRateText(fixedRate), info: positionInterestProv(ds, ctx.version) }
        : unread;
  const extCount = ctx.extensionCount;
  const breakdown: SheetStat[] = [
    {
      key: "deadline-struck",
      label: WORDS.struck,
      value: kind === "created" && struck != null ? dueFig(struck, bookDueProv(ctx.dueKind ?? null)) : unread,
      tip: TIPS.struck,
    },
    {
      key: "extensions",
      label: WORDS.extensions,
      value:
        kind === "created" && extCount != null
          ? {
              text: extCount === 0 ? WORDS.none : String(extCount),
              info: extendedDeadlineProv(coords),
              value: String(extCount),
            }
          : unread,
      tip: TIPS.extensions,
    },
    { key: "rate", label: WORDS.rate, value: rateValue, tip: TIPS.rate },
    {
      key: "extension-limit",
      label: WORDS.extendLimit,
      value: ctx.version === "v11" ? { text: "30 days from the call", info: extendedDeadlineProv(coords) } : unread,
      tip: TIPS.extendLimit,
    },
  ];

  return {
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown },
    ],
  };
}
