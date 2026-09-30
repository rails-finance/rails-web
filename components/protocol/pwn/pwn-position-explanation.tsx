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
import { interestRateText, loanDeadlineAt, loanDueAt, loanInterestRate } from "@/lib/pwn/economics";
import { shortAddress, shortTokenId } from "@/lib/pwn/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import { AmountText } from "@/components/shared/amount-text";

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
  const pastDue = v.status === "open" && dueAt != null && dueAt < Date.now() / 1000;
  const rate = loanInterestRate(v);
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
  const hasRepay = v.repayAmount != null && v.credit != null;
  const coll = assetText(v.collateral);

  // Subject-first status lead (charter §4): the loan's present state in one
  // sentence, ≤2 figures, colon-terminated into the bullets.
  const lead: React.ReactNode =
    v.status === "open" && pastDue ? (
      <>
        This loan&rsquo;s deadline has passed unpaid — the escrowed <H>{coll}</H> is claimable by the lender at any
        time:
      </>
    ) : v.status === "open" ? (
      hasRepay ? (
        <>
          This loan is running: <H>{coll}</H> sits in the loan contract&rsquo;s own escrow against a fixed repayment of{" "}
          <H>
            <AmountText value={v.repayAmount!} /> {creditSym}
          </H>
          :
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
            <AmountText value={v.repayAmount!} /> {creditSym}
          </H>{" "}
          and the escrow released <H>{coll}</H> back:
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
  // muted per the highlight rule. Only a v1.1 repay total proves it fixed.
  if (hasRepay && v.fixedInterest != null && v.fixedInterest > 0) {
    bullets.push(
      <span key="interest">
        {v.status === "repaid" ? (
          <>
            Of the amount repaid, <AmountText value={v.fixedInterest} /> {creditSym} was the fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null} — the loan&rsquo;s whole cost, agreed at origination.
          </>
        ) : v.status === "defaulted" ? (
          <>
            The unpaid total was{" "}
            <H>
              <AmountText value={v.repayAmount!} /> {creditSym}
            </H>{" "}
            — <AmountText value={v.fixedInterest} /> {creditSym} of it fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null}; the collateral stood in its place when the loan lapsed.
          </>
        ) : pastDue ? (
          <>
            The unpaid repayment stands at{" "}
            <H>
              <AmountText value={v.repayAmount!} /> {creditSym}
            </H>{" "}
            — <AmountText value={v.fixedInterest} /> {creditSym} of it fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null}, the loan&rsquo;s whole cost agreed at origination.
          </>
        ) : (
          <>
            Of the repayment, <AmountText value={v.fixedInterest} /> {creditSym} is fixed interest
            {rate ? <> ({interestRateText(rate)})</> : null} — the loan&rsquo;s whole cost, agreed at origination.
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
                The deadline was <H>{dateOf(dueAt)}</H>
              </>
            )}{" "}
            has passed unpaid: the borrower can no longer repay, and the loan waits, collateral escrowed, until the
            lender claims it.
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
