"use client";

// PWN event detail (chain-state tier) — adapter onto the shared ChainTruthDetail
// grid. A PWN loan's economics are FIXED at creation and don't accrue, so unlike
// Spark/Comet there is no before→after replay: every event shows the loan's fixed
// terms — the collateral and where it stands after this event, the credit
// principal, the repay total — each traced via <Prov>. The creation adds the
// fixed interest and its rate; an extension shows the deadline it moved.
// Current-debt-with-interest, USD, HF are absent by construction.

import type { PwnContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import { usePwnLedgerPending, usePwnLedgerSides } from "./pwn-ledger";
import {
  flowCellBeforeProv,
  flowCellProv,
  collateralLockedProv,
  collateralReturnedProv,
  collateralSeizedProv,
  creditAdvancedProv,
  extendedDeadlineProv,
  positionInterestProv,
  bookDueProv,
  repayAmountProv,
  rowRepay,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { aprText, fixedInterestRate, interestRateText, minutesText } from "@/lib/pwn/economics";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import type { PwnEvent } from "@/lib/pwn/explainer-clauses";

export interface PwnEventDetailProps {
  ctx: PwnContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's time (unix seconds) — the creation's, to state the term. */
  timestamp?: number;
  /** Same-transaction events: a burn reads where the collateral went from the
   *  claim or repayment beside it. */
  siblings?: PwnEvent[];
  /** The event's id, for its ledgers (components/protocol/pwn/pwn-ledger.tsx). */
  eventId?: string;
}

/** Matches the explainer's echo keys (lib/pwn/explainer-clauses.tsx `fmt`). */
const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** "2024-06-15 10:21 UTC" — the deadline's exact moment, for its tip and receipt. */
const utcMinute = (v: string): string =>
  `${new Date(Number(v) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

type CollateralState = "locked" | "returned" | "claimed" | "closed";

/** Where the collateral stands AFTER this event. One word per state, whatever
 *  the row: locked in escrow until the loan settles, then returned to the
 *  borrower (repaid) or claimed by the lender (defaulted). */
function collateralState(ctx: PwnContext, siblings: PwnEvent[]): CollateralState {
  switch (ctx.eventType) {
    case "paid_back":
      return "returned";
    case "claimed":
      return ctx.defaulted ? "claimed" : "returned";
    case "burned": {
      const close = siblings.find(
        (e) => e.context.data.eventType === "claimed" || e.context.data.eventType === "paid_back",
      );
      if (!close) return "closed";
      const d = close.context.data;
      return d.eventType === "claimed" && d.defaulted ? "claimed" : "returned";
    }
    default:
      return "locked";
  }
}

const STATE_LABEL: Record<CollateralState, string> = {
  locked: "Collateral · locked in escrow",
  returned: "Collateral · returned to borrower",
  claimed: "Collateral · claimed by lender",
  closed: "Collateral · none (loan closed)",
};

export function PwnEventDetail({ ctx, txHash, blockNumber, timestamp, siblings = [], eventId }: PwnEventDetailProps) {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const isNft = ctx.collateralCategory === "ERC721" || ctx.collateralCategory === "ERC1155";
  const seized = ctx.eventType === "claimed" && ctx.defaulted === true;
  const state = collateralState(ctx, siblings);
  const stats: ChainTruthStat[] = [];
  // A flow row (the creation, the repayment, a default claim) leads with the
  // loan's Collateral and Debt as the Lifetime flows replay states them, each
  // opening into its ledger; while the replay is on its way they stand as
  // placeholder rows.
  const sides = usePwnLedgerSides(eventId ?? "");
  const ledgerPending = usePwnLedgerPending();
  const flowRow = ctx.eventType === "created" || ctx.eventType === "paid_back" || seized;
  const ledgerCells = flowRow && eventId != null && (sides != null || ledgerPending);
  const ledgerCell = (side: FlowSide, label: string, symbol: string, sub?: string): ChainTruthStat => {
    const s = sides?.[side];
    const after = s?.after ?? 0;
    const before = s?.before ?? 0;
    const change = after - before;
    return {
      label,
      value: String(after),
      display: formatNumber(after),
      symbol,
      prov: flowCellProv(side, symbol, coords),
      ledger: side,
      ...(s && change !== 0
        ? {
            transition: {
              before: formatNumber(before),
              beforeExact: String(before),
              beforeProv: flowCellBeforeProv(side, symbol, coords),
              change: `${change > 0 ? "+" : "\u2212"}${formatNumber(Math.abs(change))}`,
              changeExact: `${change > 0 ? "+" : "\u2212"}${Math.abs(change)}`,
              changeProv: flowCellProv(side, symbol, coords),
              shownAsIs: true,
            },
          }
        : {}),
      ...(sub ? { sub } : {}),
    };
  };
  if (ledgerCells && ctx.collateralSymbol) {
    const what =
      isNft && ctx.collateralId != null ? `${ctx.collateralSymbol} #${shortTokenId(ctx.collateralId)}` : null;
    const where =
      state === "claimed"
        ? "claimed by the lender"
        : state === "returned"
          ? "returned to the borrower"
          : "locked in escrow";
    stats.push(ledgerCell("collateral", "Collateral", ctx.collateralSymbol, what ? `${what} ${where}` : where));
  }
  if (ledgerCells && ctx.creditSymbol)
    stats.push(
      ledgerCell(
        "debt",
        "Debt",
        ctx.creditSymbol,
        seized ? "cleared by the default claim" : ctx.eventType === "paid_back" ? "repaid in full" : undefined,
      ),
    );

  if (ctx.collateralSymbol && !ledgerCells) {
    const nftValue = isNft && ctx.collateralId != null ? `#${shortTokenId(ctx.collateralId)}` : null;
    const collValue = nftValue ?? fmt(ctx.collateralAmount);
    stats.push({
      label: STATE_LABEL[state],
      value: collValue,
      display: nftValue ?? `${collValue} ${ctx.collateralSymbol}`,
      symbol: ctx.collateralSymbol,
      prov:
        state === "claimed"
          ? collateralSeizedProv(ctx.collateralSymbol, coords)
          : state === "returned"
            ? collateralReturnedProv(ctx.collateralSymbol, coords)
            : collateralLockedProv(ctx.collateralSymbol, coords),
      // The rows that moved it draw it in the foreground.
      changed: ctx.eventType === "created" || ctx.eventType === "paid_back" || seized,
    });
  }

  if (ctx.creditSymbol) {
    stats.push({
      label: "Credit · principal",
      value: fmt(ctx.creditAmount),
      display: `${fmt(ctx.creditAmount)} ${ctx.creditSymbol}`,
      symbol: ctx.creditSymbol,
      prov: creditAdvancedProv(ctx.creditSymbol, coords),
    });
    const r = rowRepay(ctx, coords);
    // The LOAN note's rows (minted, burned) state the note and the collateral;
    // the loan's cost belongs to the rows that set or settle it.
    const noteRow = ctx.eventType === "minted" || ctx.eventType === "burned";
    if (noteRow) {
      // The credit tile alone.
    } else if (ctx.accruingInterestApr != null && !r) {
      // A v1.2/v1.3 loan before it settles: its terms state a rate, and the
      // total is known only at repayment (or at the deadline, on a default).
      stats.push({
        label: "Interest · accruing",
        value: aprText(ctx.accruingInterestApr),
        display: aprText(ctx.accruingInterestApr),
        symbol: "",
        prov: positionInterestProv(ctx.creditSymbol, ctx.version),
        sub: "on the principal, by the minute",
        changed: false,
      });
    } else if (r?.accrued && ctx.accrued) {
      const a = ctx.accrued;
      stats.push({
        label: a.basis === "paid" ? "Repaid · principal + interest" : "Owed · at the deadline",
        value: fmt(r.amount),
        display: `${fmt(r.amount)} ${ctx.creditSymbol}`,
        symbol: ctx.creditSymbol,
        prov: r.prov,
        sub: `${formatNumber(a.interest)} interest · ${aprText(a.apr)} over ${minutesText(a.minutes)}`,
        changed: !seized,
      });
    } else {
      stats.push({
        label: "Repay · total",
        value: fmt(ctx.loanRepayAmount),
        display: ctx.loanRepayAmount != null ? `${fmt(ctx.loanRepayAmount)} ${ctx.creditSymbol}` : undefined,
        symbol: ctx.creditSymbol,
        prov: repayAmountProv(ctx.creditSymbol, coords),
        // Muted on a defaulted claim — the borrower never paid; the lender took
        // the collateral instead of this repayment.
        changed: !seized,
      });
    }
  }

  // The creation states the loan's cost: the fixed interest and its rate over
  // the term struck (creation to the deadline in the terms).
  if (ctx.eventType === "created" && ctx.creditSymbol && ctx.loanRepayAmount != null && ctx.creditAmount != null) {
    const interest = Number(ctx.loanRepayAmount) - Number(ctx.creditAmount);
    const term =
      ctx.dueValue == null
        ? null
        : ctx.dueKind === "duration"
          ? Number(ctx.dueValue)
          : timestamp != null
            ? Number(ctx.dueValue) - timestamp
            : null;
    const rate = fixedInterestRate(interest, Number(ctx.creditAmount), term);
    if (interest > 0)
      stats.push({
        label: "Interest · fixed",
        value: formatNumber(interest),
        display: `${formatNumber(interest)} ${ctx.creditSymbol}`,
        symbol: ctx.creditSymbol,
        prov: positionInterestProv(ctx.creditSymbol, ctx.version),
        sub: rate
          ? `${interestRateText(rate)}${(ctx.extensionCount ?? 0) > 0 ? ", unchanged by the extensions" : ""}`
          : undefined,
      });
  }

  // The deadline as struck, and where the extensions took it.
  if (ctx.eventType === "created" && ctx.dueValue != null) {
    const struck =
      ctx.dueKind === "duration" ? (timestamp != null ? timestamp + Number(ctx.dueValue) : null) : Number(ctx.dueValue);
    if (struck != null)
      stats.push({
        label: "Deadline · as struck",
        value: utcMinute(String(struck)),
        display: formatDate(struck),
        symbol: "",
        prov: ctx.dueKind === "duration" ? bookDueProv("duration") : bookDueProv("expiration"),
        sub:
          ctx.finalDeadline != null && ctx.finalDeadline !== struck
            ? `later extended to ${formatDate(ctx.finalDeadline)}${
                (ctx.extensionCount ?? 0) > 0
                  ? ` (${ctx.extensionCount} extension${ctx.extensionCount === 1 ? "" : "s"})`
                  : ""
              }`
            : undefined,
        changed: false,
      });
  }

  // An extension: the deadline before and after.
  if (ctx.eventType === "extended" && ctx.extendedDefaultTimestamp != null) {
    if (ctx.originalDefaultTimestamp != null)
      stats.push({
        label: "Deadline · before",
        value: utcMinute(ctx.originalDefaultTimestamp),
        display: formatDate(Number(ctx.originalDefaultTimestamp)),
        symbol: "",
        prov: extendedDeadlineProv(coords),
        changed: false,
      });
    stats.push({
      label: "Deadline · after",
      value: utcMinute(ctx.extendedDefaultTimestamp),
      display: formatDate(Number(ctx.extendedDefaultTimestamp)),
      symbol: "",
      prov: extendedDeadlineProv(coords),
    });
  }

  return <ChainTruthDetail stats={stats} />;
}
