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
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import { positionCreditProv, positionInterestProv, positionCollateralProv } from "@/lib/pwn/event-provenance";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { PwnAccrual, UnreadToken } from "@/lib/shared/types/event-shape";

export type { PwnAccrual };

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

/** The term's share of the principal at the fewest decimals that give the
 *  interest back to within 0.05%: 50 USDC at 0.411% is 0.2055, the
 *  terms' 0.205479 — where 0.4% would give 0.2. Whole shares stay whole ("8%"). */
export function termPctText(p: number): string {
  for (let d = 0; d <= 6; d++) {
    const shown = Number(p.toFixed(d));
    if (p === 0 || Math.abs(shown - p) / p < 0.0005) return `${p.toFixed(d)}%`;
  }
  return `${p.toFixed(6)}%`;
}

/** "8% for 30 days, 97% a year" — the rate as the card and the rows state it. */
export const interestRateText = (r: PwnInterestRate): string =>
  `${termPctText(r.termPct)} for ${r.termDays} ${r.termDays === 1 ? "day" : "days"}, ${pctText(r.annualPct)} a year`;

/** The loan's fixed interest as a rate over the term the parties struck. */
export function loanInterestRate(v: PwnPositionView): PwnInterestRate | null {
  const struck = loanDueAt(v);
  return fixedInterestRate(
    v.fixedInterest,
    v.credit?.amount ?? null,
    struck != null && v.createdAt != null ? struck - v.createdAt : null,
  );
}

// ── v1.2 / v1.3: interest that accrues ───────────────────────────────────────
// PWNSimpleLoan v1.2 and v1.3 (`_loanAccruedInterest`): interest = fixed part +
// principal × APR × whole minutes since the loan started ÷ the denominator,
// rounded down (Math.mulDiv). APR carries two decimals (6000 = 60.00%). On
// repayment the contract stores that figure and the borrower pays principal +
// it; the repayment is refused once the deadline passes, so a defaulted loan's
// debt stops at its deadline.

/** `ACCRUING_INTEREST_APR_DENOMINATOR`: 1e2 (APR decimals) × 525,600 minutes in
 *  a 365-day year × 100 (percent). */
export const APR_DENOMINATOR = BigInt(100) * BigInt(525_600) * BigInt(100);

/** Does this loan's interest accrue (a v1.2/v1.3 APR above zero)? */
export const isAccruing = (v: { accruingInterestApr?: number | null }): boolean => (v.accruingInterestApr ?? 0) > 0;

/** "60% a year" from the terms' APR (6000). */
export const aprText = (apr: number): string => `${pctText(apr / 100)} a year`;

/** Raw integer → number at `decimals`, exact to the float's precision. */
function scaled(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const s = raw.toString().padStart(decimals + 1, "0");
  return Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
}

/** The contract's sum: what a loan struck at `from` owes at `to`. */
export function accrueTo(
  principalRaw: string,
  decimals: number,
  apr: number,
  fixedRaw: string | null | undefined,
  from: number,
  to: number,
): PwnAccrual | null {
  let principal: bigint;
  let fixed: bigint;
  try {
    principal = BigInt(principalRaw);
    fixed = BigInt(fixedRaw ?? "0");
  } catch {
    return null;
  }
  if (!(to >= from)) return null;
  const minutes = Math.floor((to - from) / 60);
  const interest = fixed + (principal * BigInt(apr) * BigInt(minutes)) / APR_DENOMINATOR;
  const total = principal + interest;
  return {
    principal: scaled(principal, decimals),
    interest: scaled(interest, decimals),
    total: scaled(total, decimals),
    principalRaw: principal.toString(),
    interestRaw: interest.toString(),
    totalRaw: total.toString(),
    fixedRaw: fixed.toString(),
    apr,
    minutes,
    from,
    to,
  };
}

/** "44 days 19 h" — a run of minutes as the rows state it. */
export function minutesText(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  if (d === 0) return `${h} h`;
  return h === 0 ? `${d} ${d === 1 ? "day" : "days"}` : `${d} ${d === 1 ? "day" : "days"} ${h} h`;
}

/** What the loan costs, stated once for every surface:
 *  - `fixed`: a v1.1 repay total (or a v1.2+ fixed part with no APR), struck at origination;
 *  - `accruing`, `paid`: what the borrower paid, principal + interest to the repayment's minute;
 *  - `accruing`, `at-deadline`: what the loan owes at its deadline (the most it can reach). */
export interface PwnLoanCost {
  shape: "fixed" | "accruing";
  basis: "struck" | "paid" | "at-deadline";
  total: number;
  interest: number;
  rate: PwnInterestRate | null;
  accrual: PwnAccrual | null;
}

export function loanCost(v: PwnPositionView): PwnLoanCost | null {
  const c = v.credit;
  if (!c || c.decimalsUnread) return null;
  if (v.repayAmount != null && v.fixedInterest != null)
    return {
      shape: "fixed",
      basis: "struck",
      total: v.repayAmount,
      interest: v.fixedInterest,
      rate: loanInterestRate(v),
      accrual: null,
    };
  if (c.decimals == null || v.createdAt == null) return null;
  if (!isAccruing(v)) {
    // A v1.2+ loan whose terms carry only a fixed part.
    const a = accrueTo(c.amountRaw, c.decimals, 0, v.fixedInterestRaw, v.createdAt, v.createdAt);
    if (!a || v.fixedInterestRaw == null) return null;
    return { shape: "fixed", basis: "struck", total: a.total, interest: a.interest, rate: null, accrual: null };
  }
  const apr = v.accruingInterestApr!;
  if (v.status === "repaid") {
    if (v.repaidAt == null) return null;
    const a = accrueTo(c.amountRaw, c.decimals, apr, v.fixedInterestRaw, v.createdAt, v.repaidAt);
    return a
      ? { shape: "accruing", basis: "paid", total: a.total, interest: a.interest, rate: null, accrual: a }
      : null;
  }
  const due = loanDeadlineAt(v);
  if (due == null) return null;
  const a = accrueTo(c.amountRaw, c.decimals, apr, v.fixedInterestRaw, v.createdAt, due);
  return a
    ? { shape: "accruing", basis: "at-deadline", total: a.total, interest: a.interest, rate: null, accrual: a }
    : null;
}

// ── Where a loan stands ──────────────────────────────────────────────────────
// The index says open / repaid / defaulted by the loan's events. A loan the
// index calls open whose deadline has passed is defaulted on chain (every
// version's `repayLOAN` reverts `LoanDefaulted` once the deadline passes); it
// is waiting for the lender's claim. One rule for the listing, the book and
// the card: such a loan is "defaulted, not yet claimed".

export type PwnLoanState = "running" | "unclaimed" | "repaid" | "defaulted";

export function pwnLoanState(
  l: {
    status: "open" | "repaid" | "defaulted";
    dueKind: "expiration" | "duration" | null;
    dueValue: string | null;
    createdAt?: number | null;
    extendedDueAt?: number | null;
  },
  now: number = Date.now() / 1000,
): PwnLoanState {
  if (l.status !== "open") return l.status;
  const due = loanDeadlineAt(l);
  return due != null && due <= now ? "unclaimed" : "running";
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
    // The nothing-accrues claim rides the terms: a repay total (v1.1) or a
    // fixed part with no APR; a loan whose terms accrue gets different wording.
    flowsNote: !isAccruing(view)
      ? "A PWN loan is a single fixed-term credit: the principal goes out at origination and comes back with its fixed interest at repayment. Nothing accrues in between, so there is no flow history to accumulate. The tower shows the loan's current state."
      : "A PWN loan is a single fixed-term credit: the principal goes out at origination and comes back with its interest at repayment. This loan's interest accrues by the minute at the rate its terms state, so the total lands only at repayment; the tower shows the principal as struck.",
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

/** Build a card view from the listing summary row. Client-safe, so the
 *  server-side loan book reads a loan's cost through the same view. */
export function viewFromSummary(s: PwnPositionSummary): PwnPositionView {
  const fixedInterest =
    s.repayAmount != null && s.credit != null && !s.credit.decimalsUnread
      ? // Twelve significant figures: the two scaled amounts are floats, and
        // 1,490.4 − 1,380 is 110.40000000000009 without it.
        // exponent-safe: parsed back to a number, never printed
        Number(Math.max(0, s.repayAmount - s.credit.amount).toPrecision(12))
      : null;
  return {
    loanId: s.loanId,
    status: s.status,
    version: s.version,
    lender: s.lender,
    borrower: s.borrower,
    collateral: s.collateral,
    credit: s.credit,
    repayAmount: s.repayAmount,
    repayAmountRaw: s.repayAmountRaw,
    fixedInterest,
    accruingInterestApr: s.accruingInterestApr,
    fixedInterestRaw: s.fixedInterestRaw ?? null,
    dueKind: s.dueKind,
    dueValue: s.dueValue,
    createdAt: s.createdAt,
    createdBlock: s.createdBlock,
    lastActivityAt: s.closedAt ?? s.createdAt,
    eventCount: s.eventCount,
    txCount: s.txCount ?? null,
    extendedDueAt: s.latestDefaultAt ?? null,
    extensionCount: s.extensionCount ?? 0,
  };
}
