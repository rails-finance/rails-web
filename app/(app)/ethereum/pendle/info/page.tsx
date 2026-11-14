// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer: the page on the rail's (i), drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is a page of
// docs.pendle.finance, the host content/official-docs.json lists for pendle.

import {
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  GUIDE_NO_LEARN_MORE,
} from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import {
  PENDLE_LIMIT_ROUTER,
  PENDLE_ORACLE,
  PENDLE_ROUTER_STATIC,
  PENDLE_ROUTER_V3,
  PENDLE_ROUTER_V4,
} from "@/lib/pendle/format";
import { LP_SYMBOL_NOTE, PENDLE_WORDS } from "@/lib/pendle/words";

export const metadata = infoMetadata("pendle");

const DOCS = "https://docs.pendle.finance/pendle-v2/ProtocolMechanics";

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "SY",
    definition:
      "Pendle's standard wrapper around a yield-bearing token. Every market trades against its SY, and the SY's exchange rate says how much of the accounting asset one SY is worth.",
    sources: [{ label: "SY", href: `${DOCS}/YieldTokenization/SY` }],
  },
  {
    term: "PT",
    definition:
      "The principal token: a claim on up to one unit of the market's accounting asset at maturity. Before maturity it trades below that, and the discount is the fixed yield a buyer locks in. By the docs' Negative Yield page, a PT redeems for less while the exchange rate sits under its Watermark Rate.",
    sources: [
      { label: "PT", href: `${DOCS}/YieldTokenization/PT` },
      { label: "Negative Yield", href: `${DOCS}/NegativeYield` },
    ],
  },
  {
    term: "YT",
    definition:
      "The Yield Token: the right to the yield of the yield-bearing token until maturity. The holder claims that yield, and YT is worth nothing after maturity.",
    sources: [{ label: "YT", href: `${DOCS}/YieldTokenization/YT` }],
  },
  {
    term: "LP",
    definition: `A share of a market's pool, which holds PT and SY. ${PENDLE_WORDS.lpEarns} It can be removed before and after maturity. ${LP_SYMBOL_NOTE}`,
    sources: [{ label: "AMM", href: `${DOCS}/LiquidityEngines/AMM#liquidity-providers-lp` }],
  },
  {
    term: "Implied APY",
    definition:
      "By Pendle's docs, the market consensus of the future APY of an asset, from the ratio of the YT price to the PT price.",
    sources: [{ label: "APY Calculation", href: `${DOCS}/PendleMarketAPYCalculation#impliedapy` }],
  },
  {
    term: "Maturity",
    definition:
      "The date a market ends. After it, each PT redeems for up to one unit of the asset, YT is worth nothing, and the pool stops trading.",
    sources: [{ label: "Glossary", href: `${DOCS}/Glossary#maturity` }],
  },
];

// Slot 2a. Each address checked against the chain on 9 Nov 2026: each holds
// code, RouterStatic and the oracle answer getPtToSyRate for a live market,
// and rails-server reads these same addresses (services/pendle-positions.ts,
// services/pendle-router-flows.ts).
const reads: InfoReads = {
  contracts: [
    {
      name: "Each market",
      reads:
        "its tokens, its maturity and whether it has passed, the PT and SY its pool holds, its implied rate, its LP supply and its reward tokens.",
    },
    { name: "Each SY", reads: "the token it wraps, and its exchange rate, what one SY is worth in the asset." },
    {
      name: "PendlePYLpOracle",
      address: PENDLE_ORACLE,
      reads: "the PT, YT and LP prices in SY as a 15-minute average, where the market's oracle is ready.",
    },
    {
      name: "RouterStatic",
      address: PENDLE_ROUTER_STATIC,
      reads:
        "the same prices at the spot rate where the oracle is not ready, and a wallet's balances and unclaimed interest and rewards.",
    },
    {
      name: "PendleRouterV4",
      address: PENDLE_ROUTER_V4,
      reads: "its event logs: every trade, mint, redeem and liquidity move through it.",
    },
    { name: "PendleRouterV3", address: PENDLE_ROUTER_V3, reads: "its event logs, as for V4." },
    { name: "Limit router", address: PENDLE_LIMIT_ROUTER, reads: "its event logs: each limit order fill." },
  ],
  how: "Rails's server reads each market at the chain's finalized block. The markets page serves the last roster at once and reads it again once it is ten minutes old; a market's page and a wallet's page read at each load. The list of markets and every router event come from Rails's server store of the routers' logs.",
  notes: [
    "A market enters the roster once a router event names it, so a market no one has traded through the routers is not listed.",
  ],
};

export default function PendleInfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="pendle"
      tracks={
        <>
          A wallet&rsquo;s principal, yield and liquidity tokens in each Pendle market on Ethereum, read at one block,
          with the router events behind them. Phase 1 reads Pendle&rsquo;s routers: a transfer, or a call that skips
          them, shows as a move outside the routers.
        </>
      }
      glossary={GLOSSARY}
      reads={reads}
      howItWorks={[
        "A Pendle market splits a yield-bearing token into PT, which redeems for up to one unit of the asset at maturity, and YT, which collects the yield until then.",
        "Each market's pool trades PT against SY, and the price of PT gives the market's implied APY.",
        "Rails values PT, YT and LP at Pendle's oracle, a 15-minute average, where the market's oracle is ready, and at RouterStatic's spot rate where it is not, then in the asset at the SY's exchange rate.",
        "The protocol behind each yield-bearing token is a Rails label: the chain does not name it.",
      ]}
      views={[
        {
          heading: "Markets",
          body: "Every market the routers have named, with how many are active and how many have matured, the active markets first. A market's page shows its liquidity, implied APY, PT price, maturity, YT and LP prices, SY exchange rate, pool and latest router events.",
        },
        {
          heading: "Wallet and position pages",
          body: "A wallet's page lists one card per market. A position's page shows its value, Effective Fixed APY against the implied APY now, its maturity, its lifetime flows by leg and its router events.",
        },
      ]}
      notCovered="Arbitrum, Base and the other chains Pendle runs on are not read yet, and PT, YT and LP transfers wait on the next phase."
      docs={{ label: "Pendle documentation", href: "https://docs.pendle.finance" }}
    />
  );
}
