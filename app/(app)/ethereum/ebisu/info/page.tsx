// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — a page of its own on the rail's sub-nav, drawn on
// ProtocolInfoPage (rails-ops standards/info-page-template.md). Docs host:
// ebisu.gitbook.io/ebisu-money (official by Miles's ruling of 8 Oct 2026).

import Link from "next/link";
import { ProtocolInfoPage, GlossaryLink, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { EBISU_DOCS_AND_CHAIN } from "@/lib/ebisu/docs-and-chain";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("ebisu");

const DOCS = "https://ebisu.gitbook.io/ebisu-money";
const HOW_IT_WORKS = DOCS + "/protocol-mechanics/how-it-works";
const BORROWING = DOCS + "/using-ebisu/borrowing-ebusd";
const STABILITY = DOCS + "/earning-ebusd-yield";

const UL = "mt-1.5 list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Trove",
    definition:
      "A Trove is a loan backed by collateral and linked to an Ethereum address. The borrower deposits collateral, mints ebUSD against it and repays the ebUSD to recover the collateral. One address can hold several Troves.",
    sources: [{ label: "How Ebisu works", href: HOW_IT_WORKS }],
  },
  {
    term: "ebUSD",
    definition:
      "ebUSD is the stablecoin that Ebisu lets borrowers mint against their collateral. Redemptions keep its price near one dollar.",
    sources: [{ label: "How Ebisu works", href: HOW_IT_WORKS }],
  },
  {
    term: "Branch",
    definition:
      "A branch is the part of Ebisu that handles one collateral type. Each branch has its own Troves, its own Stability Pool and its own Minimum Collateral Ratio (MCR).",
    sources: [
      { label: "Borrowing ebUSD", href: BORROWING },
      { label: "Earning ebUSD yield", href: STABILITY },
    ],
  },
  {
    term: "Collateralization ratio",
    definition:
      "The collateralization ratio (CR) is the value of a Trove's collateral divided by its debt. A CR of 150% means the Trove holds $150 of collateral for every $100 of debt.",
    sources: [{ label: "How Ebisu works", href: HOW_IT_WORKS }],
  },
  {
    term: "Minimum Collateral Ratio",
    definition:
      "Each branch sets a Minimum Collateral Ratio (MCR). A Trove whose CR falls below the MCR of its branch can be liquidated.",
    sources: [
      { label: "How Ebisu works", href: HOW_IT_WORKS },
      { label: "Borrowing ebUSD", href: BORROWING },
    ],
  },
  {
    term: "Interest rate",
    definition:
      "The borrower of each Trove sets its annual interest rate, and the interest is added to the Trove's debt. A lower rate costs less and puts the Trove earlier in the redemption order, which means it is redeemed sooner.",
    sources: [{ label: "Borrowing ebUSD", href: BORROWING }],
  },
  {
    term: "Redemption",
    definition:
      "A redemption lets any ebUSD holder swap ebUSD for one dollar of collateral per ebUSD, minus a fee. The swap repays debt in the Troves with the lowest interest rates first, so the redemption order is the Troves sorted by interest rate, lowest first.",
    sources: [{ label: "How Ebisu works", href: HOW_IT_WORKS }],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation closes a Trove whose CR has fallen below the MCR. The branch's Stability Pool pays off the Trove's debt with its ebUSD, and the pool's depositors receive the Trove's collateral. The borrower keeps the ebUSD that was minted and loses the collateral.",
    sources: [
      { label: "How Ebisu works", href: HOW_IT_WORKS },
      { label: "Earning ebUSD yield", href: STABILITY },
    ],
  },
  {
    term: "Stability Pool",
    definition:
      "A Stability Pool holds ebUSD deposited by other users for one branch. In a liquidation the pool uses its ebUSD to cancel the Trove's debt, and the depositors receive the collateral with a 5% bonus.",
    sources: [{ label: "Earning ebUSD yield", href: STABILITY }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one Trove.</li>
        <li>
          A row shows the Trove&apos;s collateral, its ebUSD debt, its collateralization ratio and the dollar value of
          its collateral.
        </li>
        <li>A row also shows the interest rate the borrower chose and the Trove&apos;s status.</li>
        <li>
          A Trove is Open, Closed or Liquidated. An Open Trove that a redemption has left below the minimum debt of
          2,000 ebUSD, the smallest debt the protocol allows a Trove to hold, is a zombie position, marked Zombie.
        </li>
      </ul>
    ),
  },
  {
    heading: "Trove page",
    body: (
      <p>
        The Trove page shows one Trove&apos;s collateral and debt, and a timeline lists each event on that Trove, newest
        first. An event is one recorded action, such as opening the Trove, adjusting it or liquidating it.
      </p>
    ),
  },
  {
    heading: "Branches page",
    body: (
      <p>
        The branches page shows the five branches side by side, with the Minimum Collateral Ratio (MCR) of each: 120%
        for weETH and WBTC, 115% for sUSDe and stcUSD and 135% for LBTC. It also shows the order in which redemptions
        reach the branches.{" "}
        <Link href="/ethereum/ebisu/branches" className={INLINE_LINK}>
          See the branches
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="ebisu"
      tracks={
        <>
          The Rails Ebisu explorer shows every Trove that has minted ebUSD on Ethereum, whether still open or closed,
          and the full history of each one. It also shows{" "}
          <Link href="/ethereum/ebisu/branches" className={INLINE_LINK}>
            the five branches
          </Link>{" "}
          that hold the Troves, with their terms and the order in which redemption reaches them.
        </>
      }
      howItWorks={[
        <>
          Ebisu Money is a lending protocol on Ethereum. A borrower deposits collateral, an asset that backs the loan,
          from their wallet (an account address) and mints (creates) <GlossaryLink term="ebUSD">ebUSD</GlossaryLink>{" "}
          against it. One loan is a <GlossaryLink term="Trove">Trove</GlossaryLink>, and it is the unit on every page
          here.
        </>,
        <>
          Ebisu keeps one <GlossaryLink term="Branch">branch</GlossaryLink> for each of five collateral tokens: weETH
          (staked ether), sUSDe and stcUSD (yield-bearing stablecoins), WBTC (wrapped bitcoin) and LBTC (another bitcoin
          token). A Trove&apos;s <GlossaryLink term="Collateralization ratio">collateralization ratio</GlossaryLink>{" "}
          (CR) is its collateral value divided by its debt. Each branch sets a{" "}
          <GlossaryLink term="Minimum Collateral Ratio">Minimum Collateral Ratio</GlossaryLink> (MCR): 120% for weETH
          and WBTC, 115% for sUSDe and stcUSD and 135% for LBTC.
        </>,
        <>
          Governance, the holders who vote on Ebisu&apos;s rules, can change an MCR. Each past liquidation is checked
          against the MCR that applied at the time, not today&apos;s. For example, weETH&apos;s MCR was 128% until 4
          January 2026, and WBTC&apos;s was 132%.
        </>,
        <>
          The borrower of each Trove sets its own <GlossaryLink term="Interest rate">interest rate</GlossaryLink>. A
          higher rate keeps the Trove further from <GlossaryLink term="Redemption">redemption</GlossaryLink>. A
          redemption swaps ebUSD for one dollar of collateral and takes it from the lowest-rate Troves first. This holds
          ebUSD near one dollar.
        </>,
        <>
          When a Trove&apos;s CR falls below the MCR, a <GlossaryLink term="Liquidation">liquidation</GlossaryLink>{" "}
          closes it. The branch&apos;s <GlossaryLink term="Stability Pool">Stability Pool</GlossaryLink> pays off the
          debt with ebUSD that other users deposited, and those depositors receive the collateral. The borrower keeps
          the ebUSD but loses the collateral. If the pool cannot cover the whole debt, the rest is redistributed across
          the branch&apos;s other Troves. Drawing ebUSD, at opening or later, also charges an upfront borrow fee, which
          is added to the Trove&apos;s debt.
        </>,
      ]}
      glossary={glossary}
      views={views}
      search="You can search by Trove id, collateral or owner. The listing filters by Status, Collateral, Debt (ebUSD), Collateral (USD) and Transactions, which keeps the Troves whose number of transactions falls in a range you choose, and sorts by Recent activity, Collateral, Debt (ebUSD) or Interest rate."
      docsAndChain={EBISU_DOCS_AND_CHAIN}
      docs={{ label: "Ebisu documentation", href: DOCS }}
    />
  );
}
