// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary sits in this
// file: PWN keeps no content/pwn/event-prose.yaml.

import Link from "next/link";
import { ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
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
    term: "Escrow",
    definition:
      "The contract that holds the borrower's collateral from origination until repayment or the lender's claim.",
    sources: [{ label: "PWN FAQ", href: `${FAQ}#how-can-i-use-pwn-as-a-lender-` }],
  },
  {
    term: "Default",
    definition:
      "A loan unpaid past its deadline. The contract then refuses repayment, and the lender can claim the collateral.",
    sources: [
      { label: "Repaying loans", href: REPAY },
      { label: "Claiming defaulted collateral", href: CLAIM },
    ],
  },
  {
    term: "Extension",
    definition: "A later deadline for a loan, agreed after origination.",
    sources: [{ label: "Requesting a loan extension", href: EXTEND }],
  },
  {
    term: "Repayment total",
    definition:
      "On the older contract, the one amount fixed at origination: principal plus interest, in the credit token.",
    sources: [{ label: "Repaying loans", href: REPAY }],
  },
  {
    term: "Yearly rate",
    definition:
      "On the newer contracts, the interest rate per year. Interest accrues by the minute, so repaying early costs less.",
    sources: [{ label: "Repaying loans", href: REPAY }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="pwn"
      name="PWN"
      tracks="Every peer-to-peer loan struck on PWN's SimpleLoan contracts on Ethereum, open or settled, with its history. Off-chain loan proposals are not shown until a lender funds one."
      glossary={GLOSSARY}
      howItWorks={[
        "A loan is one lender, one borrower and escrowed collateral, with every term struck between them at origination.",
        "There is no oracle, health factor or liquidation. The parties set the price, and a loan unpaid past its deadline defaults to the lender's claim on the collateral.",
        <>
          Only an extension moves a deadline, by one of two rules depending on the contract generation:
          <table className="mt-2 w-full text-left text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Contract</th>
                <th className={TH}>Cost of the loan</th>
                <th className={TH}>Extension</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={TD}>v1.1</td>
                <td className={TD}>A repayment total</td>
                <td className={TD}>The lender extends alone, up to 30 days each time, free.</td>
              </tr>
              <tr>
                <td className={TD}>v1.2 and v1.3</td>
                <td className={TD}>A yearly rate, accruing by the minute</td>
                <td className={TD}>One party proposes 1 to 90 days and the other accepts.</td>
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
              <li>One card per loan: its collateral, principal, amount owed and status.</li>
              <li>
                Status is running, defaulted and not yet claimed, repaid, or defaulted and claimed. The bare listing
                shows the first two, the loans still in escrow.
              </li>
              <li>No dollar value appears because none exists in the protocol.</li>
            </ul>
          ),
        },
        {
          heading: "Loan page",
          body: (
            <p>The loan&rsquo;s terms as struck, its deadline, and a timeline of each event, extensions included.</p>
          ),
        },
        {
          heading: "Loan book",
          body: (
            <p>
              The loans in escrow, what secures them, what they owe, the terms the parties fixed, and how the settled
              loans ended.{" "}
              <Link href="/ethereum/pwn/book" className={INLINE_LINK}>
                See the whole loan book
              </Link>
              .
            </p>
          ),
        },
      ]}
      search="Search takes a loan number, a lender address or a borrower address. Filters: status, credit asset, collateral asset, debt, transactions. Sort: created, due, settled, events."
      docs={{ label: "PWN documentation", href: DOCS }}
    />
  );
}
