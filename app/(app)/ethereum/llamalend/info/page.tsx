// About this explorer — LlamaLend on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Curve's official
// documentation (rails-ops reference/official-docs/llamalend.md).

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { CRVUSD_FEE_SPLITTER, LLAMALEND_ADDRESSES } from "@/lib/llamalend/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
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
      "A market lends one borrowed token against one collateral token. Its risk, including bad debt, stays inside that market.",
    sources: [
      { label: "Overview", href: DOCS + "/overview" },
      { label: "Bad debt", href: DOCS + "/bad-debt" },
    ],
  },
  {
    term: "LLAMMA",
    definition:
      "LLAMMA is the automated market maker (AMM) that holds a position's collateral. It converts the collateral to the borrowed token and back as the price moves.",
    sources: [{ label: "FAQ glossary", href: FAQ + "#glossary" }],
  },
  {
    term: "Arbitrageur",
    definition:
      "A trader who profits from price gaps between the AMM and the wider market. In LlamaLend, arbitrageurs are paid to make each conversion of a position's collateral.",
    sources: [
      {
        label: "Understanding health",
        href: DOCS + "/liquidation-protection/how-it-works#understanding-health-your-safety-measurement",
      },
    ],
  },
  {
    term: "Band",
    definition:
      "A band is a narrow price range in the AMM. A position's collateral sits across several adjacent bands, which are fixed when the loan opens.",
    sources: [{ label: "What are bands", href: FAQ + "#what-are-bands" }],
  },
  {
    term: "Soft-liquidation",
    definition:
      "Soft-liquidation is the state of a position while the price is inside its bands and the AMM is converting its collateral. The loan stays open. Curve's documentation calls this liquidation protection.",
    sources: [{ label: "Liquidation protection", href: PROTECTION + "#the-simple-idea" }],
  },
  {
    term: "Hard liquidation",
    definition:
      "Hard liquidation closes a position whose health is below 0. Anyone may then repay its debt and take what the position holds.",
    sources: [{ label: "When am I liquidated", href: FAQ + "#when-am-i-liquidated-health--0" }],
  },
  {
    term: "Health",
    definition:
      "Health measures how much buffer a position has before hard liquidation. Falling prices, conversion losses and interest all lower it.",
    sources: [{ label: "Understanding health", href: PROTECTION + "#understanding-health-your-safety-measurement" }],
  },
  {
    term: "Mint market",
    definition:
      "A mint market creates the borrowed crvUSD when a loan opens. Its interest rate follows the price of crvUSD and the size of the Peg Stabilization Reserve.",
    sources: [{ label: "Mint markets", href: DOCS + "/borrowing#mint-markets" }],
  },
  {
    term: "Lend market",
    definition:
      "A lend market pays out the borrowed token from lenders' deposits. Its interest rate rises as a larger share of those deposits is lent.",
    sources: [{ label: "Lend market rates", href: DOCS + "/borrowing#lend-market-rates" }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one position, which is one borrower in one market.</li>
        <li>A row shows the position&apos;s collateral, its debt and its market.</li>
        <li>
          A row is marked In soft-liquidation while the AMM holds part of the position&apos;s collateral converted into
          the borrowed token.
        </li>
        <li>
          A row is marked Liquidatable when its health is below 0, and Closed or Liquidated once the position has ended.
        </li>
      </ul>
    ),
  },
  {
    heading: "Position page",
    body: (
      <ul className={UL}>
        <li>
          The top card shows the collateral, the debt and the health as read from the chain now, together with the
          amount the AMM has converted and the position&apos;s bands.
        </li>
        <li>A chart traces the position&apos;s collateral and debt over its life.</li>
        <li>The timeline lists each event on the position, newest first.</li>
      </ul>
    ),
  },
  {
    heading: "Markets page",
    body: (
      <p>
        The markets page lists every market by version, with its debt, borrow rate, utilisation, A, loan discount and
        number of loans. Each market opens its own page, with its supplied and available amounts, both rates, its rate
        curve where the policy has one, and its terms.{" "}
        <Link href="/ethereum/llamalend/markets" className={INLINE_LINK}>
          See every market
        </Link>
        .
      </p>
    ),
  },
];

const ext = (address: string, label: string) => (
  <a
    href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
    target="_blank"
    rel="noopener noreferrer"
    className="link-external"
  >
    {label}
  </a>
);

const reads: InfoReads = {
  contracts: [
    {
      name: "OneWayLendingFactory",
      address: LLAMALEND_ADDRESSES.ONEWAY_FACTORY,
      reads: "the V1 lend markets: each one's controller, AMM, tokens and vault.",
    },
    {
      name: "crvUSD ControllerFactory",
      address: LLAMALEND_ADDRESSES.CRVUSD_FACTORY,
      reads: "the V1 mint markets and each one's debt ceiling.",
    },
    {
      name: "LlamaLend V2 Factory",
      address: LLAMALEND_ADDRESSES.V2_FACTORY,
      reads: "the V2 markets; each entry's addresses are told apart by asking each one what it is.",
    },
    {
      name: "Each market's contracts",
      reads:
        "the controller's debt, loans and two discounts; the AMM's band width, oracle price and the rate it charges; the monetary policy's rate and its bounds; a lend market vault's rate for lenders.",
    },
  ],
  how: "The markets page and each market's page read these contracts at most every ten minutes, through Rails's server where it answers. Position histories come from Rails's server store of LlamaLend's events.",
  notes: [
    <>
      The V1 lend markets wired to the rate policy {ext("0x066a89bdf4efb6ad58427d278f16b7a2c53c3cee", "0x066a…3cee")}{" "}
      charge a rate that follows time alone: it started at 10% a year on 25 May 2026 and rises about 90 points a year,
      whatever the utilisation. Their pages say so in place of a rate curve.
    </>,
    <>
      A mint market sends its interest to the crvUSD ControllerFactory&apos;s fee receiver, a splitter (
      {ext(CRVUSD_FEE_SPLITTER, "0x2dfd…64f2")}) that pays the scrvUSD savings vault and the DAO&apos;s fee collector,
      which distributes to veCRV holders.
    </>,
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="llamalend"
      tracks={
        <>
          The Rails LlamaLend explorer shows every position in Curve&apos;s LlamaLend markets on Ethereum, whether still
          open or closed, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/llamalend/markets" className={INLINE_LINK}>
            the markets
          </Link>{" "}
          themselves, with their collateral, their debt and their terms.
        </>
      }
      notCovered="LlamaLend markets on other chains aren't covered here."
      glossary={glossary}
      howItWorks={[
        "A LlamaLend position is a loan. A borrower locks collateral, an asset that backs the loan, and borrows another token against it. The debt is what the borrower owes.",
        <>
          LlamaLend liquidates in two steps. First comes{" "}
          <GlossaryLink term="Soft-liquidation">soft-liquidation</GlossaryLink>: as the collateral&apos;s price falls,
          the position&apos;s collateral is converted gradually across a range of prices, and the loan stays open. Last
          comes <GlossaryLink term="Hard liquidation">hard liquidation</GlossaryLink>, which closes the position.
        </>,
        <>
          When the price falls into the position&apos;s <GlossaryLink term="Band">bands</GlossaryLink>, the{" "}
          <GlossaryLink term="LLAMMA">AMM</GlossaryLink> (automated market maker) converts the collateral to the
          borrowed token a little at a time. When the price rises, the AMM buys the collateral back.
        </>,
        <>
          The conversion reverses, but the losses do not. <GlossaryLink term="Arbitrageur">Arbitrageurs</GlossaryLink>{" "}
          are paid to make each conversion, so the collateral is sold below the market price and bought back above it.
          Each round trip, a price fall followed by a recovery, leaves the position with less collateral value, so its
          health can fall while the price rises.
        </>,
        <>
          Health, the position&apos;s buffer before that last step, can fall for three reasons: falling prices,
          conversion losses and interest. When a position&apos;s <GlossaryLink term="Health">health</GlossaryLink> falls
          below 0, hard liquidation applies: anyone may repay the position&apos;s debt and take what it holds.
        </>,
      ]}
      reads={reads}
      views={views}
      search="You can search by borrower address. The listing filters by status, liquidated before, debt size, collateral size and transactions, and sorts by recent activity, debt or collateral."
      docs={{ label: "LlamaLend documentation", href: DOCS + "/overview" }}
    />
  );
}
