// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). f(x) keeps no
// event-prose yaml, so the glossary sits here. Every link is a page of
// fxprotocol.gitbook.io, the host content/official-docs.json lists for fx.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
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
      "A leveraged long on wstETH (wrapped staked ETH) or WBTC (wrapped bitcoin), which the docs call an xPOSITION. The owner locks that token as collateral and borrows fxUSD against it, so the position gains or loses more than the collateral alone when its price moves. The pool mints each position as an NFT.",
    sources: [
      { label: "xPOSITION", href: `${DOCS}/f-x-protocol-mechanisms/creating-a-leveraged-long-position-xposition` },
    ],
  },
  {
    term: "fxUSD",
    definition:
      "The stablecoin that a position borrows. It aims to be worth $1 but can trade away from that price, so Rails shows debt as an amount of fxUSD and never converts it into dollars.",
    sources: [{ label: "Peg protection", href: `${DOCS}/risk-management/advanced-peg-protection-mechanisms` }],
  },
  {
    term: "Debt ratio",
    definition:
      "A position's fxUSD debt divided by the value of its collateral at the oracle price, which is the collateral price that the pool reads from an outside price feed. The docs call this ratio LTV, short for loan-to-value. It rises when the collateral's price falls.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Tick",
    definition:
      "A group of positions whose debt ratios sit within 0.15% of each other. The pool records each position as a share of its tick, and it rebalances or liquidates a whole tick at once.",
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
      "Any address that calls a rebalance or a liquidation. It is paid a bonus in collateral for doing so, and the protocol keeps a share of that bonus.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Rebalance",
    definition:
      "The rebalance line is a debt ratio that the pool sets. Once a tick reaches it, a keeper repays part of the tick's debt and takes collateral worth that debt plus the bonus. The positions in the tick stay open, and their owners keep the fxUSD they borrowed. Each position loses some collateral and some debt, in proportion, and the tick's debt ratio is brought back down to the line.",
    sources: [
      { label: "Rebalancing", href: `${DOCS}/f-x-protocol-mechanisms/rebalancing-the-position-liquidation-brake` },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "The liquidation line is a second, higher debt ratio that the pool sets. Once a tick reaches it, a keeper repays the tick's whole debt and takes collateral worth that debt plus the bonus. Any collateral left over stays with each owner.",
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
      "While fxUSD trades below its peg, anyone may pay fxUSD to receive collateral at the oracle price. A redemption takes from the ticks with the highest debt ratio first, and at most 20% of a tick in one redemption. It helps bring fxUSD back toward $1.",
    sources: [
      {
        label: "Redemption",
        href: `${DOCS}/risk-management/advanced-peg-protection-mechanisms/understanding-the-redemption-mechanism`,
      },
    ],
  },
  {
    term: "Funding",
    definition:
      "A yearly charge on collateral. It is taken continuously, so no transaction records it. The funding rate that Rails reads from each pool follows Aave's USDC borrow rate, and the docs say Funding Level I applies under peg conditions.",
    sources: [{ label: "Fees", href: `${DOCS}/f-x-protocol-mechanisms/fees` }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="fx"
      tracks={
        <>
          The Rails f(x) explorer shows every long position that has borrowed fxUSD against wstETH or WBTC in f(x)
          Protocol V2 on Ethereum, whether still open or closed, and the full history of each one. It also shows each of
          the two pools,{" "}
          <Link href="/ethereum/fx/pools#wsteth" className={INLINE_LINK}>
            one for wstETH
          </Link>{" "}
          and{" "}
          <Link href="/ethereum/fx/pools#wbtc" className={INLINE_LINK}>
            one for WBTC
          </Link>
          , as a whole: its totals and the ticks that group its positions.
        </>
      }
      notCovered="f(x) short positions live in a separate part of the protocol and aren't covered here."
      glossary={GLOSSARY}
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
      search="You can search by holder address or position number. The listing filters by status, pool, size and transactions, and sorts by recent activity, collateral, debt, debt ratio, event count or creation."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>A summary at the top gives each pool&apos;s number of open positions, collateral and fxUSD debt.</li>
              <li>
                Each card shows one position: its holder, its collateral and the dollar value of that collateral, its
                fxUSD debt, its debt ratio and its status.
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
                The top card shows the collateral, the debt and the debt ratio as the pool reports them, with the prices
                at which the tick would be rebalanced or liquidated.
              </li>
              <li>
                Beside the pool&apos;s figures, the page shows what the position&apos;s own transactions add up to. The
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
          heading: "Pools page",
          body: (
            <p>
              The pools page shows each pool&apos;s totals, funding rate and oracle prices. Under them is the
              pool&apos;s tick ladder, a drawing of each tick&apos;s debt along the debt ratio, set against the pool's
              borrow cap, which limits how much can be borrowed, and the rebalance and liquidation lines. A table lists
              every tick, and the debt of the ticks adds up to the pool&apos;s total.{" "}
              <Link href="/ethereum/fx/pools" className={INLINE_LINK}>
                See the pools and their tick ladders
              </Link>
              .
            </p>
          ),
        },
      ]}
      docs={{ label: "f(x) Protocol documentation", href: DOCS }}
    />
  );
}
