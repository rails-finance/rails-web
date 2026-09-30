"use client";

// Plain-language explanation of a PWN loan — a subject-first status lead
// (what stands in escrow against what repayment) followed by bullets, each an
// independent fact: the two parties and which side this page reads from, the
// fixed-interest cost, the deadline and the door it opens, the bundle's real
// contents when the collateral is PWN's own wrapper, and the LOAN note the
// claim rides on. Four moods, keyed on the loan's present state: running /
// past-due / repaid / defaulted.
//
// Under the explanation-copy charter: the pane says only what the figures
// MEAN — no data epistemics; the receipt one inspector click away owns "how
// we know". Third person throughout. Figures bold only where the card's own
// chrome states them (collateral, credit, repay, due date); the fixed
// interest is the derived gap between two bold figures and stays muted, the
// same rule the event prose follows. Claims about repayment mechanics are
// keyed on the loan's own terms shape: a repay total present is the v1.1
// fixed-economics proof; a loan without one states its cost differently and
// this pane makes no fixed-total claim for it.

import type { PwnPositionView } from "@/components/protocol/pwn/pwn-position-card";
import type { PwnAsset } from "@/lib/sources/api/pwn-positions";
import {
  aprText,
  interestRateText,
  loanCost,
  loanDeadlineAt,
  loanDueAt,
  minutesText,
  pwnLoanState,
} from "@/lib/pwn/economics";
import { shortAddress, shortTokenId } from "@/lib/pwn/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import { AmountText } from "@/components/shared/amount-text";
import { utcMinuteText } from "@/components/protocol/pwn/pwn-loan-clock";

const dateOf = (unix: number): string => formatDate(unix);

/** The collateral as prose: "PWN Bundle #29" for an NFT, "2.5 WETH" fungible. */
function assetText(a: PwnAsset | null): string {
  if (!a) return "the collateral";
  const isNft = a.category === "ERC721" || a.category === "ERC1155";
  if (isNft && a.tokenId != null) return `${a.symbol} #${shortTokenId(a.tokenId)}`;
  return `${formatNumber(a.amount)} ${a.symbol}`;
}

export function PwnPositionExplanation({
  v,
  /** The viewed wallet (lowercase) — names which side the page reads from. */
  wallet,
}: {
  v: PwnPositionView;
  wallet?: string;
}) {
  const creditSym = v.credit?.symbol ?? "the credit token";
  const struckDueAt = loanDueAt(v);
  const dueAt = loanDeadlineAt(v);
  const extended = v.extendedDueAt != null && struckDueAt != null && v.extendedDueAt !== struckDueAt;
  const extensions = v.extensionCount ?? 0;
  const pastDue = pwnLoanState(v) === "unclaimed";
  const cost = loanCost(v);
  const rate = cost?.rate ?? null;
  const accruing = cost?.shape === "accruing";
  // "moved it twice, to 6 Mar 2024" — the extension history in one phrase.
  // v1.1 lets only the LOAN note's holder extend; name the lender where the
  // sender of every extension is the wallet that struck the loan.
  const extenderText =
    v.extensionsBy && v.extensionsBy.length > 0 && v.extensionsBy.every((a) => a === v.lender)
      ? "the lender, holding the LOAN note,"
      : "the LOAN note's holder";
  const timesText =
    extensions === 1
      ? "once"
      : extensions === 2
        ? "twice"
        : `${["three", "four", "five", "six", "seven", "eight", "nine"][extensions - 3] ?? extensions} times`;
  const hasRepay = cost != null && cost.shape === "fixed" && v.credit != null;
  const coll = assetText(v.collateral);

  // Subject-first status lead (charter §4): the loan's present state in one
  // sentence, ≤2 figures, colon-terminated into the bullets.
  const lead: React.ReactNode =
    v.status === "open" && pastDue ? (
      <>
        This loan has defaulted and no one has claimed it yet: its deadline passed unpaid, and the escrowed{" "}
        <H>{coll}</H> is the lender&rsquo;s to claim at any time:
      </>
    ) : v.status === "open" ? (
      hasRepay ? (
        <>
          This loan is running: <H>{coll}</H> sits in the loan contract&rsquo;s own escrow against a fixed repayment of{" "}
          <H>
            <AmountText value={cost!.total} /> {creditSym}
          </H>
          :
        </>
      ) : accruing ? (
        <>
          This loan is running: <H>{coll}</H> sits in the loan contract&rsquo;s escrow while interest accrues at{" "}
          {aprText(v.accruingInterestApr!)} on the principal:
        </>
      ) : (
        <>
          This loan is running: <H>{coll}</H> sits in the loan contract&rsquo;s own escrow until the borrower repays:
        </>
      )
    ) : v.status === "repaid" ? (
      hasRepay ? (
        <>
          This loan settled by repayment: the borrower paid the fixed{" "}
          <H>
            <AmountText value={cost!.total} /> {creditSym}
          </H>{" "}
          and the escrow released <H>{coll}</H> back:
        </>
      ) : accruing && cost ? (
        <>
          This loan settled by repayment: the borrower paid{" "}
          <H>
            <AmountText value={cost.total} /> {creditSym}
          </H>
          , principal and accrued interest, and the escrow released <H>{coll}</H> back:
        </>
      ) : (
        <>
          This loan settled by repayment: the borrower repaid in full and the escrow released <H>{coll}</H> back:
        </>
      )
    ) : (
      <>
        This loan settled by default: its deadline passed unpaid and the lender claimed the escrowed <H>{coll}</H>:
      </>
    );

  const bullets: React.ReactNode[] = [];

  // The parties, and which of them this page reads from (§5: every party the
  // card names). The credit figure is the Credit column's twin.
  if (v.lender && v.borrower && v.credit) {
    const side = wallet === v.lender ? "lender's" : wallet === v.borrower ? "borrower's" : null;
    bullets.push(
      <span key="parties">
        The lender {shortAddress(v.lender)} advanced{" "}
        <H>
          <AmountText value={v.credit.amount} /> {creditSym}
        </H>{" "}
        to the borrower {shortAddress(v.borrower)} — a private agreement between exactly these two wallets
        {side ? <>; this page reads the loan from the {side} side</> : null}.
      </span>,
    );
  }

  // The cost of the loan — the derived gap between two bold chrome figures,
  // muted per the highlight rule. Fixed (a v1.1 repay total) or accruing (a
  // v1.2/v1.3 rate, summed as the contract sums it).
  const unchanged =
    extensions > 0 && hasRepay ? (
      <>
        {" "}
        The total stayed <AmountText value={cost!.total} /> {creditSym} through the{" "}
        {extensions === 1 ? "extension" : `${extensions} extensions`}: moving the deadline adds no interest.
      </>
    ) : null;
  if (hasRepay && cost!.interest > 0) {
    bullets.push(
      <span key="interest">
        {v.status === "repaid" ? (
          <>
            Of the amount repaid, <AmountText value={cost!.interest} /> {creditSym} was the fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null} — the loan&rsquo;s whole cost, agreed at origination.
            {unchanged}
          </>
        ) : v.status === "defaulted" ? (
          <>
            The unpaid total was{" "}
            <H>
              <AmountText value={cost!.total} /> {creditSym}
            </H>{" "}
            — <AmountText value={cost!.interest} /> {creditSym} of it fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null}; the collateral stood in its place when the loan lapsed.
          </>
        ) : pastDue ? (
          <>
            The unpaid repayment stands at{" "}
            <H>
              <AmountText value={cost!.total} /> {creditSym}
            </H>{" "}
            — <AmountText value={cost!.interest} /> {creditSym} of it fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null}, the loan&rsquo;s whole cost agreed at origination.
          </>
        ) : (
          <>
            Of the repayment, <AmountText value={cost!.interest} /> {creditSym} is fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null} — the loan&rsquo;s whole cost, agreed at origination.
            {unchanged}
          </>
        )}
      </span>,
    );
  } else if (accruing && cost?.accrual) {
    const a = cost.accrual;
    bullets.push(
      <span key="interest">
        {cost.basis === "paid" ? (
          <>
            The terms charged {aprText(a.apr)} on the principal, by the minute: over {minutesText(a.minutes)} that came
            to <AmountText value={cost.interest} /> {creditSym} of interest on <AmountText value={a.principal} />{" "}
            {creditSym}.
          </>
        ) : v.status === "open" && !pastDue ? (
          <>
            The terms charge {aprText(a.apr)} on the principal, by the minute from origination: repaid at the deadline
            the loan would cost <AmountText value={cost.interest} /> {creditSym} of interest,{" "}
            <H>
              <AmountText value={cost.total} /> {creditSym}
            </H>{" "}
            in all, and less for every minute earlier.
          </>
        ) : (
          <>
            The terms charged {aprText(a.apr)} on the principal, by the minute: at the deadline the loan owed{" "}
            <H>
              <AmountText value={cost.total} /> {creditSym}
            </H>
            , <AmountText value={cost.interest} /> {creditSym} of it interest over {minutesText(a.minutes)}. Nothing was
            paid; the collateral {v.status === "defaulted" ? "went to the lender in its place" : "stands in its place"}.
          </>
        )}
      </span>,
    );
  }

  // The deadline — the Due column's twin — and the door it opens (§5: a
  // forward path on the named state, stated as a door, never advice). Where
  // the lender moved it, the struck date and the moves come first.
  const moved: React.ReactNode =
    extended && struckDueAt != null && dueAt != null ? (
      <>
        The parties struck a deadline of {dateOf(struckDueAt)}; {extenderText} moved it {timesText}, to{" "}
        <H>{dateOf(dueAt)}</H>.{" "}
      </>
    ) : null;
  if (dueAt != null) {
    const repaidAt = v.repaidAt ?? null;
    bullets.push(
      <span key="due">
        {moved}
        {v.status === "open" && pastDue ? (
          <>
            {extended ? (
              "That deadline"
            ) : (
              <>
                The deadline, <H>{dateOf(dueAt)}</H>,
              </>
            )}{" "}
            passed unpaid: the loan defaulted then, the contract refuses any repayment since, and the collateral stays
            in escrow until the lender claims it.
          </>
        ) : v.status === "open" ? (
          <>
            The loan runs to {extended ? "that date" : <H>{dateOf(dueAt)}</H>}; past that moment an unpaid loan is
            claimable by the lender as defaulted.
          </>
        ) : v.status === "defaulted" ? (
          <>
            {extended ? (
              "That deadline"
            ) : (
              <>
                The deadline was <H>{dateOf(dueAt)}</H>; it
              </>
            )}{" "}
            passed with the repayment unmade, and the lender&rsquo;s claim on the collateral followed.
          </>
        ) : repaidAt != null && repaidAt <= dueAt && dateOf(repaidAt) === dateOf(dueAt) ? (
          // Repaid on the deadline's day: the times tell the two apart.
          <>
            The borrower repaid at {utcMinuteText(repaidAt)},{" "}
            {dueAt - repaidAt < 3600
              ? `${Math.floor((dueAt - repaidAt) / 60)} min`
              : minutesText(Math.floor((dueAt - repaidAt) / 60))}{" "}
            before {extended ? "the extended deadline" : "its deadline"} of <H>{utcMinuteText(dueAt)}</H>.
          </>
        ) : repaidAt != null && repaidAt <= dueAt ? (
          <>
            The borrower repaid on {dateOf(repaidAt)}, before{" "}
            {extended ? (
              "the extended deadline"
            ) : (
              <>
                its deadline of <H>{dateOf(dueAt)}</H>
              </>
            )}
            .
          </>
        ) : repaidAt != null ? (
          <>
            The borrower repaid on {dateOf(repaidAt)}, after the deadline of <H>{dateOf(dueAt)}</H>, and the chain shows
            no extension of it; the contract refuses a repayment past the deadline, so one is missing from this record.
          </>
        ) : (
          <>
            {extended ? (
              "The loan ran to that deadline"
            ) : (
              <>
                The deadline was <H>{dateOf(dueAt)}</H>
              </>
            )}
            ; the loan was repaid.
          </>
        )}
      </span>,
    );
  }

  // The bundle's real security — the collateral footnote's twin, present when
  // the chain overlay resolved the wrapper's contents.
  if (v.bundleContents && v.bundleContents.length > 0 && v.collateral?.tokenId != null) {
    bullets.push(
      <span key="bundle">
        The escrowed token is PWN&rsquo;s own Bundle #{shortTokenId(v.collateral.tokenId)}, a wrapper whose real
        contents —{" "}
        <H>
          {v.bundleContents
            .map((a) =>
              a.category === "ERC20"
                ? `${formatNumber(a.amount)} ${a.symbol}`
                : `${a.amount > 1 ? `${a.amount}× ` : ""}${a.symbol}${a.tokenId != null ? ` #${shortTokenId(a.tokenId)}` : ""}`,
            )
            .join(", ")}
        </H>{" "}
        — are the loan&rsquo;s actual security.
      </span>,
    );
  }

  // The claim itself — a transferable ERC-721, so the "lender" who settles
  // may differ from the lender who struck the loan.
  if (v.status === "open") {
    bullets.push(
      <span key="note">
        The claim on this loan — its repayment, or the collateral on default — is LOAN note #{v.loanId}, an ERC-721 the
        lender can transfer while the loan runs; the loan settles to whoever holds it.
      </span>,
    );
  }

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
