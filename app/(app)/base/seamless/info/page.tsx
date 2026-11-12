// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Seamless on Base, drawn on the typed template
// (rails-ops standards/info-page-template.md). Seamless's own documentation site is offline
// (reference/official-docs/seamless.md), so the glossary links the Aave V3 documentation, the
// code its Pool runs.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { SEAMLESS_FREEZE_BLOCK, SEAMLESS_FREEZE_DATE, SEAMLESS_FREEZE_TX } from "@/lib/seamless/asset-catalog";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("seamless");

const DOCS = "https://aave.com/docs/aave-v3";
const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Pool",
    definition:
      "The Pool is the smart contract, a program that runs on the chain, that holds every reserve's supplied assets and records each wallet's account. Seamless has one Pool on Base.",
    sources: [{ label: "Liquidity pool", href: DOCS + "/concepts/liquidity-pool" }],
  },
  {
    term: "Reserve",
    definition:
      "A reserve is one asset in the Pool. It has its own interest rates, supply and borrow caps, which are the most that can be supplied or borrowed, and risk settings. One such setting is the liquidation threshold, which caps the share of the asset's value that can be borrowed against before an account is unsafe.",
    sources: [{ label: "Reserves", href: DOCS + "/concepts/reserve#key-reserve-parameters" }],
  },
  {
    term: "Supplied",
    definition:
      "Supplied assets are the assets a wallet has supplied to the Pool to earn interest. The wallet can withdraw them again, with their interest.",
    sources: [{ label: "Supply", href: DOCS + "/overview#supply" }],
  },
  {
    term: "Collateral",
    definition:
      "Collateral is the supplied assets that count toward a wallet's borrowing. Only those assets back its debt and count toward its health factor.",
    sources: [
      {
        label: "Collateral status",
        href: "https://aave.com/help/supplying/toggle-collateral-status#step-4-monitor-your-health-factor",
      },
    ],
  },
  {
    term: "Debt",
    definition: "Debt is what a wallet has borrowed from the Pool plus the interest on it.",
    sources: [{ label: "Borrow", href: DOCS + "/overview#borrow" }],
  },
  {
    term: "Health factor",
    definition:
      "The health factor is a score for the safety of one account. It divides the value of the collateral, weighted by each asset's liquidation threshold, by the debt. Below 1, the account can be liquidated.",
    sources: [{ label: "Health factor", href: "https://aave.com/help/borrowing/liquidations#health-factor" }],
  },
  {
    term: "Liquidation",
    definition:
      "Liquidation happens when an account's health factor falls below 1. Anyone may then repay part of its debt and take collateral worth that amount plus a bonus.",
    sources: [
      { label: "Liquidation process", href: "https://aave.com/help/borrowing/liquidations#liquidation-process" },
    ],
  },
  {
    term: "Frozen reserve",
    definition:
      "A frozen reserve accepts no new supply and no new borrow. It still builds up interest, and holders can still repay, withdraw and be liquidated.",
    sources: [{ label: "Freeze a reserve", href: DOCS + "/smart-contracts/pool-configurator#setreservefreeze" }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <>
        <ul className={UL}>
          <li>
            Each card shows one account: the wallet, what it supplied and what it owes, read from the Pool at the block
            the card names.
          </li>
          <li>
            A card is Open while the account still holds supplied assets or debt. It is Closed once it holds neither and
            was never liquidated, and Liquidated once it holds neither and was liquidated at least once.
          </li>
          <li>
            The listing shows open accounts by default. Searching for a wallet shows its accounts of every status.
          </li>
          <li>When the note below says the list is partial or still being assembled, some accounts may be missing.</li>
        </ul>
        <BaseLendingCoverageNote route="/api/seamless/coverage" restsOnOpen />
      </>
    ),
  },
  {
    heading: "Position page",
    body: (
      <ul className={UL}>
        <li>
          The top card shows what the wallet supplied, what it owes and its health factor, read now from the Pool.
        </li>
        <li>The timeline lists the account&apos;s events, newest first.</li>
      </ul>
    ),
  },
  {
    heading: "Market page",
    body: (
      <p>
        The market page shows each reserve with its size, rates, risk settings and price, and explains the supply and
        borrow caps and the frozen reserves.{" "}
        <Link href="/base/seamless/markets" className={INLINE_LINK}>
          Open the market page
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="seamless"
      tracks={
        <>
          The Rails Seamless explorer shows every account in Seamless&apos;s lending market on Base, whether still open
          or closed, and the full history of each one. It also shows{" "}
          <Link href="/base/seamless/markets" className={INLINE_LINK}>
            the market
          </Link>{" "}
          itself: its assets, with their rates, risk settings and prices.
        </>
      }
      glossary={glossary}
      howItWorks={[
        <>
          Seamless is a lending protocol on Base, a network built on Ethereum. Its contract is built from Aave V3&apos;s
          open code. Lenders <GlossaryLink term="Supplied">supply</GlossaryLink> crypto, and borrowers take out other
          crypto against it.
        </>,
        <>
          The <GlossaryLink term="Pool">Pool</GlossaryLink> is Seamless&apos;s lending contract on Base, and this page
          calls it the market. Each asset in the Pool is a <GlossaryLink term="Reserve">reserve</GlossaryLink>. An
          account is the assets one wallet (an address that holds crypto) has supplied and the{" "}
          <GlossaryLink term="Debt">debt</GlossaryLink> it owes in the Pool.
        </>,
        <>
          The market is closed to new accounts and winding down. All eighteen reserves were frozen in{" "}
          <a
            href={explorerUrl(BASE_CHAIN_ID, "tx-logs", SEAMLESS_FREEZE_TX)}
            target="_blank"
            rel="noopener"
            className="link-external"
          >
            one transaction
          </a>{" "}
          (a single signed action on the chain) at block {SEAMLESS_FREEZE_BLOCK.toLocaleString("en-US")} (a block is the
          chain&apos;s unit of time) on {SEAMLESS_FREEZE_DATE}. A{" "}
          <GlossaryLink term="Frozen reserve">frozen reserve</GlossaryLink> still builds up interest and can still be
          repaid, withdrawn and liquidated, so open accounts here are real and moving, but none can take on new debt.
        </>,
        <>
          All of an account&apos;s <GlossaryLink term="Collateral">collateral</GlossaryLink> backs all of its debt at
          once. One <GlossaryLink term="Health factor">health factor</GlossaryLink> scores how safe the whole account
          is.
        </>,
        <>
          Dollar values use the prices the Pool uses to decide{" "}
          <GlossaryLink term="Liquidation">liquidation</GlossaryLink>, so a fall in a price can make an account
          liquidatable.
        </>,
      ]}
      views={views}
      search="You can search by wallet address. The listing filters by Status (open, closed or liquidated), Debt (USD), Collateral (USD) and History (accounts that were liquidated at least once), and sorts by Recent activity, Debt or Collateral."
      docs={{ label: "Aave V3 documentation, the code Seamless runs", href: DOCS + "/overview" }}
    />
  );
}
