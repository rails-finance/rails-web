// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Liquity V2 on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every glossary source is Liquity's
// official documentation (rails-ops reference/official-docs/liquity-v2.md).

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { fmtMaxLtv } from "@/lib/liquity/ltv";

export const metadata = infoMetadata("liquity-v2");

const DOCS = "https://docs.liquity.org/v2-faq";
const BORROWING = `${DOCS}/borrowing-and-liquidations`;
const REDEMPTIONS = `${DOCS}/redemptions-and-delegation`;

const UL = "list-disc space-y-1 pl-5";

// Each branch's Max LTV, 1 ÷ its MCR (lib/liquity/ltv.ts).
const MAX_LTV_WETH = fmtMaxLtv("WETH");
const MAX_LTV_LST = fmtMaxLtv("wstETH");

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Trove",
    definition:
      "A Trove is one loan. It holds the collateral a borrower locked and the BOLD the borrower owes. One wallet can hold several Troves, and each is adjusted on its own. Each Trove is an NFT, a unique token, so it can be transferred to another wallet.",
    sources: [
      { label: "What is a Trove", href: BORROWING + "#what-is-a-trove" },
      { label: "Are Troves transferable", href: BORROWING + "#are-troves-transferable" },
    ],
  },
  {
    term: "BOLD",
    definition:
      "BOLD is the stablecoin that Liquity V2 creates when a borrower opens a Trove. Borrowers repay in BOLD, and a redemption swaps BOLD back for collateral.",
    sources: [{ label: "What is Liquity V2", href: DOCS + "/general#what-is-liquity-v2" }],
  },
  {
    term: "LTV",
    definition:
      "LTV, loan-to-value, is a Trove's debt divided by the value of its collateral. An LTV of 80% means $80 of debt for every $100 of collateral. Each branch sets a Max LTV, and a Trove above it can be liquidated.",
    sources: [{ label: "Choosing an LTV", href: BORROWING + "#how-do-i-decide-on-my-ltv" }],
  },
  {
    term: "Interest rate",
    definition:
      "Each borrower sets the interest rate on a Trove and can change it. A change within 7 days of the last change adds an Upfront Borrowing Fee. A low rate costs less but puts the Trove earlier in the redemption queue.",
    sources: [{ label: "User-set rates", href: BORROWING + "#what-are-user-set-rates" }],
  },
  {
    term: "Upfront Borrowing Fee",
    definition:
      "The Upfront Borrowing Fee is charged when a borrower opens a Trove, adds debt, joins a batch, or changes the rate within 7 days of the last change. It equals 7 days of average interest and is added to the debt.",
    sources: [{ label: "Other borrowing fees", href: BORROWING + "#are-there-any-other-fees-related-to-borrowing" }],
  },
  {
    term: "Liquidation reserve",
    definition:
      "Opening a Trove also sets aside a liquidation reserve of 0.0375 WETH, a refundable gas deposit. It pays the gas, the fee for a transaction on Ethereum, if the Trove is ever liquidated. The reserve is returned when the Trove closes.",
    sources: [{ label: "Refundable gas deposit", href: BORROWING + "#what-is-the-refundable-gas-deposit" }],
  },
  {
    term: "Delegate",
    definition:
      "A delegate sets one interest rate for all the Troves in its batch and charges a yearly management fee, which is added to the debt on top of the interest. A delegate can change the rate only within a range set in advance. A Trove that leaves a batch sets its own interest rate again.",
    sources: [{ label: "Delegation of interest rates", href: REDEMPTIONS + "#what-is-delegation-of-interest-rates" }],
  },
  {
    term: "Redemption",
    definition:
      "A redemption lets anyone swap BOLD for collateral at a value of 1 dollar per BOLD, which helps keep BOLD near a dollar. It repays the debt of the Troves in the redemption queue, starting with the lowest interest rates.",
    sources: [
      { label: "What are redemptions", href: REDEMPTIONS + "#what-are-redemptions" },
      { label: "If my Trove is redeemed", href: REDEMPTIONS + "#what-happens-if-my-trove-gets-redeemed" },
    ],
  },
  {
    term: "Redemption queue",
    definition:
      "The redemption queue is the Troves of a branch in the order redemptions reach them. The Trove with the lowest interest rate is first, and a higher rate moves a Trove back.",
    sources: [
      { label: "If my Trove is redeemed", href: REDEMPTIONS + "#what-happens-if-my-trove-gets-redeemed" },
      { label: "How to stay protected", href: REDEMPTIONS + "#how-can-i-stay-protected" },
    ],
  },
  {
    term: "Dormant Trove",
    definition:
      "A dormant Trove is one that a redemption left with less than the 2,000 BOLD minimum debt, often none. It leaves the redemption queue, save the branch's most recent dormant Trove with debt left, which is redeemed first. Its owner can close it or bring the debt back above the minimum. Liquity's contracts tag it Zombie.",
    sources: [
      { label: "If my Trove is redeemed", href: REDEMPTIONS + "#what-happens-if-my-trove-gets-redeemed" },
      { label: "Minimum debt", href: BORROWING + "#is-there-a-minimum-debt" },
    ],
  },
  {
    term: "Branch",
    definition:
      "A branch is the separate market for one collateral type: WETH, wstETH or rETH, which are forms of ETH. Each branch has its own Stability Pool, interest rates and limits, so a problem in one branch stays there.",
    sources: [{ label: "How collateral risks are mitigated", href: BORROWING + "#how-are-collateral-risks-mitigated" }],
  },
  {
    term: "Liquidation",
    definition: `A Trove is liquidated when its LTV rises above the Max LTV: ${MAX_LTV_WETH} on WETH or ${MAX_LTV_LST} on wstETH and rETH. The Stability Pool then absorbs the Trove's debt and takes its collateral. The borrower usually pays a 5% penalty and can claim the remaining collateral.`,
    sources: [{ label: "How liquidations work", href: BORROWING + "#how-do-liquidations-work-in-liquity-v2" }],
  },
  {
    term: "Stability Pool",
    definition:
      "Each branch has a Stability Pool of BOLD that depositors supply. Depositors are people who deposit BOLD to cover liquidations. In a liquidation the pool cancels the Trove's debt with its BOLD, and its depositors receive the collateral.",
    sources: [{ label: "How liquidations work", href: BORROWING + "#how-do-liquidations-work-in-liquity-v2" }],
  },
  {
    term: "Redistribution",
    definition:
      "When the Stability Pool cannot cover a liquidated Trove's debt, the shortfall can be spread over the branch's other Troves. Their debt and collateral both rise without any action by their owners.",
    sources: [
      {
        label: "If the Stability Pool is empty",
        href: BORROWING + "#what-mechanisms-are-in-place-if-the-stability-pool-is-empty",
      },
    ],
  },
  {
    term: "TCR",
    definition:
      "The Total Collateral Ratio (TCR) is the collateral ratio of a whole branch: the value of all its collateral divided by all its debt. It shows the branch's overall health.",
    sources: [{ label: "Safety Mode", href: BORROWING + "#what-is-safety-mode" }],
  },
  {
    term: "Shutdown",
    definition:
      "A branch shuts down when its TCR falls below the Shutdown Collateral Ratio (SCR) (110% for WETH, 120% for wstETH and rETH) or its price feed, the service that reports the collateral's price, fails. A shutdown is permanent.",
    sources: [{ label: "Shutdown Mode", href: BORROWING + "#what-is-shutdown-mode" }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>
          Each card shows one Trove with its collateral, debt, interest rate and LTV. The card also shows the
          liquidation price, the collateral price at which the Trove would be liquidated.
        </li>
        <li>A Trove in a batch shows the manager&apos;s name where Rails knows it.</li>
        <li>
          A dormant Trove is still open, and the listing marks it Dormant. The listing without a search shows the Open
          and Dormant Troves, and a search shows Troves of every status.
        </li>
      </ul>
    ),
  },
  {
    heading: "Trove page",
    body: (
      <ul className={UL}>
        <li>
          The top card shows the collateral, the debt and the LTV. An open Trove also shows its interest rate, its
          yearly cost, its liquidation price and the share of the redemption queue ahead of it. The queue is the Troves
          in the order redemptions reach them.
        </li>
        <li>
          The wallet chip names the Trove&apos;s latest owner, and the history belongs to the Trove whoever held it.
        </li>
        <li>
          A Trove can change without its owner acting: interest accrues, a delegate changes the batch&apos;s rate, a
          redemption repays part of it, and a redistribution adds debt and collateral.
        </li>
        <li>
          A Trove&apos;s NFT can be transferred to another wallet, which changes the owner and leaves the loan as it
          was.
        </li>
        <li>The lifetime flows panel totals every borrow, repayment, fee and redemption, with the net result.</li>
        <li>
          The timeline lists each event, newest first, including a delegate&apos;s rate changes and the redemptions
          against the Trove.
        </li>
      </ul>
    ),
  },
  {
    heading: "Branches page",
    body: (
      <p>
        The branches page shows, for each branch, its debt, collateral, number of Troves, span of interest rates, TCR
        and Max LTVs. It links each branch to its Troves in redemption order.{" "}
        <Link href="/ethereum/liquity-v2/branches" className={INLINE_LINK}>
          Open the branches page
        </Link>{" "}
        to see them.
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="liquity-v2"
      tracks={
        <>
          The Rails Liquity V2 explorer shows every Trove on Ethereum, whether still open or closed, and the full
          history of each one. It also shows{" "}
          <Link href="/ethereum/liquity-v2/branches" className={INLINE_LINK}>
            the branches
          </Link>
          , with their debt, their collateral and their shutdown status.
        </>
      }
      notCovered="Stability Pool deposits aren't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Liquity V2 lets a borrower lock collateral, an asset that backs a loan, in a{" "}
          <GlossaryLink term="Trove">Trove</GlossaryLink> and borrow <GlossaryLink term="BOLD">BOLD</GlossaryLink>{" "}
          against it. A wallet is an account address, and one wallet can hold several Troves. The explorer gives each
          Trove its own page.
        </>,
        <>
          The borrower sets the <GlossaryLink term="Interest rate">interest rate</GlossaryLink> and can change it, or
          hand it to a <GlossaryLink term="Delegate">delegate</GlossaryLink> who sets one rate for many Troves. Interest
          is added to the debt as it accrues, and the minimum debt is 2,000 BOLD. Opening a Trove adds an{" "}
          <GlossaryLink term="Upfront Borrowing Fee">Upfront Borrowing Fee</GlossaryLink> to the debt and holds a{" "}
          <GlossaryLink term="Liquidation reserve">liquidation reserve</GlossaryLink>.
        </>,
        <>
          Anyone can make a <GlossaryLink term="Redemption">redemption</GlossaryLink>, which holds BOLD at a dollar.
          Redemptions work through the <GlossaryLink term="Redemption queue">redemption queue</GlossaryLink>, lowest
          rate first, because a higher rate protects a Trove. A redeemed Trove&apos;s debt and collateral fall together,
          and the redemption fee stays with the Trove as extra collateral. A redemption that repays a Trove below the
          minimum debt leaves it <GlossaryLink term="Dormant Trove">dormant</GlossaryLink>, and the owner can close it
          to collect the collateral or borrow against it again.
        </>,
        <>
          Liquity V2 has three <GlossaryLink term="Branch">branches</GlossaryLink>: WETH, wstETH and rETH, which are
          forms of ETH. A Trove is <GlossaryLink term="Liquidation">liquidated</GlossaryLink> when its{" "}
          <GlossaryLink term="LTV">LTV</GlossaryLink> rises above {MAX_LTV_WETH} on WETH or {MAX_LTV_LST} on the others,
          and the <GlossaryLink term="Stability Pool">Stability Pool</GlossaryLink> absorbs it. Any shortfall is a{" "}
          <GlossaryLink term="Redistribution">redistribution</GlossaryLink> to the branch&apos;s other Troves.
        </>,
        <>
          Each branch has a <GlossaryLink term="TCR">TCR</GlossaryLink>. Below its Shutdown Collateral Ratio (SCR), or
          when its price feed (the service that reports the collateral&apos;s price) fails, the branch goes into{" "}
          <GlossaryLink term="Shutdown">shutdown</GlossaryLink>: borrowing, adjustments (changes to a Trove&apos;s
          collateral or debt), rate changes and batch operations stop, while closing and redemptions continue.
        </>,
      ]}
      views={views}
      search="You can search by wallet address, ENS name or Trove ID. The listing filters by Status, Collateral, Redemptions (Redeemed or Never redeemed) and Delegation (Delegated or Individual), and sorts by Recent activity, Debt, Collateral, LTV or Interest Rate."
      docs={{ label: "Liquity V2 documentation", href: DOCS }}
    />
  );
}
