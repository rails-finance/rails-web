// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary sits in this
// file: PWN keeps no content/pwn/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("pwn");

const UL = "list-disc space-y-1 pl-5";
const TH = "py-1 pr-3 text-left font-semibold text-foreground";
const TD = "py-1 pr-3 align-top";

const DOCS = "https://docs.pwn.xyz";
const FAQ = `${DOCS}/faq`;
const REPAY = `${DOCS}/Guides/borrowing-on-pwn/repaying-loans`;
const CLAIM = `${DOCS}/Guides/lending-on-pwn/claiming-defaulted-collateral`;
const EXTEND = `${DOCS}/Guides/borrowing-on-pwn/requesting-a-loan-extension`;

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Collateral",
    definition:
      "Collateral is the asset a borrower locks up to secure a loan. The lender can claim it if the loan is not repaid in time.",
    sources: [{ label: "PWN FAQ", href: `${FAQ}#how-can-i-use-pwn-as-a-lender-` }],
  },
  {
    term: "Escrow",
    definition:
      "The escrow is the contract that holds the borrower's collateral from the start of the loan until it is repaid or the lender claims it.",
    sources: [{ label: "PWN FAQ", href: `${FAQ}#how-can-i-use-pwn-as-a-lender-` }],
  },
  {
    term: "Default",
    definition:
      "A loan is in default when it is still unpaid after its deadline. The contract then refuses repayment, and the lender can claim the collateral.",
    sources: [
      { label: "Repaying loans", href: REPAY },
      { label: "Claiming defaulted collateral", href: CLAIM },
    ],
  },
  {
    term: "Extension",
    definition: "An extension is a later deadline for a loan, agreed after the loan has started.",
    sources: [{ label: "Requesting a loan extension", href: EXTEND }],
  },
  {
    term: "Repayment total",
    definition:
      "On the older contract, the repayment total is the single amount fixed at the start of the loan: the amount borrowed (the principal) plus the interest, paid in the credit token, which is the asset that was lent.",
    sources: [{ label: "Repaying loans", href: REPAY }],
  },
  {
    term: "Yearly rate",
    definition:
      "On the newer contracts, the yearly rate is the interest rate per year. Interest builds up by the minute, so repaying early costs less.",
    sources: [{ label: "Repaying loans", href: REPAY }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="pwn"
      tracks={
        <>
          The Rails PWN explorer shows every peer-to-peer loan funded through PWN&apos;s SimpleLoan contracts (the
          contracts that hold the loans) on Ethereum, whether still running or settled, and the full history of each
          one. It also gives{" "}
          <Link href="/ethereum/pwn/book" className={INLINE_LINK}>
            the loan book
          </Link>
          , a page that lists the loans in escrow and shows how the settled loans ended.
        </>
      }
      notCovered="Loan offers that no lender has funded yet aren't covered here."
      glossary={GLOSSARY}
      howItWorks={[
        <>
          PWN is a protocol where one person lends to another directly. A loan starts when a lender funds a loan
          proposal. It is made of a lender, a borrower and the borrower&apos;s{" "}
          <GlossaryLink term="Collateral">collateral</GlossaryLink>, an asset locked as security. The collateral is held
          in <GlossaryLink term="Escrow">escrow</GlossaryLink> until the loan ends, and every term is agreed between the
          two at the start.
        </>,
        <>
          The lender is protected by the collateral held in escrow. No price feed values the collateral, no score warns
          of risk, and no one sells the collateral early. A loan that is unpaid after its deadline is in{" "}
          <GlossaryLink term="Default">default</GlossaryLink>, which lets the lender claim the collateral.
        </>,
        <>
          A deadline changes only through an <GlossaryLink term="Extension">extension</GlossaryLink>. PWN has an older
          set of contracts, v1.1, and a newer set, v1.2 and v1.3, and each set has its own extension rule. The older
          contract fixes a <GlossaryLink term="Repayment total">repayment total</GlossaryLink>, and the newer ones
          charge a <GlossaryLink term="Yearly rate">yearly rate</GlossaryLink>.
          <table className="mt-2 w-full text-left text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Contract</th>
                <th className={TH}>Interest</th>
                <th className={TH}>Extension</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={TD}>v1.1</td>
                <td className={TD}>A repayment total, fixed at the start.</td>
                <td className={TD}>The lender extends alone, up to 30 days each time, at no cost.</td>
              </tr>
              <tr>
                <td className={TD}>v1.2 and v1.3</td>
                <td className={TD}>A yearly rate that builds up by the minute.</td>
                <td className={TD}>One party proposes 1 to 90 days, and the other party accepts.</td>
              </tr>
            </tbody>
          </table>
        </>,
      ]}
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>The listing shows one card for each loan, with its collateral, principal, amount owed and status.</li>
              <li>
                A loan&apos;s status is Running, Defaulted not yet claimed, Repaid, or Defaulted and claimed. Without a
                filter, the listing shows the first two, which are the loans still in escrow.
              </li>
              <li>No dollar value appears, because the protocol holds no price for the assets.</li>
            </ul>
          ),
        },
        {
          heading: "Loan page",
          body: (
            <p>
              The loan page shows the terms agreed at the start, the deadline, and a timeline of every event, including
              extensions.
            </p>
          ),
        },
        {
          heading: "Loan book",
          body: (
            <p>
              The loan book lists the loans still in escrow (those that are Running, or Defaulted and not yet claimed),
              the collateral that secures them, the amounts they owe and the terms the parties fixed. It also shows how
              the settled loans, which are those Repaid or Defaulted and claimed, ended.{" "}
              <Link href="/ethereum/pwn/book" className={INLINE_LINK}>
                See the whole loan book
              </Link>
              .
            </p>
          ),
        },
      ]}
      search="You can search by loan number, or by the account address of a lender or a borrower. The listing filters by Status, Credit (the asset lent), Collateral (the asset locked), Debt (credit asset) (a range for the amount owed) and Transactions (the number of transactions in the loan), and sorts by Created, Due, Settled or Events."
      docs={{ label: "PWN documentation", href: DOCS }}
    />
  );
}
