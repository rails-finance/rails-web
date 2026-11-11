// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Aave V4 on Arc (ui-jobs 577), drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary is the
// Ethereum and Base pages' (content/aave-v4/event-prose.yaml); the contracts in
// "How Rails reads it" are the ones rails-server's aave-v4-arc-at-block.ts
// reads. Unlaunched with the explorer: infoMetadata adds noindex and the root
// layout's strip covers this route.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoReads, type InfoView } from "@/components/shared/protocol-info-page";
import { aaveV4Glossary } from "@/lib/aave-v4/event-templates";
import { AAVE_V4_ARC_CONTRACTS } from "@/lib/aave-v4-arc/types";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("aave-v4-arc");

const ROUTE = "/arc/aave-v4";
const UL = "list-disc space-y-1 pl-5";
const [MAIN, FOREX, MAPLE] = AAVE_V4_ARC_CONTRACTS.spokes;

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's accounts",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={ROUTE} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see the spokes it supplies to or borrows from.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>
            Each row names the spoke, the assets supplied and borrowed, their dollar values and the health factor.
          </li>
          <li>Each row opens the account&apos;s page.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Account page",
    body: (
      <p>
        The account page shows what the wallet supplies and owes on one spoke, each in dollars at the spoke&apos;s
        oracle, its health factor and borrow limit, each supplied asset&apos;s collateral factor, each borrowed
        asset&apos;s rate, and the interest each balance gathered over the last 30 days.
      </p>
    ),
  },
  {
    heading: "Markets, reserves and hubs",
    body: (
      <ul className={UL}>
        <li>
          <Link href={`${ROUTE}/markets`} className={INLINE_LINK}>
            Markets
          </Link>{" "}
          lists the three spokes with what each has supplied and borrowed; each opens its reserves, and each reserve its
          page, with the spoke&apos;s terms beside the hub&apos;s figures for that asset.
        </li>
        <li>
          <Link href={`${ROUTE}/hubs`} className={INLINE_LINK}>
            Hubs
          </Link>{" "}
          shows the Core hub&apos;s assets, its credit lines to each spoke and their rates.
        </li>
      </ul>
    ),
  },
];

const reads: InfoReads = {
  contracts: [
    {
      name: "Core hub",
      address: AAVE_V4_ARC_CONTRACTS.hub,
      reads: "each asset's supply, borrowing, liquidity, drawn rate and fee, and each spoke's credit line.",
    },
    {
      name: `${MAIN.name} spoke`,
      address: MAIN.address,
      reads: "its reserves and terms, and an account's balances, shares and health factor.",
    },
    { name: `${MAIN.name} spoke oracle`, address: MAIN.oracle, reads: "each reserve's dollar price." },
    {
      name: `${FOREX.name} spoke`,
      address: FOREX.address,
      reads: "its reserves and terms, and an account's balances, shares and health factor.",
    },
    { name: `${FOREX.name} spoke oracle`, address: FOREX.oracle, reads: "each reserve's dollar price." },
    {
      name: `${MAPLE.name} spoke`,
      address: MAPLE.address,
      reads: "its reserves and terms, and an account's balances, shares and health factor.",
    },
    { name: `${MAPLE.name} spoke oracle`, address: MAPLE.oracle, reads: "each reserve's dollar price." },
  ],
  how: "Rails's server reads these contracts at the block current when you open a page, and an account's balances and shares again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "Positions are read from the spokes' state for the wallet you enter, so there is no listing of every account, no holder ranking and no history until Rails indexes Aave V4 on Arc.",
    "Interest over 30 days is stated only where the account's shares are the same at both reads; a balance opened or changed inside the window says so instead.",
    "The addresses are those in Aave's address book (aave-address-book, AaveV4Arc.sol), each checked on chain: the hub lists the three spokes, and each spoke names its oracle.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="aave-v4-arc"
      tracks={
        <>
          The Rails Aave V4 explorer on Arc shows a wallet&apos;s accounts on the Core hub&apos;s three spokes: what
          each supplies and owes in dollars, its health factor and the interest over the last 30 days. It also shows{" "}
          <Link href={`${ROUTE}/markets`} className={INLINE_LINK}>
            the spokes&apos; reserves
          </Link>{" "}
          and{" "}
          <Link href={`${ROUTE}/hubs`} className={INLINE_LINK}>
            the Core hub
          </Link>
          .
        </>
      }
      notCovered="An account's history, a listing of every account, the largest suppliers and borrowers, liquidations and incentive rewards aren't covered here."
      glossary={aaveV4Glossary()}
      howItWorks={[
        <>
          Aave V4 lets people supply crypto to earn interest and borrow against it. A{" "}
          <GlossaryLink term="Position">position</GlossaryLink> is one wallet&apos;s supplied assets and debt on one
          spoke.
        </>,
        <>
          The <GlossaryLink term="Hub">hub</GlossaryLink> holds the money people supply.{" "}
          <GlossaryLink term="Spoke">Spokes</GlossaryLink> are where people open positions and borrow from it, each up
          to its <GlossaryLink term="Credit line">credit line</GlossaryLink>.
        </>,
        `Arc has one hub, Core, and three spokes: ${MAIN.name} lends USDC, EURC, cirBTC and WETH and takes cirBTC and WETH as collateral; ${FOREX.name} lends USDC against EURC; ${MAPLE.name} lends USDC against Maple's syrupUSDC. On Arc, USDC is also the chain's gas token.`,
        <>
          A wallet&apos;s <GlossaryLink term="Collateral">collateral</GlossaryLink> on a spoke backs its debt there
          under one <GlossaryLink term="Health factor">health factor</GlossaryLink>, and each asset&apos;s{" "}
          <GlossaryLink term="Collateral factor">collateral factor</GlossaryLink> sets how much debt it can carry.
        </>,
        <>
          Dollar values use each spoke&apos;s oracle, the contract that reports each asset&apos;s price, from Chainlink
          feeds on Arc. The spoke uses the same prices when it carries out a{" "}
          <GlossaryLink term="Liquidation">liquidation</GlossaryLink>.
        </>,
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Aave V4 documentation", href: "https://aave.com/docs/aave-v4" }}
    />
  );
}
