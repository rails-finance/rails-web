// About this explorer — a page of its own on the rail's sub-nav, drawn on
// ProtocolInfoPage (rails-ops standards/info-page-template.md). Basedollar has no
// reachable documentation site (docs.basedollar.money does not answer), so the glossary
// sources are the Liquity V2 FAQ, the design Basedollar copies and adapts.

import Link from "next/link";
import { ProtocolInfoPage, GlossaryLink, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("basedollar");

const FAQ = "https://docs.liquity.org/v2-faq";
const BORROWING = FAQ + "/borrowing-and-liquidations";
const REDEMPTIONS = FAQ + "/redemptions-and-delegation";

const UL = "mt-1.5 list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Trove",
    definition:
      "A Trove is a loan backed by collateral and linked to one wallet. The borrower deposits collateral, mints BD against it and repays the BD to recover the collateral. One wallet can hold several Troves.",
    sources: [{ label: "What is a Trove (Liquity V2 FAQ)", href: BORROWING + "#what-is-a-trove" }],
  },
  {
    term: "BD",
    definition:
      "BD is the stablecoin that Basedollar lets borrowers mint against their collateral. It aims to stay at one dollar, and redemptions pull its price back toward one dollar.",
    sources: [{ label: "What are redemptions (Liquity V2 FAQ)", href: REDEMPTIONS + "#what-are-redemptions" }],
  },
  {
    term: "Branch",
    definition:
      "A branch is the part of Basedollar that handles one collateral token. Each branch has its own Troves and its own price feed, the contract that reports the token's price.",
    sources: [
      {
        label: "What types of collateral can I use (Liquity V2 FAQ)",
        href: BORROWING + "#what-types-of-collateral-can-i-use",
      },
    ],
  },
  {
    term: "Collateral ratio",
    definition:
      "The collateral ratio is the value of a Trove's collateral divided by its debt. A ratio of 150% means the Trove holds $150 of collateral for every $100 of debt.",
    sources: [{ label: "Collateral ratio and LTV (Liquity V2 FAQ)", href: BORROWING + "#how-do-i-decide-on-my-ltv" }],
  },
  {
    term: "Interest rate",
    definition:
      "The borrower of each Trove chooses its annual interest rate, and the interest is added to the Trove's debt. A higher rate keeps the Trove further from redemption.",
    sources: [{ label: "User-set rates (Liquity V2 FAQ)", href: BORROWING + "#what-are-user-set-rates" }],
  },
  {
    term: "Redemption",
    definition:
      "A redemption lets any BD holder swap BD for one dollar of collateral per BD. The swap repays debt in the Troves with the lowest interest rates first and takes the matching collateral out of them, so those Troves' borrowers lose that collateral but owe less BD.",
    sources: [
      { label: "What are redemptions (Liquity V2 FAQ)", href: REDEMPTIONS + "#what-are-redemptions" },
      {
        label: "If my Trove is redeemed (Liquity V2 FAQ)",
        href: REDEMPTIONS + "#what-happens-if-my-trove-gets-redeemed",
      },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation closes a Trove whose collateral ratio has fallen below the minimum of its branch. The borrower keeps the BD that was minted and loses the collateral. The Trove's status then reads Liquidated, where a Trove its owner repaid and closed reads Closed.",
    sources: [
      {
        label: "How liquidations work (Liquity V2 FAQ)",
        href: BORROWING + "#how-do-liquidations-work-in-liquity-v2",
      },
    ],
  },
  {
    term: "Stability Pool",
    definition:
      "A Stability Pool holds BD that other users deposited for one branch. In a liquidation the pool uses that BD to cancel the Trove's debt, and its depositors receive the collateral.",
    sources: [
      {
        label: "If the Stability Pool is empty (Liquity V2 FAQ)",
        href: BORROWING + "#what-mechanisms-are-in-place-if-the-stability-pool-is-empty",
      },
    ],
  },
  {
    term: "Dormant Trove",
    definition:
      "A dormant Trove is an open Trove whose debt a redemption has repaid below the minimum debt, the smallest debt Basedollar's contracts allow a Trove to hold. It leaves the redemption queue, save the branch's most recent dormant Trove with debt left, which redemptions take from before the interest-rate order applies. Its owner can bring the debt back above the minimum or close it. The contracts tag it Zombie.",
    sources: [
      { label: "Minimum debt (Liquity V2 FAQ)", href: BORROWING + "#is-there-a-minimum-debt" },
      {
        label: "If my Trove is redeemed (Liquity V2 FAQ)",
        href: REDEMPTIONS + "#what-happens-if-my-trove-gets-redeemed",
      },
    ],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one Trove, with its collateral, its BD debt and the interest rate its borrower chose.</li>
        <li>A row also shows the Trove&apos;s status: Open, Dormant, Closed or Liquidated.</li>
        <li>
          You can search by Trove id, collateral or owner. Status keeps the Troves with the statuses you pick, and
          Collateral keeps the Troves held in the branch tokens you pick.
        </li>
        <li>
          Debt (BD) keeps the Troves whose debt falls in a range you choose, where one BD aims to be worth one dollar,
          and Collateral (USD) does the same for the dollar value of the collateral. Transactions keeps the Troves whose
          number of transactions falls in a range.
        </li>
        <li>Sorts are Recent activity, Collateral, Debt (BD) and Interest rate.</li>
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
        The branches page shows one card for each of the five branches, with its price, its size and the range of
        interest rates its borrowers chose. It also explains what a redemption does and links to each branch&apos;s
        Troves in the order redemptions reach them.{" "}
        <Link href="/base/basedollar/branches" className={INLINE_LINK}>
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
      session="basedollar"
      tracks={
        <>
          The Rails Basedollar explorer shows every Trove that has minted BD on Base, whether still open or closed, and
          the full history of each one. It also shows{" "}
          <Link href="/base/basedollar/branches" className={INLINE_LINK}>
            the five branches
          </Link>{" "}
          that hold the Troves, with each branch&apos;s price and size and the queue in which redemptions reach its
          Troves.
        </>
      }
      howItWorks={[
        <>
          Basedollar is a lending protocol on Base, a network built on Ethereum. A borrower deposits collateral, an
          asset that backs the loan, from their wallet (an account address) and mints (creates){" "}
          <GlossaryLink term="BD">BD</GlossaryLink>, a stablecoin that aims to stay at one dollar, against it. One loan
          is a <GlossaryLink term="Trove">Trove</GlossaryLink>, and it is the unit on every page here.
        </>,
        <>
          Basedollar keeps one <GlossaryLink term="Branch">branch</GlossaryLink> for each of five collateral tokens:
          WETH, wstETH, rETH and cbETH, which represent ether, and wcbBTC, which represents bitcoin. Basedollar&apos;s
          contracts require every branch to keep a Trove&apos;s{" "}
          <GlossaryLink term="Collateral ratio">collateral ratio</GlossaryLink>, its collateral value divided by its
          debt, at 110% or more.
        </>,
        <>
          The borrower of each Trove chooses its <GlossaryLink term="Interest rate">interest rate</GlossaryLink>. A
          higher rate keeps the Trove further from <GlossaryLink term="Redemption">redemption</GlossaryLink>. If BD
          trades under one dollar, anyone can buy it and redeem it for one dollar of collateral, which pushes the price
          back up. A redemption takes from the lowest-rate Troves first.
        </>,
        <>
          When a Trove&apos;s collateral ratio falls below the minimum, a{" "}
          <GlossaryLink term="Liquidation">liquidation</GlossaryLink> closes it. The branch&apos;s{" "}
          <GlossaryLink term="Stability Pool">Stability Pool</GlossaryLink> pays off the debt with BD that other users
          deposited, and those depositors receive the collateral.
        </>,
        <>
          Basedollar&apos;s contracts set the minimum debt of a Trove at 200 BD. A redemption repays part of a
          Trove&apos;s debt, and when that leaves an open Trove below the floor, the Trove is{" "}
          <GlossaryLink term="Dormant Trove">dormant</GlossaryLink>.
        </>,
      ]}
      glossary={glossary}
      views={views}
      docs={{
        label: "Liquity V2 documentation (the design Basedollar forks)",
        href: "https://docs.liquity.org/v2-faq",
      }}
    />
  );
}
