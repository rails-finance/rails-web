// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). f(x) keeps no
// event-prose yaml, so the glossary sits here. Every link is a page of
// fxprotocol.gitbook.io, the host content/official-docs.json lists for fx.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoReads, type InfoTerm } from "@/components/shared/protocol-info-page";
import { FX_ADDRESSES, FX_POOL_KEYS, FX_POOLS } from "@/lib/fx/asset-catalog";
import { FX_FUNDING_RULE, fxPoolAnchorSentence } from "@/lib/fx/statement-words";
import { FX_DOCS_AND_CHAIN } from "@/lib/fx/docs-and-chain";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("fx");

const DOCS = "https://fxprotocol.gitbook.io/fx-docs";
const UL = "list-disc space-y-1 pl-5";

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Pool",
    definition:
      "One of the two f(x) markets for long positions: one takes wstETH as collateral and the other takes WBTC. Each pool holds its own positions, totals and ticks.",
    sources: [
      { label: "xPOSITION", href: `${DOCS}/f-x-protocol-mechanisms/creating-a-leveraged-long-position-xposition` },
    ],
  },
  {
    term: "Position",
    definition:
      "A loan of fxUSD against wstETH (wrapped staked ETH) or WBTC (wrapped bitcoin) that the owner locks as collateral. The pool mints each position as an NFT. The docs call a leveraged one, opened in one step with a flash loan, an xPOSITION, and a plain loan fxMINT; both are positions in the same pool, and nothing Rails reads tells them apart.",
    sources: [
      { label: "xPOSITION", href: `${DOCS}/f-x-protocol-mechanisms/creating-a-leveraged-long-position-xposition` },
      { label: "fxMINT", href: `${DOCS}/f-x-protocol-mechanisms/fxmint-borrowing-fxusd-against-your-btc-and-eth` },
    ],
  },
  {
    term: "fxUSD",
    definition:
      "The stablecoin that a position borrows. It aims to be worth $1 but can trade away from that price, so Rails shows debt as an amount of fxUSD and never converts it into dollars.",
    sources: [{ label: "Peg protection", href: `${DOCS}/risk-management/advanced-peg-protection-mechanisms` }],
  },
  {
    term: "LTV",
    definition:
      "Loan-to-value: a position's fxUSD debt divided by the value of its collateral at the oracle price, which is the collateral price that the pool reads from an outside price feed. It rises when the collateral's price falls. The docs' developer pages and the contracts call it the debt ratio.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Tick",
    definition:
      "A group of positions whose LTVs sit within 0.15% of each other. The pool records each position as a share of its tick, and it rebalances or liquidates a whole tick at once.",
    sources: [
      { label: "Ticks", href: `${DOCS}/developers/processing-the-rebalances-and-liquidations/ticks` },
      {
        label: "Band system",
        href: `${DOCS}/f-x-protocol-mechanisms/rebalancing-the-position-liquidation-brake/understanding-the-band-system`,
      },
    ],
  },
  {
    term: "Keeper",
    definition:
      "Any address that calls a rebalance or a liquidation. It is paid a bounty in collateral for doing so, and the protocol keeps a share of that bounty.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Rebalance",
    definition:
      "The rebalance line is an LTV that the pool sets. Once a tick reaches it, a keeper repays part of the tick's debt and takes collateral worth that debt plus the bounty. The positions in the tick stay open, and their owners keep the fxUSD they borrowed. Each position loses some collateral and some debt, in proportion, and the tick's LTV is brought back down to the line.",
    sources: [
      { label: "Rebalancing", href: `${DOCS}/f-x-protocol-mechanisms/rebalancing-the-position-liquidation-brake` },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "The liquidation line is a second, higher LTV that the pool sets. Once a tick reaches it, a keeper repays the tick's whole debt and takes collateral worth that debt plus the bounty. Any collateral left over stays with each owner.",
    sources: [
      {
        label: "Liquidation process",
        href: `${DOCS}/f-x-protocol-mechanisms/rebalancing-the-position-liquidation-brake/liquidation-process`,
      },
    ],
  },
  {
    term: "Redemption",
    definition:
      "While fxUSD trades below its peg, anyone may pay fxUSD to receive collateral at the oracle price. A redemption takes from the ticks with the highest LTV first, and takes at most 20% of each position's debt at a time. It helps bring fxUSD back toward $1.",
    sources: [
      {
        label: "Redemption",
        href: `${DOCS}/risk-management/advanced-peg-protection-mechanisms/understanding-the-redemption-mechanism`,
      },
    ],
  },
  {
    term: "Funding",
    definition: `A yearly charge on every position's collateral. It is taken continuously, so no transaction records it. ${FX_FUNDING_RULE}`,
    sources: [{ label: "Fees", href: `${DOCS}/f-x-protocol-mechanisms/fees` }],
  },
];

// Slot 2a (decision 0059 point 6): the contracts and oracle mechanics that
// left the pools pages.
const reads: InfoReads = {
  contracts: [
    {
      name: "The wstETH pool",
      address: FX_ADDRESSES.WSTETH_POOL,
      reads:
        "its collateral and debt, the indexes funding and bad debt move, its rebalance and liquidation lines and bounties, every tick holding debt and the debt and collateral in it, the position count, and each position's collateral, debt and tick. The pool also mints the positions as NFTs.",
    },
    {
      name: "The WBTC pool",
      address: FX_ADDRESSES.WBTC_POOL,
      reads: "the same as the wstETH pool.",
    },
    {
      name: "Each pool's price oracle",
      reads: `three prices for the pool's collateral. ${FX_POOL_KEYS.map((k) => fxPoolAnchorSentence(FX_POOLS[k].tokenSymbol, FX_POOLS[k].anchor)).join(" ")} The min and max are the lowest and highest of the anchor and the prices on trading venues, each falling back to the anchor when a venue's price strays too far. The pool judges borrowing, rebalancing and liquidation at the min price, a position's LTV at the anchor, and redemption at the max.`,
    },
    {
      name: "Each pool's configuration",
      reads: "the funding rate, the default fees and whether redemption is open.",
    },
    {
      name: "PoolManager",
      address: FX_ADDRESSES.POOL_MANAGER,
      reads: "each pool's caps on collateral and debt.",
    },
  ],
  how: "The pools pages read both pools at most every ten minutes, and a position page reads its pool at each load. Position histories come from Rails's server store of f(x)'s events.",
  notes: [
    <>
      Rails checks each pool&apos;s ticks against its total on every read: the debt shares in every tick add up to the
      pool&apos;s total debt shares, compared as whole numbers before any rounding. The collateral differs by what
      positions with no debt hold, since a position with no debt sits in no tick. A tick holding less than a billionth
      of an fxUSD is one the pool&apos;s rebalance and liquidation skip; the pool page counts these ticks and leaves
      them out of its drawing.
    </>,
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="fx"
      tracks={
        <>
          The Rails f(x) explorer shows every long position that has borrowed fxUSD against wstETH or WBTC in f(x)
          Protocol V2 on Ethereum, whether still open or closed, and the full history of each one. It also shows each of
          the two pools,{" "}
          <Link href="/ethereum/fx/pools/wsteth" className={INLINE_LINK}>
            one for wstETH
          </Link>{" "}
          and{" "}
          <Link href="/ethereum/fx/pools/wbtc" className={INLINE_LINK}>
            one for WBTC
          </Link>
          , as a whole: its totals and the ticks that group its positions.
        </>
      }
      notCovered="f(x) short positions live in a separate part of the protocol and aren't covered here."
      glossary={GLOSSARY}
      docsAndChain={FX_DOCS_AND_CHAIN}
      howItWorks={[
        <>
          f(x) acts on whole <GlossaryLink term="Tick">ticks</GlossaryLink>. A{" "}
          <GlossaryLink term="Rebalance">rebalance</GlossaryLink>, a{" "}
          <GlossaryLink term="Liquidation">liquidation</GlossaryLink> or a{" "}
          <GlossaryLink term="Redemption">redemption</GlossaryLink> changes every position in a tick at once and in
          proportion, so the position has no transaction of its own that shows the change.
        </>,
        <>
          <GlossaryLink term="Funding" /> is charged across the whole pool: it lowers every position&apos;s collateral
          in proportion, and no transaction records it. When a liquidation cannot cover all of a tick&apos;s debt, the
          shortfall is spread over every other position in the pool.
        </>,
        "A rebalance or a liquidation repays debt from the position's collateral. The owner keeps the fxUSD that was borrowed. The position's NFT also stays with its owner after the position closes, and the owner can add collateral to it again.",
      ]}
      reads={reads}
      search="You can search by holder address or position number. The listing filters by status, pool, size and transactions, and sorts by recent activity, collateral, debt, LTV, event count or creation."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>A summary at the top gives each pool&apos;s number of open positions, collateral and fxUSD debt.</li>
              <li>
                Each card shows one position: its holder, its collateral and the dollar value of that collateral, its
                fxUSD debt, its LTV and its status.
              </li>
              <li>
                A position's status is open, closed or ever liquidated. The listing shows open positions by default, and
                searching for a holder or a position shows every status.
              </li>
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The top card shows the collateral, the debt and the LTV as the pool reports them, with the prices at
                which the tick would be rebalanced or liquidated.
              </li>
              <li>
                Beside the pool&apos;s figures, the page shows what the position&apos;s transactions add up to. The
                difference between the two figures is what funding and tick-wide events changed, and a table below
                splits it by the period between two transactions.
              </li>
              <li>
                The timeline lists each of the position&apos;s transactions and places the tick-wide events that reached
                the position between them.
              </li>
            </ul>
          ),
        },
        {
          heading: "Pools",
          body: (
            <ul className={UL}>
              <li>
                <Link href="/ethereum/fx/pools" className={INLINE_LINK}>
                  The pools page
                </Link>{" "}
                shows each pool&apos;s collateral, fxUSD debt, funding rate, LTV and its rebalance and liquidation
                lines.
              </li>
              <li>
                Each pool&apos;s page adds its three oracle prices, its tick ladder, a drawing of each tick&apos;s debt
                along the LTV, and a table of every tick. The debt in the ticks adds up to the pool&apos;s total, and
                the page says so.
              </li>
            </ul>
          ),
        },
      ]}
      docs={{ label: "f(x) Protocol documentation", href: DOCS }}
    />
  );
}
