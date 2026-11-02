// About this explorer — LlamaLend on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Curve's official
// documentation (rails-ops reference/official-docs/llamalend.md).

import Link from "next/link";
import { ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("llamalend");

const DOCS = "https://docs.curve.finance/user/llamalend";
const PROTECTION = `${DOCS}/liquidation-protection/how-it-works`;
const FAQ = `${DOCS}/faq`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Isolated market",
    definition:
      "A market with one collateral token and one borrowed token. Its risk, including bad debt, stays inside it.",
    sources: [
      { label: "Overview", href: DOCS + "/overview" },
      { label: "Bad debt", href: DOCS + "/bad-debt" },
    ],
  },
  {
    term: "LLAMMA",
    definition:
      "The AMM that holds a position's collateral and converts it between the collateral and borrowed tokens as the price moves.",
    sources: [{ label: "FAQ glossary", href: FAQ + "#glossary" }],
  },
  {
    term: "Band",
    definition:
      "A narrow price range in the AMM. A position's collateral sits across several adjacent bands, fixed when the loan opens.",
    sources: [{ label: "What are bands", href: FAQ + "#what-are-bands" }],
  },
  {
    term: "Soft-liquidation",
    definition:
      "The state of a position while the price is inside its bands and the AMM is converting its collateral. The loan stays open. Curve's documentation calls it liquidation protection.",
    sources: [{ label: "Liquidation protection", href: PROTECTION + "#the-simple-idea" }],
  },
  {
    term: "Hard liquidation",
    definition: "Closing a position whose health is below 0: anyone may repay its debt and take what it holds.",
    sources: [{ label: "When am I liquidated", href: FAQ + "#when-am-i-liquidated-health--0" }],
  },
  {
    term: "Health",
    definition:
      "How much buffer a position has before hard liquidation. Price falls, conversion losses and interest lower it.",
    sources: [{ label: "Understanding health", href: PROTECTION + "#understanding-health-your-safety-measurement" }],
  },
  {
    term: "Mint market",
    definition:
      "A market where the borrowed crvUSD is minted against the loan. Its rate follows crvUSD's price and the Peg Stabilization Reserve.",
    sources: [{ label: "Mint markets", href: DOCS + "/borrowing#mint-markets" }],
  },
  {
    term: "Lend market",
    definition:
      "A market where the borrowed token comes from lenders' deposits. Its rate rises with the share of those deposits that is lent.",
    sources: [{ label: "Lend market rates", href: DOCS + "/borrowing#lend-market-rates" }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <>
        <ul className={UL}>
          <li>One row per position: a borrower in one market.</li>
          <li>Each row shows the collateral, the debt, and the market.</li>
          <li>A row is marked In soft-liquidation while the AMM holds part of its collateral converted.</li>
          <li>A row is marked Liquidatable when its health is below 0, and Closed or Liquidated once it ends.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Position page",
    body: (
      <ul className={UL}>
        <li>
          The top card shows collateral, debt and health read from the chain now, with the amount converted and the
          bands.
        </li>
        <li>A chart traces the position&apos;s collateral and debt over its life.</li>
        <li>The timeline lists each event on the position, newest first.</li>
      </ul>
    ),
  },
  {
    heading: "Markets",
    body: (
      <p>
        Every market with its collateral, borrowed token, debt, loans and terms.{" "}
        <Link href="/ethereum/llamalend/markets" className={INLINE_LINK}>
          See every market
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="llamalend"
      name="LlamaLend"
      tracks="Every position in Curve's LlamaLend markets on Ethereum, open or closed, with its history, and the markets themselves. Other chains are not covered."
      glossary={glossary}
      howItWorks={[
        "Liquidation is a range of prices rather than one price. A position can sit in soft-liquidation without being closed.",
        "Soft-liquidation: when the price falls into the position's bands, the AMM converts its collateral to the borrowed token a little at a time. When the price rises, it buys the collateral back.",
        "The swap reverses and the losses do not. Arbitrageurs are paid to make each conversion, so collateral is sold below the market price and bought back above it. Each round trip leaves the position with less collateral value, and health can fall while the price rises.",
        "Hard liquidation: when the position's health is below 0, anyone may repay its debt and take what it holds.",
      ]}
      views={views}
      search="Search takes a borrower address. Filters: status, liquidated before, debt and collateral size, transactions. Sort: recent activity, debt, collateral."
      docs={{ label: "LlamaLend documentation", href: DOCS + "/overview" }}
    />
  );
}
