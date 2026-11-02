// The Aave V3 /info page for its three routes (Ethereum, Base, Arbitrum), drawn on the
// typed template (rails-ops standards/info-page-template.md). One component so the routes
// share the glossary (content/aave-v3/event-prose.yaml) and the page's shape; what differs
// per chain is the markets, the listing and the market view.

import Link from "next/link";
import { ProtocolInfoPage, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { aaveV3Glossary } from "@/lib/aave-v3/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

export type AaveV3InfoDeployment = "ethereum" | "base" | "arbitrum";

const ONE_HEALTH_FACTOR =
  "Within a market, everything a wallet supplies as collateral backs everything it owes, under one health factor.";

const PRICES = "Dollar values use Aave's own prices, the same ones it liquidates with.";

const POSITION_PAGE: InfoView = {
  heading: "Position page",
  body: (
    <ul className={UL}>
      <li>The top card shows what the wallet supplied, what it owes and its health factor, read from the Pool now.</li>
      <li>The timeline lists each event of the account, newest first.</li>
    </ul>
  ),
};

function marketView(href: string, body: string, linkText: string): InfoView {
  return {
    heading: "Market view",
    body: (
      <p>
        {body}{" "}
        <Link href={href} className={INLINE_LINK}>
          {linkText}
        </Link>
        .
      </p>
    ),
  };
}

export function AaveV3InfoPage({ deployment }: { deployment: AaveV3InfoDeployment }) {
  const docs = { label: "Aave V3 documentation", href: "https://aave.com/docs/aave-v3/overview" };
  if (deployment === "ethereum") {
    return (
      <ProtocolInfoPage
        session="aave-v3"
        name="Aave V3"
        tracks="Every Aave V3 account on Ethereum, open or closed, with its history, across the Core, Prime and EtherFi markets. The market view shows Core's reserves only."
        glossary={aaveV3Glossary()}
        howItWorks={[
          "Ethereum has three separate markets: Core, Prime and EtherFi. Each is its own pool with its own reserves, risk settings and prices.",
          "A wallet's account in each market is separate. A wallet that uses two markets appears on two rows.",
          ONE_HEALTH_FACTOR,
          PRICES,
        ]}
        search="Search takes a wallet address. Filters: status, market, debt and collateral size, liquidated before, transactions. Sort: recent activity, debt, collateral."
        views={[
          {
            heading: "Listing",
            body: (
              <ul className={UL}>
                <li>One card per wallet and market: what it supplied, what it owes and its health factor.</li>
                <li>Open accounts show by default. Searching a wallet shows every status.</li>
              </ul>
            ),
          },
          POSITION_PAGE,
          marketView(
            "/ethereum/aave-v3/market",
            "Core's reserves, with each asset's size, rates, risk settings and price.",
            "See the Core market",
          ),
        ]}
        docs={docs}
      />
    );
  }
  const base = deployment === "base";
  const chain = base ? "Base" : "Arbitrum";
  const route = base ? "/base/aave-v3" : "/arbitrum/aave-v3";
  return (
    <ProtocolInfoPage
      session={base ? "aave-v3-base" : "aave-v3-arbitrum"}
      name="Aave V3"
      tracks={
        base
          ? "Every account on Aave V3's Base market, open or closed, with its history, and the market's reserves."
          : "The Aave V3 accounts on Arbitrum that Rails has read, with their history, and the market's reserves. Other wallets appear once someone opens them."
      }
      glossary={aaveV3Glossary()}
      howItWorks={[
        `${chain} has one market, its own pool. Its reserves, risk settings and prices are separate from Aave V3 on Ethereum.`,
        ONE_HEALTH_FACTOR,
        base
          ? "Dollar values use the pool's prices at the block the row names, the same prices it liquidates with."
          : PRICES,
      ]}
      search={
        base
          ? "Search takes a wallet address. Filters: status, debt and collateral size, liquidated before, transactions. Sort: recent activity, debt, collateral."
          : "Search takes a wallet address and finds the wallets already read. Enter any other wallet on the protocol page to read it. Filters: debt and collateral size, transactions. Sort: last activity, last opened, collateral, debt."
      }
      views={[
        base
          ? {
              heading: "Listing",
              body: (
                <>
                  <ul className={UL}>
                    <li>One card per wallet: what it supplied, what it owes and its health factor.</li>
                    <li>Open accounts show by default. Searching a wallet shows every status.</li>
                  </ul>
                  <BaseLendingCoverageNote route="/api/aave-v3-base/coverage" restsOnOpen />
                </>
              ),
            }
          : {
              heading: "Listing",
              body: (
                <ul className={UL}>
                  <li>One card per open wallet: what it supplied, what it owes and its health factor.</li>
                  <li>
                    The wallets come from each day&apos;s most active wallets and any wallet a reader opened. The footer
                    says how many positions are read.
                  </li>
                </ul>
              ),
            },
        POSITION_PAGE,
        marketView(
          base ? "/base/aave-v3/market" : "/arbitrum/aave-v3/markets",
          `The ${chain} market's reserves, with each asset's size, rates, risk settings and price.`,
          `See the ${chain} market`,
        ),
      ]}
      docs={docs}
    />
  );
}
