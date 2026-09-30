// PWN economics reducer — a chain-state member with a GENUINE principal/interest split.
// ----------------------------------------------------------------------------
// Unlike Spark (multi-reserve, amounts-only, gated) a PWN loan has the one
// faithful artifact the shared tower is built for: its debt splits into PRINCIPAL
// (the credit advanced) and FIXED INTEREST (repay − principal) in the SAME token,
// so the two stack with no price. So this reducer lights up the token-mode bars for
// an OPEN loan — collateral backing on the left, principal + fixed interest on the
// right — rather than the gated list.
//
// Amounts-only (valued:false): collateral is frequently an ERC721 (no fungible
// price), so the two towers are drawn in their own units and labelled as not
// height-comparable. A CLOSED loan (repaid / defaulted) has no live balance, so
// both `current` sides are empty and <ChainTruthTower> renders nothing — the card
// + timeline carry the settled story (never draw live bars for a closed loan).

import type { PwnPositionView } from "@/components/protocol/pwn/pwn-position-card";
import { positionCreditProv, positionInterestProv, positionCollateralProv } from "@/lib/pwn/event-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { UnreadToken } from "@/lib/shared/types/event-shape";

/** The loan's lapse moment (unix seconds): expiration terms state it outright;
 *  duration terms run from creation. Null when unresolvable. Pure and
 *  client-safe — the card, and the server-side loan book, both key on it. */
export const loanDueAt = (l: {
  dueKind: "expiration" | "duration" | null;
  dueValue: string | null;
  createdAt?: number | null;
}): number | null => {
  if (l.dueValue == null) return null;
  const v = Number(l.dueValue);
  if (!Number.isFinite(v)) return null;
  if (l.dueKind === "expiration") return v;
  if (l.dueKind === "duration") return l.createdAt != null ? l.createdAt + v : null;
  return null;
};

/** The deadline a loan runs to now: the latest extension's, where the parties
 *  moved it, else the one its terms struck. */
export const loanDeadlineAt = (l: {
  dueKind: "expiration" | "duration" | null;
  dueValue: string | null;
  createdAt?: number | null;
  extendedDueAt?: number | null;
}): number | null => l.extendedDueAt ?? loanDueAt(l);

export interface PwnInterestRate {
  /** The term the interest was struck for, in whole days. */
  termDays: number;
  /** Interest as a share of the principal over that term, in percent. */
  termPct: number;
  /** termPct scaled to 365 days, simple (no compounding), in percent. */
  annualPct: number;
}

/** The fixed interest as a rate: its share of the principal over the term the
 *  parties struck (creation to the original deadline — an extension moves the
 *  deadline, never the repay total), and that share scaled to a year, simple.
 *  Null when a figure is missing or the term is not positive. */
export function fixedInterestRate(
  interest: number | null,
  principal: number | null,
  termSeconds: number | null,
): PwnInterestRate | null {
  if (interest == null || principal == null || termSeconds == null) return null;
  if (!(principal > 0) || !(termSeconds > 0) || !(interest >= 0)) return null;
  const termDays = termSeconds / 86400;
  const termPct = (interest / principal) * 100;
  return { termDays: Math.round(termDays), termPct, annualPct: (termPct * 365) / termDays };
}

const pctText = (p: number): string => {
  const digits = p >= 100 || Math.abs(p - Math.round(p)) < 0.05 ? 0 : 1;
  return `${p.toFixed(digits)}%`;
};

/** "8% for 30 days, 97% a year" — the rate as the card and the rows state it. */
export const interestRateText = (r: PwnInterestRate): string =>
  `${pctText(r.termPct)} for ${r.termDays} ${r.termDays === 1 ? "day" : "days"}, ${pctText(r.annualPct)} a year`;

/** The loan's fixed interest as a rate over the term the parties struck. */
export function loanInterestRate(v: PwnPositionView): PwnInterestRate | null {
  const struck = loanDueAt(v);
  return fixedInterestRate(
    v.fixedInterest,
    v.credit?.amount ?? null,
    struck != null && v.createdAt != null ? struck - v.createdAt : null,
  );
}

export function computePwnEconomics(view: PwnPositionView): ChainTruthTowerData {
  const open = view.status === "open";
  // A token whose decimals did not load is left out, and the tower names it.
  const notLoaded: UnreadToken[] = [view.collateral, view.credit]
    .filter((a) => a?.decimalsUnread)
    .map((a) => ({ address: a!.address.toLowerCase(), label: a!.symbol }));
  const collUnread = !!view.collateral?.decimalsUnread;
  const creditUnread = !!view.credit?.decimalsUnread;

  const collLines: TowerLine[] =
    open && view.collateral && view.collateral.amount > 0 && !collUnread
      ? [
          {
            key: view.collateral.address,
            symbol: view.collateral.symbol,
            amount: view.collateral.amount,
            usd: null,
            prov: positionCollateralProv(view.collateral.symbol, view.version),
          },
        ]
      : [];

  // Debt = credit PRINCIPAL + FIXED INTEREST, same credit token → stackable.
  const debtLines: TowerLine[] =
    open && view.credit && view.credit.amount > 0 && !creditUnread
      ? [
          {
            key: `${view.credit.address}-principal`,
            symbol: view.credit.symbol,
            amount: view.credit.amount,
            usd: null,
            prov: positionCreditProv(view.credit.symbol, view.version),
          },
        ]
      : [];

  const interestLine: TowerLine | null =
    open && view.credit && !creditUnread && view.fixedInterest != null && view.fixedInterest > 0
      ? {
          key: `${view.credit.address}-interest`,
          symbol: view.credit.symbol,
          amount: view.fixedInterest,
          usd: null,
          prov: positionInterestProv(view.credit.symbol, view.version),
        }
      : null;

  return {
    valued: false,
    collateralUnit: view.collateral?.symbol,
    debtUnit: view.credit?.symbol,
    // The shared tower's default interest label is "Accrued interest" — on
    // PWN the interest is a fixed term of the loan and never accrues; the
    // label must say so.
    interestLabel: "Fixed interest",
    // The nothing-accrues claim rides the v1.1 proof (a repay total in the
    // terms); a loan whose terms accrue gets the shape-true variant.
    flowsNote:
      view.repayAmount != null
        ? "A PWN loan is a single fixed-term credit: the principal goes out at origination and comes back with its fixed interest at repayment. Nothing accrues in between, so there is no flow history to accumulate. The tower shows the loan's current state."
        : "A PWN loan is a single fixed-term credit: the principal goes out at origination and comes back with the interest the parties agreed at repayment. This loan's terms state that interest as a rate, so the settled total lands only at repayment; the tower shows the principal as struck.",
    collateral: {
      current: collLines,
      interest: null,
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    debt: {
      current: debtLines,
      interest: interestLine,
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    ...(open && notLoaded.length > 0 ? { notLoaded } : {}),
  };
}
