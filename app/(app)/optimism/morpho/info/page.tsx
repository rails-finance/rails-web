// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Morpho Blue on Optimism (ui-jobs 578), drawn on the
// typed template (rails-ops standards/info-page-template.md). The glossary and
// the first "How it works" items are the other Morpho pages'
// (components/protocol/morpho/morpho-info.tsx); the contracts in "How Rails
// reads it" are the ones rails-server's morpho-at-block.ts reads for Optimism.
// Unlaunched with the explorer: infoMetadata adds noindex and the root
// layout's strip covers this route.

import Link from "next/link";
import {
  ProtocolInfoPage,
  type InfoReads,
  type InfoView,
  GUIDE_NO_LEARN_MORE,
} from "@/components/shared/protocol-info-page";
import { MORPHO_INFO_SHARED } from "@/components/protocol/morpho/morpho-info";
import { MORPHO_OPTIMISM } from "@/lib/morpho-at-block/types";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("morpho-optimism");

const UL = "list-disc space-y-1 pl-5";
const ROUTE = MORPHO_OPTIMISM.route;

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's positions",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={ROUTE} className={INLINE_LINK}>
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
        The position page shows the collateral, the debt or the supply, each in dollars where Optimism has a price for
        the loan asset, the LTV against the market&apos;s LLTV, the borrow or supply rate, the room left to borrow, the
        price drop that would liquidate it, and the interest over the last 30 days.
      </p>
    ),
  },
  {
    heading: "Markets",
    body: (
      <p>
        The{" "}
        <Link href={`${ROUTE}/markets`} className={INLINE_LINK}>
          markets overview
        </Link>{" "}
        groups every market Morpho Blue has created on Optimism by the token it lends, with each group&apos;s supply,
        borrowing and utilization in that token. Each market opens its own page: its rates and rate curve, its
        oracle&apos;s price and its terms.
      </p>
    ),
  },
];

const reads: InfoReads = {
  chainId: OPTIMISM_CHAIN_ID,
  contracts: [
    {
      name: "Morpho Blue",
      address: MORPHO_OPTIMISM.contracts.morpho,
      reads:
        "each market's supplied and borrowed totals, its last update and its fee, and a wallet's supply, borrowing and collateral in each market. Its log of created markets is the list of every market.",
    },
    {
      name: "AdaptiveCurveIRM",
      address: MORPHO_OPTIMISM.contracts.adaptiveCurveIrm,
      reads: "each market's borrow rate and its rate at target, the rate the curve sets at 90% utilization.",
    },
    {
      name: "Each market's oracle",
      reads: "the price of one unit of collateral in the loan asset, and the price feeds it names.",
    },
    {
      name: "Chainlink USDC / USD, ETH / USD and USDT / USD",
      reads: "the loan asset's dollar price, for markets that lend USDC, WETH or USDT.",
    },
    {
      name: "Aave V3 Optimism oracle",
      address: MORPHO_OPTIMISM.aaveOracle!.address,
      reads: "the dollar price of a loan asset with no Chainlink feed in Aave's address book, where Aave V3 lists it.",
    },
  ],
  how: "Rails's server reads Morpho Blue's log of created markets once and keeps it, then reads only the blocks since. It reads these contracts at the latest block when you open a page, and a position and its market again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "Positions are read for the wallet you enter, across every market, so there is no listing of every position and no history until Rails indexes Morpho Blue on Optimism.",
    "Interest over 30 days is stated only where the position's shares are the same at both reads; a position opened or changed inside the window says so instead.",
    "Markets that lend USD₮0 have no dollar figures: Aave's address book lists no Chainlink feed on Optimism for it and Aave V3's oracle there does not price it, so their figures stay in USD₮0.",
    "A market joins the list once Optimism finalizes the block that created it, about half an hour later; its own page answers before then.",
    "The addresses are those on Morpho's addresses page, each checked on chain; the price feeds are those Aave's address book lists for Optimism (ChainlinkOptimism.sol).",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="morpho-optimism"
      tracks={
        <>
          The Rails Morpho Blue explorer on Optimism shows any wallet&apos;s positions across every market: the
          collateral, the debt or the supply, the LTV against the market&apos;s line and the interest over the last 30
          days. It also shows{" "}
          <Link href={`${ROUTE}/markets`} className={INLINE_LINK}>
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
        "Each market's oracle prices its collateral in its loan asset, and Morpho Blue states no dollar value. Rails gives a dollar figure at the loan asset's Chainlink feed on Optimism, or at Aave V3's oracle there for a token with no feed, so a USDC debt reads in dollars.",
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Morpho documentation", href: "https://docs.morpho.org/" }}
    />
  );
}
