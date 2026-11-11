// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Morpho Blue on Arc (ui-jobs 577), drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary and the
// first "How it works" items are the other Morpho pages'
// (components/protocol/morpho/morpho-info.tsx); the contracts in "How Rails
// reads it" are the ones rails-server's morpho-arc-at-block.ts reads.
// Unlaunched with the explorer: infoMetadata adds noindex and the root
// layout's strip covers this route.

import Link from "next/link";
import { ProtocolInfoPage, type InfoReads, type InfoView } from "@/components/shared/protocol-info-page";
import { MORPHO_INFO_SHARED } from "@/components/protocol/morpho/morpho-info";
import { MORPHO_ARC_CONTRACTS, MORPHO_ARC_ROUTE } from "@/lib/morpho-arc/types";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("morpho-arc");

const UL = "list-disc space-y-1 pl-5";

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's positions",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={MORPHO_ARC_ROUTE} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see the markets it lends to, borrows from or holds collateral in.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>Each row names the market&apos;s pair and LLTV, the collateral, debt or supply, and the LTV.</li>
          <li>Each row opens the position&apos;s page.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Position page",
    body: (
      <p>
        The position page shows the collateral, the debt or the supply, each in dollars where Arc has a price feed for
        the loan token, the LTV against the market&apos;s LLTV, the borrow or supply rate, the room left to borrow, the
        price drop that would liquidate it, and the interest over the last 30 days.
      </p>
    ),
  },
  {
    heading: "Markets",
    body: (
      <p>
        The{" "}
        <Link href={`${MORPHO_ARC_ROUTE}/markets`} className={INLINE_LINK}>
          markets overview
        </Link>{" "}
        groups every market Morpho Blue has created on Arc by the token it lends, with each group&apos;s supply,
        borrowing and utilisation in that token. Each market opens its own page: its rates and rate curve, its
        oracle&apos;s price and its terms.
      </p>
    ),
  },
];

const reads: InfoReads = {
  chainId: ARC_CHAIN_ID,
  contracts: [
    {
      name: "Morpho Blue",
      address: MORPHO_ARC_CONTRACTS.morpho,
      reads:
        "each market's supplied and borrowed totals, its last update and its fee, and a wallet's supply, borrowing and collateral in each market. Its log of created markets is the list of every market.",
    },
    {
      name: "AdaptiveCurveIRM",
      address: MORPHO_ARC_CONTRACTS.adaptiveCurveIrm,
      reads: "each market's borrow rate and its rate at target, the rate the curve sets at 90% utilisation.",
    },
    {
      name: "Each market's oracle",
      reads: "the price of one unit of collateral in the loan token, and the price feeds it names.",
    },
    {
      name: "Chainlink USDC / USD and EURC / USD",
      reads: "the loan token's dollar price, for markets that lend USDC or EURC.",
    },
  ],
  how: "Rails's server reads Morpho Blue's log of created markets once and keeps it, then reads only the blocks since. It reads these contracts at the block current when you open a page, and a position and its market again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "Positions are read for the wallet you enter, across every market, so there is no listing of every position and no history until Rails indexes Morpho Blue on Arc.",
    "Interest over 30 days is stated only where the position's shares are the same at both reads; a position opened or changed inside the window says so instead.",
    "Markets that lend MXNB, wARS or GBPA, and a test market lending a mock token, have no dollar figures: Aave's address book lists no Chainlink feed on Arc for those tokens, so their figures stay in the loan token.",
    "The addresses are those on Morpho's addresses page, each checked on chain; the price feeds are those Aave's address book lists for Arc (ChainlinkArc.sol).",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="morpho-arc"
      tracks={
        <>
          The Rails Morpho Blue explorer on Arc shows any wallet&apos;s positions across every market: the collateral,
          the debt or the supply, the LTV against the market&apos;s line and the interest over the last 30 days. It also
          shows{" "}
          <Link href={`${MORPHO_ARC_ROUTE}/markets`} className={INLINE_LINK}>
            the markets
          </Link>
          .
        </>
      }
      notCovered="A position's history, a listing of every position, the largest suppliers and borrowers, liquidations and vaults aren't covered here."
      glossary={MORPHO_INFO_SHARED.glossary()}
      howItWorks={[
        MORPHO_INFO_SHARED.whatItIs,
        MORPHO_INFO_SHARED.isolatedMarkets,
        MORPHO_INFO_SHARED.liquidation,
        "Each market's oracle prices its collateral in its loan token, and Morpho Blue states no dollar value. Rails gives a dollar figure where Arc has a Chainlink feed for the loan token, so a USDC debt reads in dollars. On Arc, USDC is also the chain's gas token.",
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Morpho documentation", href: "https://docs.morpho.org/" }}
    />
  );
}
