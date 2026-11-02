// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). f(x) keeps no
// event-prose yaml, so the glossary sits here. Every link is a page of
// fxprotocol.gitbook.io, the host content/official-docs.json lists for fx.

import Link from "next/link";
import { ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("fx");

const DOCS = "https://fxprotocol.gitbook.io/fx-docs";
const UL = "list-disc space-y-1 pl-5";

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Position",
    definition:
      "A leveraged long on wstETH or WBTC, which the docs call an xPOSITION. It is an NFT the pool mints, with fxUSD debt drawn against its collateral.",
    sources: [
      { label: "xPOSITION", href: `${DOCS}/f-x-protocol-mechanisms/creating-a-leveraged-long-position-xposition` },
    ],
  },
  {
    term: "fxUSD",
    definition:
      "The stablecoin a position borrows. It aims at $1 and can trade off it, so Rails states debt as a count of fxUSD tokens.",
    sources: [{ label: "Peg protection", href: `${DOCS}/risk-management/advanced-peg-protection-mechanisms` }],
  },
  {
    term: "Debt ratio",
    definition:
      "A position's fxUSD debt divided by its collateral's value at the oracle price; the docs call it LTV. The pool's rebalance and liquidation lines are set on it.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Tick",
    definition:
      "A bucket of positions whose debt ratios sit within 0.15% of each other. The pool records a position as a share of its tick.",
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
      "Any address that calls a rebalance or a liquidation. A bonus in collateral pays it, and the protocol keeps a share of the bonus.",
    sources: [{ label: "Risk parameters", href: `${DOCS}/risk-management/risk-parameters` }],
  },
  {
    term: "Rebalance",
    definition:
      "From the rebalance line, a keeper repays part of a tick's debt and takes collateral worth that debt plus the bonus. The tick's positions stay open, back at the line.",
    sources: [
      { label: "Rebalancing", href: `${DOCS}/f-x-protocol-mechanisms/rebalancing-the-position-liquidation-brake` },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "From the higher liquidation line, a keeper repays a tick's whole debt and takes collateral worth it plus the bonus. Collateral left over stays with each owner.",
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
      "While fxUSD trades below its peg, anyone may pay fxUSD for collateral at the oracle price. It takes from the highest-ratio ticks first, at most 20% of a tick per pass.",
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
      "A yearly charge on collateral, taken with no event. The funding rate Rails reads from each pool follows Aave's USDC borrow rate; the docs say Funding Level I applies under peg conditions.",
    sources: [{ label: "Fees", href: `${DOCS}/f-x-protocol-mechanisms/fees` }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="fx"
      name="f(x)"
      tracks="Every f(x) Protocol V2 long position on Ethereum, in the wstETH and WBTC pools, open or closed, with its history, and the ticks of both pools. Short positions sit on a separate manager and are not shown."
      glossary={GLOSSARY}
      howItWorks={[
        "f(x) acts on whole ticks. A rebalance, liquidation or redemption changes every position in the tick at once, in proportion, and the position logs no event of its own.",
        "Funding works across the whole pool. So does debt a liquidation could not cover, which is added to every other position in the pool.",
        "The owner keeps the fxUSD borrowed through a rebalance or a liquidation. The NFT stays with its owner after closing, and can be funded again.",
      ]}
      search="Search takes a holder address or a position number. Filters: status, pool, size, transactions. Sort: recent activity, collateral, debt, debt ratio, event count, created."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>A band at the top gives each pool&rsquo;s open positions, collateral and fxUSD debt.</li>
              <li>
                One card per position: its holder, its collateral and dollar value, its fxUSD debt, its debt ratio and
                status.
              </li>
              <li>Open positions show by default. Searching a holder or a position shows every status.</li>
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The top card reads collateral, debt and debt ratio from the pool, with the prices at which the tick
                would be rebalanced or liquidated.
              </li>
              <li>
                Beside the pool&rsquo;s reading it sets what the position&rsquo;s transactions add up to. The gap is
                what funding and tick-wide events changed, split by stretch between transactions in a table below.
              </li>
              <li>The timeline lists each transaction and places the tick-wide events that reached the position.</li>
            </ul>
          ),
        },
        {
          heading: "Pools page",
          body: (
            <p>
              Each pool&rsquo;s totals, funding rate and oracle prices, then its tick ladder: a drawing of each
              tick&rsquo;s debt along the debt ratio, against the borrow cap, rebalance and liquidation lines. A table
              lists every tick, and the ticks&rsquo; debt adds up exactly to the pool&rsquo;s total.{" "}
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
