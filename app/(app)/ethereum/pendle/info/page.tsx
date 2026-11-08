// About this explorer: the page on the rail's (i), drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is a page of
// docs.pendle.finance, the host content/official-docs.json lists for pendle.

import { ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("pendle");

const DOCS = "https://docs.pendle.finance/ProtocolMechanics";

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "SY",
    definition:
      "Pendle's standard wrapper around a yield-bearing token. Every market trades against its SY, and the SY's exchange rate says how much of the underlying asset one SY is worth.",
    sources: [{ label: "SY", href: `${DOCS}/YieldTokenization/SY` }],
  },
  {
    term: "PT",
    definition:
      "The principal token: a claim on one unit of the market's asset at maturity. Before maturity it trades below that, and the discount is the fixed yield a buyer locks in.",
    sources: [{ label: "PT", href: `${DOCS}/YieldTokenization/PT` }],
  },
  {
    term: "YT",
    definition:
      "The yield token: the right to the yield of the underlying token until maturity. It pays that yield as interest the holder claims, and is worth nothing after maturity.",
    sources: [{ label: "YT", href: `${DOCS}/YieldTokenization/YT` }],
  },
  {
    term: "LP",
    definition:
      "A share of a market's pool, which holds PT and SY and earns the pool's swap fees and rewards. It can be removed before and after maturity.",
    sources: [{ label: "AMM", href: `${DOCS}/LiquidityEngines/AMM` }],
  },
  {
    term: "Implied APY",
    definition:
      "The fixed rate the market prices PT at: the yearly return of buying PT now and holding it to maturity.",
    sources: [{ label: "Market APY", href: `${DOCS}/PendleMarketAPYCalculation` }],
  },
  {
    term: "Maturity",
    definition:
      "The date a market ends. After it, each PT redeems for one unit of the asset, YT is worth nothing, and the pool stops trading.",
    sources: [{ label: "Minting", href: `${DOCS}/YieldTokenization/Minting` }],
  },
];

export default function PendleInfoPage() {
  return (
    <ProtocolInfoPage
      session="pendle"
      tracks={
        <>
          A wallet&rsquo;s principal, yield and liquidity tokens in each Pendle market on Ethereum, read at one block,
          with the router events behind them. Phase 1 reads Pendle&rsquo;s routers: a transfer, or a call that skips
          them, shows as a move outside the routers.
        </>
      }
      glossary={GLOSSARY}
      howItWorks={[
        "A Pendle market splits a yield-bearing token into PT, which redeems for one unit of the asset at maturity, and YT, which collects the yield until then.",
        "Each market's pool trades PT against SY, and the price of PT gives the market's implied APY.",
        "Rails values PT, YT and LP at Pendle's oracle, a 15-minute average, where the market's oracle is ready, and at RouterStatic's spot rate where it is not, then in the asset at the SY's exchange rate.",
        "The protocol behind each yield token is a Rails label: the chain does not name it.",
      ]}
      views={[
        {
          heading: "Markets",
          body: "Every market the routers have named, grouped by the protocol behind its yield token, live markets first. A market's page shows its implied APY, pool, marks and latest router events.",
        },
        {
          heading: "Wallet and position pages",
          body: "A wallet's page lists one card per market. A position's page shows its value, fixed APY at entry against the implied APY now, its maturity, its lifetime flows by leg and its router events.",
        },
      ]}
      notCovered="Arbitrum, Base and the other chains Pendle runs on are not read yet, and PT, YT and LP transfers wait on the next phase."
      docs={{ label: "Pendle documentation", href: "https://docs.pendle.finance" }}
    />
  );
}
