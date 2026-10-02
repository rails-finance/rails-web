"use client";

// What the clock says about a PWN loan, where no event says it.
// ----------------------------------------------------------------------------
// A PWN loan defaults when its deadline passes unpaid, and nothing is written
// on chain at that moment: the next event is the lender's claim, which may
// never come. So a loan past its deadline and unclaimed has no row for the
// moment it defaulted, and the timeline's usual header ("Active since … · N
// days", a live dot) reads it as running. Two pieces here state it from the
// terms and the clock:
//
//   - <PwnLoanTenure>, the timeline header: "Defaulted 1 Jan 2024, not yet
//     claimed · open 1,032 days" on such a loan, and "Opened … · ran 44.8 of
//     its 45 days" on a settled one, so the time the loan ran and the term it
//     was struck for stand side by side;
//   - <PwnDeadlinePassedRow>, a row in the timeline's head slot marking the
//     deadline, drawn as a note (never counted as an event) and saying it has
//     no event behind it.

import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { useMountedNow } from "@/hooks/useMountedNow";
import { MountedAge } from "@/components/shared/mounted-age";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { SpineTipContext } from "@/components/shared/spine-column";
import { Prov } from "@/components/shared/provenance";
import { PILL_META } from "@/lib/shared/ui-grammar";
import { formatDate, formatDuration } from "@/lib/date";
import { bookDueProv, bookPastDueProv, extendedDeadlineProv } from "@/lib/pwn/event-provenance";
import type { PwnLoanState } from "@/lib/pwn/economics";

/** "2024-01-01 16:58 UTC" — a moment to the minute. */
export const utcMinuteText = (unix: number): string =>
  `${new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** A span in days: whole where it is whole to a tenth ("45"), else to one
 *  decimal ("44.8"). */
export function daysText(seconds: number): string {
  const d = seconds / 86400;
  return Math.abs(d - Math.round(d)) < 0.05
    ? Math.round(d).toLocaleString("en-US")
    : d.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function PwnLoanTenure({
  state,
  createdAt,
  deadline,
  closedAt,
  lastAt,
  fallback = null,
}: {
  state: PwnLoanState;
  /** Loan creation (unix seconds). */
  createdAt: number;
  /** The deadline the loan runs to, extensions included. */
  deadline: number | null;
  /** When the loan settled (the repayment, or the lender's claim). */
  closedAt: number | null;
  /** The loan's newest event. */
  lastAt: number;
  /** Drawn where the loan's figures do not resolve a span. */
  fallback?: ReactNode;
}) {
  // The clock arrives after mount (hooks/useMountedNow): a page's server render
  // and a browser an hour or a day apart would otherwise draw different ages.
  const now = useMountedNow();
  const ago = (
    <span className={PILL_META} title={`Last activity ${formatDate(lastAt)}`}>
      <Clock size={12} />
      <MountedAge from={lastAt} suffix=" ago" />
    </span>
  );
  const term = deadline != null ? deadline - createdAt : null;

  if (state === "unclaimed" && deadline != null) {
    const openDays = now == null ? null : Math.floor((now - createdAt) / 86400);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-pwn-tenure="unclaimed">
        <span className="text-foreground">
          Defaulted{" "}
          <span title={utcMinuteText(deadline)}>
            <Prov info={bookPastDueProv()}>{formatDate(deadline)}</Prov>
          </span>
          , not yet claimed
        </span>
        <span
          className={PILL_META}
          data-prov-exempt=""
          title={`Open since ${formatDate(createdAt)}: the collateral stays in escrow until the lender claims it`}
        >
          {openDays == null ? (
            <span className="invisible">open 0,000 days</span>
          ) : (
            <>
              open {openDays.toLocaleString("en-US")} {openDays === 1 ? "day" : "days"}
            </>
          )}
        </span>
        {ago}
      </div>
    );
  }

  if ((state === "repaid" || state === "defaulted") && closedAt != null && term != null && term > 0) {
    const ran = closedAt - createdAt;
    const within = closedAt <= deadline!;
    const text =
      state === "repaid" && within
        ? `ran ${daysText(ran)} of its ${daysText(term)} days`
        : state === "repaid"
          ? `ran ${daysText(ran)} days against a ${daysText(term)}-day term`
          : `ran its ${daysText(term)} days · claimed ${formatDuration(deadline!, closedAt)} after the deadline`;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-pwn-tenure={state}>
        <span className="text-foreground">Opened {formatDate(createdAt)}</span>
        <span
          className={PILL_META}
          data-prov-exempt=""
          title={`Opened ${utcMinuteText(createdAt)}, ${state === "repaid" ? "repaid" : "claimed"} ${utcMinuteText(closedAt)}; the deadline ${utcMinuteText(deadline!)}`}
        >
          {text}
        </span>
        {ago}
      </div>
    );
  }
  return <>{fallback}</>;
}

/** "1,002 days ago". */
const daysAgoText = (from: number, now: number): string => {
  const d = Math.floor((now - from) / 86400);
  return d < 1 ? `${formatDuration(from, now)} ago` : `${d.toLocaleString("en-US")} ${d === 1 ? "day" : "days"} ago`;
};

export function PwnDeadlinePassedRow({
  deadline,
  extended,
  dueKind,
  loanId,
  version,
  owed,
  collateral,
  isFirst = false,
}: {
  deadline: number;
  /** The deadline is an extension's, not the terms'. */
  extended: boolean;
  dueKind: "expiration" | "duration" | null;
  loanId: string;
  version: string | null;
  /** "50.205 USDC" — what the loan owed when the deadline passed. */
  owed: string | null;
  /** "PWN Bundle #29" — what stays in escrow. */
  collateral: string;
  isFirst?: boolean;
}) {
  const now = useMountedNow();
  const prov = extended ? extendedDeadlineProv({ loanId, version }) : bookDueProv(dueKind);
  // The head slot hands this row the live tip's pulsing dot; a defaulted loan
  // is not live, so the row declines it.
  return (
    <SpineTipContext.Provider value={null}>
      <NoteRowShell
        icon="live-window"
        isFirst={isFirst}
        label={`Deadline passed unpaid on ${formatDate(deadline)}: the lender can claim the collateral. Read from the clock; no event marks it.`}
        marker={{ attr: "data-pwn-deadline-row", value: String(deadline) }}
        header={
          <>
            <span className="text-sm text-foreground">Deadline passed unpaid: the lender can claim the collateral</span>
            <span className="ml-auto text-xs text-rb-500">
              <span title={utcMinuteText(deadline)}>
                <Prov info={prov}>{formatDate(deadline)}</Prov>
              </span>{" "}
              · {now == null ? <span className="invisible">0,000 days ago</span> : daysAgoText(deadline, now)} · from
              the clock, no event
            </span>
          </>
        }
      >
        <div className="px-5 pb-3 pt-1 text-xs space-y-2 text-rb-500">
          <p className="leading-relaxed">
            The {extended ? "extended deadline" : "terms set the deadline"} at{" "}
            <span className="text-foreground">{utcMinuteText(deadline)}</span>. No repayment came before it, and the
            loan contract refuses one after it, so the loan defaulted at that minute
            {owed ? <>, owing {owed}</> : null}.
          </p>
          <p className="leading-relaxed">
            Nothing is written on chain when a deadline passes: this row is read from the terms and the clock, and no
            transaction stands behind it. {collateral} stays in escrow until the lender claims it; the claim is the
            loan&rsquo;s next event.
          </p>
        </div>
      </NoteRowShell>
    </SpineTipContext.Provider>
  );
}
