// About this explorer — Asymmetry on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Asymmetry's official
// documentation (docs.asymmetry.finance).

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("asymmetry");

const DOCS = "https://docs.asymmetry.finance/usdaf-stablecoin";
const RATES = `${DOCS}/what-are-customizable-fixed-interest-rates`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Trove",
    definition:
      "A Trove is one loan. It holds a borrower's collateral and records the USDaf the borrower owes. Each Trove is linked to an Ethereum address, and an address can have several Troves.",
    sources: [{ label: "What is a Trove", href: `${DOCS}/borrowing#what-is-a-trove` }],
  },
  {
    term: "Interest rate",
    definition:
      "The interest rate is set by the borrower and stays fixed until the borrower changes it. A lower rate costs less but means the Trove is redeemed first.",
    sources: [{ label: "Choosing a rate", href: `${RATES}#how-do-i-decide-on-the-right-rate-for-me` }],
  },
  {
    term: "Redemption",
    definition:
      "A redemption lets any USDaf holder swap USDaf for collateral at face value, which is one dollar per USDaf. The holder's USDaf repays the debt of a Trove, and the matching collateral leaves that Trove. Redemptions start with the Troves that pay the lowest interest rates.",
    sources: [
      { label: "What are redemptions", href: `${DOCS}/redemptions#what-are-redemptions` },
      { label: "If my Trove is redeemed", href: `${DOCS}/redemptions#what-happens-if-my-trove-gets-redeemed` },
    ],
  },
  {
    term: "Zombie",
    definition:
      "A Trove is a zombie when a redemption has cut its debt below the 2,000 USDaf minimum. Such a Trove switches to a dormant mode, in which the redemption queue no longer treats it like the other Troves. Raising its debt above the minimum again ends that mode.",
    sources: [
      { label: "If my Trove is redeemed", href: `${DOCS}/redemptions#what-happens-if-my-trove-gets-redeemed` },
      { label: "Minimum borrow amount", href: `${DOCS}/borrowing#is-there-a-minimum-borrow-amount` },
    ],
  },
  {
    term: "Batch manager",
    definition:
      "A batch manager is a third party to whom a borrower delegates the interest rate. The manager sets the rate for every Trove in its batch and may charge a fee for this service.",
    sources: [{ label: "Choosing a rate", href: `${RATES}#how-do-i-decide-on-the-right-rate-for-me` }],
  },
  {
    term: "Collateral ratio",
    definition:
      "The collateral ratio is the value of a Trove's collateral divided by its USDaf debt. Each branch sets a minimum, and a Trove below it can be liquidated.",
    sources: [{ label: "How liquidations work", href: `${DOCS}/liquidations#how-do-liquidations-work` }],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation closes a Trove whose collateral ratio has fallen below its branch's minimum. The Stability Pool, a pool of USDaf deposits, absorbs the debt, and the borrower can claim the collateral left after a penalty of usually 5%. Whoever starts it receives a gas compensation.",
    sources: [
      { label: "How liquidations work", href: `${DOCS}/liquidations#how-do-liquidations-work` },
      { label: "Compensation", href: `${DOCS}/liquidations#how-am-i-compensated-for-liquidating-a-trove` },
    ],
  },
  {
    term: "Liquidation reserve",
    definition:
      "Opening a Trove sets aside 0.0375 WETH (wrapped ETH), apart from the collateral. It pays the gas, the fee for a transaction on Ethereum, of whoever liquidates the Trove. It returns to the owner when the Trove closes.",
    sources: [{ label: "Refundable gas deposit", href: `${DOCS}/liquidations#what-is-the-refundable-gas-deposit` }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one Trove.</li>
        <li>
          A row shows the Trove&apos;s collateral, its USDaf debt, its collateral ratio, its dollar value, its interest
          rate and its status.
        </li>
        <li>
          The owner sets the interest rate, or the batch manager sets it when the owner has delegated it. A status is
          Open, Zombie, Closed or Liquidated.
        </li>
      </ul>
    ),
  },
  {
    heading: "Branches page",
    body: (
      <p>
        The branches page shows the seven branches side by side. It also shows the order in which redemptions reach the
        Troves of each branch.{" "}
        <Link href="/ethereum/asymmetry/branches" className={INLINE_LINK}>
          See the branches and their redemption queues
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="asymmetry"
      tracks={
        <>
          The Rails Asymmetry explorer shows every Trove that has borrowed USDaf on Ethereum, whether still open or
          closed, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/asymmetry/branches" className={INLINE_LINK}>
            the branches
          </Link>
          , one for each collateral type, with the order in which redemptions reach their Troves.
        </>
      }
      notCovered="The other collateral types of Asymmetry's first deployment aren't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Asymmetry Finance issues USDaf, a stablecoin that tracks one dollar and is created when a borrower borrows it.
          A borrower opens a <GlossaryLink term="Trove">Trove</GlossaryLink>, a loan, from a wallet, which is an account
          address. The borrower locks collateral, an asset that backs the loan, and borrows USDaf against it.
        </>,
        <>
          Each collateral type is a branch with its own Troves and its own redemption queue, because a redemption starts
          with the lowest interest rates in each collateral market. The borrower sets the{" "}
          <GlossaryLink term="Interest rate">interest rate</GlossaryLink>. A higher rate protects the owner, because a{" "}
          <GlossaryLink term="Redemption">redemption</GlossaryLink> repays the debt of the lowest-rate Troves first and
          takes their collateral at one dollar per USDaf, possibly below the price the owner wants.
        </>,
        <>
          A borrower can hand the rate to a <GlossaryLink term="Batch manager">batch manager</GlossaryLink>, who moves
          it for many Troves at once.
        </>,
        <>
          A redemption that cuts a Trove&apos;s debt below the 2,000 USDaf minimum makes it a{" "}
          <GlossaryLink term="Zombie">zombie</GlossaryLink>. A Trove whose{" "}
          <GlossaryLink term="Collateral ratio">collateral ratio</GlossaryLink> falls below its branch&apos;s minimum
          can be <GlossaryLink term="Liquidation">liquidated</GlossaryLink>.
        </>,
        <>
          Opening a Trove also sets aside a <GlossaryLink term="Liquidation reserve">liquidation reserve</GlossaryLink>{" "}
          of 0.0375 WETH, so that whoever liquidates the Trove is paid for the gas.
        </>,
      ]}
      views={views}
      search="You can search by Trove id, collateral or owner address. The listing filters by Status, Collateral, Debt (USDaf), Collateral (USD) and Transactions, and sorts by Recent activity, Collateral, Debt (USDaf) or Interest rate."
      docs={{ label: "Asymmetry documentation", href: "https://docs.asymmetry.finance" }}
    />
  );
}
