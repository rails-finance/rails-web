// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Maple on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Maple's official
// documentation (docs.maple.finance).

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("maple");

const DOCS = "https://docs.maple.finance";
const TECH = `${DOCS}/technical-resources`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Pool",
    definition:
      "A pool is the contract that holds lenders' deposits of one asset (USDC or USDT). One pool delegate runs it, and a lender receives shares for each deposit. A wallet needs the pool's permission before it can deposit.",
    sources: [
      { label: "Pool", href: `${TECH}/pools/pools` },
      { label: "Glossary", href: `${TECH}/protocol-overview/glossary#general-concepts` },
    ],
  },
  {
    term: "Pool delegate",
    definition:
      "The pool delegate is the approved entity that runs one pool. It sets the pool's limits, lends the pool's money to borrowers and records an impairment when repayment looks doubtful.",
    sources: [{ label: "Protocol actors", href: `${TECH}/protocol-overview/protocol-actors#pool-delegate` }],
  },
  {
    term: "Share",
    definition:
      "A share is the token a lender receives for a deposit. The USDC pool's share token is syrupUSDC and the USDT pool's is syrupUSDT. Each share is a claim on a part of the pool, and its value grows as borrowers pay interest.",
    sources: [{ label: "Pool", href: `${TECH}/pools/pools` }],
  },
  {
    term: "Exit rate",
    definition:
      "The exit rate is what one share pays out on withdrawal today, so it is the value of a share. It rises as borrowers' interest accrues and falls when the pool records a loss.",
    sources: [{ label: "Exchange rates", href: `${TECH}/pools/exchange-rates#converttoexitassets` }],
  },
  {
    term: "Withdrawal queue",
    definition:
      "The withdrawal queue is the line of exit requests for a pool. Requests are paid first in, first out, as the pool has cash available. The shares stay in the queue's custody (escrow) until the request is paid.",
    sources: [{ label: "Withdrawal queue", href: `${TECH}/pools/withdrawal-manager#withdrawal-queue-fifo` }],
  },
  {
    term: "Open-term loan",
    definition:
      "An open-term loan has no maturity date, the day a loan must be fully repaid. Instead the lender can call part or all of the principal, the amount lent, and the borrower must repay it once the notice period ends.",
    sources: [{ label: "Open Term Loan", href: `${TECH}/strategies/open-term-loans/open-term-loan` }],
  },
  {
    term: "Impairment",
    definition:
      "An impairment is a write-down of a loan before a loss is final: its recorded value is lowered because repayment looks doubtful. The pool records an unrealized loss, which lowers the exit rate until the loan is repaid or defaults. A default is a borrower failing to repay.",
    sources: [
      {
        label: "What is an impairment",
        href: `${DOCS}/maple-institutional-for-lenders/defaults-and-impairments#what-is-an-impairment`,
      },
      { label: "Impairment in the glossary", href: `${TECH}/protocol-overview/glossary#general-concepts` },
    ],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one wallet&apos;s stake in one pool.</li>
        <li>A row shows what the wallet&apos;s shares would pay out on exit today.</li>
        <li>A row shows where the wallet stands in the withdrawal queue, if it has requested an exit.</li>
        <li>A band at the top shows, for each pool, the cash available to pay exits and the amount lent out.</li>
      </ul>
    ),
  },
  {
    heading: "Wallet page",
    body: (
      <ul className={UL}>
        <li>The top card shows the wallet&apos;s shares, what they pay out now and the interest they have earned.</li>
        <li>The card shows any shares waiting in the withdrawal queue.</li>
        <li>The timeline lists each deposit, withdrawal request and payout of the wallet, newest first.</li>
      </ul>
    ),
  },
  {
    heading: "Pools page",
    body: (
      <p>
        The pools page shows each pool&apos;s cash available to pay exits, its fixed-term and open-term loans, and its
        exit rate.{" "}
        <Link href="/ethereum/maple/pools" className={INLINE_LINK}>
          Open the pools page
        </Link>{" "}
        to see them.
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="maple"
      tracks={
        <>
          The Rails Maple explorer shows every wallet that has lent into Maple&apos;s syrupUSDC and syrupUSDT pools on
          Ethereum, whether still lending or exited, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/maple/pools" className={INLINE_LINK}>
            the pools
          </Link>{" "}
          as a whole: how much cash each has available to pay exits and how much it has lent out.
        </>
      }
      notCovered="syrupUSDC and syrupUSDT on other chains aren't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Maple lends depositors&apos; money to institutions. A lender deposits USDC or USDT into a{" "}
          <GlossaryLink term="Pool">pool</GlossaryLink> and receives <GlossaryLink term="Share">shares</GlossaryLink>,
          called syrupUSDC in the USDC pool and syrupUSDT in the USDT pool. One position on this page is one wallet (an
          account address) holding shares in one pool.
        </>,
        <>
          The <GlossaryLink term="Pool delegate">pool delegate</GlossaryLink> lends the pool&apos;s money to approved
          firms, who back each loan with collateral (assets pledged as security). Custodians, firms that keep assets
          safe for others, hold that collateral off-chain. The borrowers&apos; interest raises the value of a share.
        </>,
        <>
          Most of a pool is out on loan, so exits are queued. A lender asks to exit, and the request joins the{" "}
          <GlossaryLink term="Withdrawal queue">withdrawal queue</GlossaryLink>. It is paid at the{" "}
          <GlossaryLink term="Exit rate">exit rate</GlossaryLink>, the value of a share, once the pool has cash
          available.
        </>,
        <>
          A loan is either fixed-term, which runs to a maturity date, or an{" "}
          <GlossaryLink term="Open-term loan">open-term loan</GlossaryLink>, which has none. When repayment looks
          doubtful, the pool delegate can record an <GlossaryLink term="Impairment">impairment</GlossaryLink> on the
          loan, and the exit rate falls.
        </>,
        "The page shows what Maple's contracts recorded: the amount lent, the interest rate and any impairment. It cannot confirm that the collateral behind the loans exists, because the custodians hold it off-chain.",
      ]}
      views={views}
      search="You can search by wallet address. The listing filters by Status (Open or Closed), Queue (In withdrawal queue), Pool (syrupUSDC or syrupUSDT), Deposited (an amount in the pool's token) and Transactions (a count). It sorts by Recent activity or Deposited."
      docs={{ label: "Maple documentation", href: `${DOCS}/maple-institutional-for-lenders/introduction` }}
    />
  );
}
