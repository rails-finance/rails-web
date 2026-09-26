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
import { loanDueAt } from "@/lib/pwn/economics";
import { shortAddress, shortTokenId } from "@/lib/pwn/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";

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
  const dueAt = loanDueAt(v);
  const pastDue = v.status === "open" && dueAt != null && dueAt < Date.now() / 1000;
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
            {formatNumber(v.repayAmount!)} {creditSym}
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
            {formatNumber(v.repayAmount!)} {creditSym}
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
          {formatNumber(v.credit.amount)} {creditSym}
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
            Of the amount repaid, {formatNumber(v.fixedInterest)} {creditSym} was the fixed interest — the loan&rsquo;s
            whole cost, agreed between the parties at origination and unchanged for its life.
          </>
        ) : v.status === "defaulted" ? (
          <>
            The unpaid total was{" "}
            <H>
              {formatNumber(v.repayAmount!)} {creditSym}
            </H>{" "}
            — {formatNumber(v.fixedInterest)} {creditSym} of it fixed interest over the principal; the collateral stood
            in its place when the loan lapsed.
          </>
        ) : pastDue ? (
          <>
            The unpaid repayment stands at{" "}
            <H>
              {formatNumber(v.repayAmount!)} {creditSym}
            </H>{" "}
            — {formatNumber(v.fixedInterest)} {creditSym} of it fixed interest, the loan&rsquo;s whole cost agreed at
            origination.
          </>
        ) : (
          <>
            Of the repayment, {formatNumber(v.fixedInterest)} {creditSym} is fixed interest — the loan&rsquo;s whole
            cost, agreed between the parties at origination and unchanged for its life.
          </>
        )}
      </span>,
    );
  }

  // The deadline — the Due column's twin — and the door it opens (§5: a
  // forward path on the named state, stated as a door, never advice).
  if (dueAt != null) {
    bullets.push(
      <span key="due">
        {v.status === "open" && pastDue ? (
          <>
            The deadline was <H>{dateOf(dueAt)}</H> — crossing it unpaid is itself the default on PWN, and what remains
            is the lender&rsquo;s move: the loan waits, collateral escrowed, until they claim it.
          </>
        ) : v.status === "open" ? (
          <>
            The loan runs to <H>{dateOf(dueAt)}</H>; past that moment an unpaid loan is claimable by the lender as
            defaulted.
          </>
        ) : v.status === "defaulted" ? (
          <>
            The deadline was <H>{dateOf(dueAt)}</H>; it passed with the repayment unmade, and the lender&rsquo;s claim
            on the collateral followed.
          </>
        ) : (
          <>
            The parties&rsquo; deadline was <H>{dateOf(dueAt)}</H>; the repayment closed the loan against it.
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
