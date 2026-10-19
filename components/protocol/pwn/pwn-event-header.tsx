"use client";

// PWN event header (chain-state tier): the card's `head` slot, drawn by the
// shared ChainTruthRow. The head is words (rails-ops decision 0045,
// lib/pwn/head-words.ts): the past-participle kind, at most one clause ("Loan
// defaulted", an extension's "Deadline to <date>" with its receipt), and the
// page holder's side ("Lender", "Borrower") as a label beside it. The one
// fixed value each event concerns (the credit advanced, the repayment, the
// seized collateral) is on the spine's flank. No health factor, no USD — a
// fixed-term loan has none.

import type { PwnContext } from "@/lib/shared/types/event-shape";
import type { ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { extendedDeadlineProv, type PwnCoords } from "@/lib/pwn/event-provenance";
import { Prov } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { PWN_HEAD_WORDS, pwnT1Words } from "@/lib/pwn/head-words";

export interface PwnEventHeaderProps {
  ctx: PwnContext;
  txHash?: string;
  blockNumber?: number;
}

/** A loan-sized figure in full: "1,380", "1,490.4", "0.1". */
export const fullAmount = (v: number): string => formatNumber(Math.abs(v));

/** "22 Feb 2024" from a unix-seconds integer string. */
const dateOfTs = (v?: string): string | null => (v == null ? null : formatDate(Number(v)));

/** An extension's new deadline, "22 Feb 2024"; null on any other row. */
export const pwnExtendedTo = (ctx: PwnContext): string | null =>
  ctx.eventType === "extended" ? dateOfTs(ctx.extendedDefaultTimestamp) : null;

/** T1's head row spec (the card's `head` slot). */
export function usePwnHeadSpec({ ctx, txHash, blockNumber }: PwnEventHeaderProps): ChainTruthRowSpec {
  const coords: PwnCoords = { txHash, blockNumber, loanId: ctx.loanId, version: ctx.version };
  const isSeizure = ctx.eventType === "claimed" && ctx.defaulted === true;
  const words = pwnT1Words(ctx);
  // An extension moves no value: the clause states the deadline it moved to
  // and the chip who moved it (on v1.1 only the LOAN note's holder can, and
  // nothing is paid).
  const to = pwnExtendedTo(ctx);
  const clause = words.clause ? (
    <span key="clause">{words.clause}</span>
  ) : to ? (
    <Prov key="deadline" info={extendedDeadlineProv(coords)} value={String(ctx.extendedDefaultTimestamp)}>
      <span>
        {PWN_HEAD_WORDS.deadlineTo} {to}
      </span>
    </Prov>
  ) : null;
  // The chip prefixes are literals, which check:parties maps to their roles.
  const party =
    ctx.eventType === "extended" && ctx.extendedBy
      ? {
          prefix: ctx.extendedBy === ctx.lender ? "by the lender" : "by the note holder",
          address: ctx.extendedBy,
          prov: extendedDeadlineProv(coords),
          ens: true,
        }
      : undefined;

  return {
    label: words.kind,
    critical: isSeizure,
    deltas: [],
    clauses: clause ? [clause] : undefined,
    note: words.side ? <span data-pwn-side="">{words.side}</span> : undefined,
    party,
  };
}
