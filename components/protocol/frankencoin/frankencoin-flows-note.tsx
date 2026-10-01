// The Lifetime flows panel's Explanation lines and "?" for a Frankencoin
// position (lib/frankencoin/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Frankencoin").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { FrankencoinFlowFacts } from "@/lib/frankencoin/flows";
import { fmtFcColl, fmtZchf } from "@/lib/frankencoin/figures";

const DOCS = "https://docs.frankencoin.com";

export interface FrankencoinFlowsNoteProps {
  facts: FrankencoinFlowFacts | null;
  collSymbol: string;
  /** The position is a clone: its first deposit and mint came with the clone. */
  clone: boolean;
}

const count = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

export function FrankencoinFlowsNote({ facts, collSymbol, clone }: FrankencoinFlowsNoteProps): ReactNode {
  const f = facts;
  return (
    <div className="space-y-2" data-frankencoin-flows-note="" data-anatomy="F14·frankencoin">
      <p>
        Frankencoin has no price oracle, so nothing states what the {collSymbol} is worth in ZCHF: the collateral bar is
        in {collSymbol} and the debt bar in ZCHF, each on its own scale, and the two lengths do not compare. The line
        draws each side on its own scale too, its top labelled in its token.
      </p>
      <p>
        Every ledger row (the position&apos;s MintingUpdate) states its collateral and its debt after it, so each line
        is exact to the base unit: a row&apos;s figure less what the row before left is what it deposited, withdrew,
        minted or repaid.
        {clone
          ? " This position is a clone: its first deposit and mint came in the transaction that cloned it, and are counted as Deposited and minted like any other."
          : ""}
        {f && f.understated > 0
          ? " The clone's first row states less collateral than it held (a V1 quirk), so its collateral is counted from the next row, which books the clone's deposit."
          : ""}
      </p>
      <p>
        The debt is gross. Each mint adds its whole amount, and its transaction&apos;s receipt splits it into what the
        wallet was paid out, the reserve share (kept in the reserve against this position and returned on repayment) and
        the interest for the remaining term, paid up front and not returned (Interest paid up front, dashed). Nothing
        accrues afterwards, so the debt moves only on a row and stays flat between rows. A repayment&apos;s receipt
        splits it into what the payer paid (Repaid) and the reserve share the reserve gave back.
        {f && f.splitMints > 0
          ? ` Here ${count(f.splitMints, "one mint", "mints")} paid ${fmtZchf(f.interest)} ZCHF of interest and set aside ${fmtZchf(f.reserve)} ZCHF of reserve share${f.reserveBack > 0 ? `, and repayments got ${fmtZchf(f.reserveBack)} ZCHF of it back` : ""}.`
          : ""}
        {f && f.unsplitMints + f.unsplitRepays > 0
          ? ` ${count(f.unsplitMints + f.unsplitRepays, "One receipt was", "receipts were")} not read, so ${f.unsplitMints + f.unsplitRepays === 1 ? "its row stays" : "their rows stay"} whole (Minted, or Repaid, split not read); reload to read ${f.unsplitMints + f.unsplitRepays === 1 ? "it" : "them"} again.`
          : ""}
      </p>
      {f && f.challengeSales + f.forcedSales > 0 && (
        <p>
          Frankencoin has no liquidation.{" "}
          {f.challengeSales > 0 &&
            `${count(f.challengeSales, "A challenge sale", "challenge sales")} (the second phase of a challenge nobody averted) sold collateral (Sold by challenge) and cleared debt with the bids (Cleared by challenge sale). `}
          {f.forcedSales > 0 &&
            `${count(f.forcedSales, "A forced sale", "forced sales")} after expiry sold collateral (Sold at expiry) and cleared debt (Cleared by forced sale). `}
          The opened sale rows name the buyer and where the ZCHF went.
        </p>
      )}
      {f && (f.collGaps + f.debtGaps > 0 || f.liveGap) && (
        <p>
          {f.collGaps + f.debtGaps > 0 &&
            `${count(f.collGaps + f.debtGaps, "One row starts", "rows start")} from a figure the row before did not leave; the difference is booked on that row. `}
          {f.liveGap &&
            `Today's read of the contract differs from the last ledger row${f.liveGap.coll !== 0 ? ` by ${f.liveGap.coll > 0 ? "+" : "−"}${fmtFcColl(Math.abs(f.liveGap.coll))} ${collSymbol}` : ""}${f.liveGap.debt !== 0 ? `${f.liveGap.coll !== 0 ? " and" : " by"} ${f.liveGap.debt > 0 ? "+" : "−"}${fmtZchf(Math.abs(f.liveGap.debt))} ZCHF` : ""}: no row records it, so at today it is the last line of its side, Moved without a ledger row.`}
        </p>
      )}
      <p>
        Frankencoin is not in the shared daily price store and needs no price here: between rows each side stays in its
        token as its last row left it.
      </p>
    </div>
  );
}

export function frankencoinFlowsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime flows",
    intro:
      "The bars add up every ledger row the index has recorded for this position, the collateral in its token and the debt in ZCHF, and the line under them draws what it held and owed at the end of each day.",
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, less withdrawn, less sold by challenge or at expiry, is the collateral the position holds.",
      "Debt: paid out, plus the reserve share, plus the interest paid up front, less repaid, less the reserve share returned, less cleared by sales, is what the position owes.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Gross debt",
        text: "a mint adds its whole amount to the debt. The wallet receives it less the position's reserve share and the interest for the remaining term.",
        sources: [{ label: "what a mint pays out", url: `${DOCS}/positions/adjust` }],
      },
      {
        bold: "Interest up front",
        text: "interest for the remaining term is paid at each mint, at the rate in force then, and is not returned; nothing accrues afterwards.",
        sources: [{ label: "interest on positions", url: `${DOCS}/positions` }],
      },
      {
        bold: "Reserve share",
        text: "the reserve share of each mint stays in the system reserve and is released on repayment: in full while the reserve covers every position's share, in proportion when losses have drawn it down.",
        sources: [{ label: "the reserve", url: `${DOCS}/reserve` }],
      },
      {
        bold: "Sales",
        text: "a challenge nobody averts sells the position's collateral in its second phase, and an expired position's collateral can be force-sold; the proceeds clear its debt. Frankencoin has no liquidation.",
        sources: [{ label: "challenges and sales", url: `${DOCS}/positions/auctions` }],
      },
    ],
    links: [{ label: "Frankencoin docs", url: DOCS }],
  };
}
