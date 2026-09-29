"use client";

// The card's line naming the loans this NFT has carried: "Loan 2 of 2, open
// since 20 Jan 2025 · earlier loan 15 – 18 Jan 2025, closed". A loan that ended
// in liquidation adds what the owner kept. The LlamaLend loans line is the
// model.

import { formatDate, formatDayMonth } from "@/lib/date";
import { formatNumber } from "@/lib/utils/format";
import type { FxLoan } from "@/lib/fx/loans";

function span(l: FxLoan): string {
  if (l.closedAt == null) return `from ${formatDate(l.openedAt)}`;
  const sameYear = new Date(l.openedAt * 1000).getUTCFullYear() === new Date(l.closedAt * 1000).getUTCFullYear();
  return `${sameYear ? formatDayMonth(l.openedAt) : formatDate(l.openedAt)} – ${formatDate(l.closedAt)}`;
}

export function FxLoansLine({ loans }: { loans: FxLoan[] }) {
  if (loans.length === 0) return null;
  const last = loans[loans.length - 1];
  const kept = last.borrowed - last.repaid;
  const owner =
    last.ending === "liquidated" && kept > 0 ? (
      <p className="text-xs text-rb-500" data-fx-owner-outcome="">
        For the owner: kept the {formatNumber(kept)} fxUSD borrowed on {loans.length > 1 ? `loan ${last.number}` : "it"}{" "}
        and not repaid; the liquidation took the collateral.
      </p>
    ) : null;
  if (loans.length < 2) return owner;
  return (
    <>
      <p className="text-xs text-rb-500" data-fx-loans="">
        Loan {last.number} of {loans.length}
        {last.closedAt == null ? `, open since ${formatDate(last.openedAt)}` : `, ${span(last)}, ${last.ending}`}
        {loans.slice(0, -1).map((l) => (
          <span key={l.number}>
            {" · "}
            {loans.length > 2 ? `loan ${l.number}` : "earlier loan"} {span(l)}, {l.ending ?? "open"}
          </span>
        ))}
        . Closing or liquidating leaves the NFT with its owner, who can fund it again.
      </p>
      {owner}
    </>
  );
}
