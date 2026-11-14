// The Aave V3 /info page for its three routes (Ethereum, Base, Arbitrum), drawn on the
// typed template (rails-ops standards/info-page-template.md). One component so the routes
// share the glossary (content/aave-v3/event-prose.yaml) and the page's shape; what differs
// per chain is the markets, the listing and the market view.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { aaveV3Glossary } from "@/lib/aave-v3/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

export type AaveV3InfoDeployment = "ethereum" | "base" | "arbitrum";

const WHAT_IT_IS = (
  <>
    Aave V3 is a lending protocol where people lend crypto, which Aave calls{" "}
    <GlossaryLink term="Supplied">supplying</GlossaryLink> it, and borrow other crypto against it. An account is the
    assets one wallet (an address that holds crypto) has supplied and the <GlossaryLink term="Debt">debt</GlossaryLink>{" "}
    it owes in one market.
  </>
);

const ONE_HEALTH_FACTOR = (
  <>
    All the assets in an account that count as <GlossaryLink term="Collateral">collateral</GlossaryLink> back all of its
    debt together. One <GlossaryLink term="Health factor">health factor</GlossaryLink> scores how safe the whole account
    is.
  </>
);

const PRICES = (
  <>
    Dollar values use the prices from the market&apos;s price oracle, a contract that reports asset prices.{" "}
    <GlossaryLink term="Liquidation">Liquidation</GlossaryLink> is checked with the same prices, so a price fall can
    trigger it.
  </>
);

const POSITION_PAGE: InfoView = {
  heading: "Position page",
  body: (
    <ul className={UL}>
      <li>
        The top card shows what the wallet supplied, what it owes and its health factor, read now from the market&apos;s
        pool contract, the smart contract that holds its supplied assets.
      </li>
      <li>The timeline lists the account&apos;s events, newest first.</li>
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
        </Link>{" "}
        to open it.
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
        tracks={
          <>
            The Rails Aave V3 explorer shows every account on Ethereum, whether still open or closed, across the Core,
            Prime and EtherFi markets, and the full history of each one. It also shows the reserves of{" "}
            <Link href="/ethereum/aave-v3/markets" className={INLINE_LINK}>
              the Core market
            </Link>
            , with their rates, risk settings and prices.
          </>
        }
        notCovered="The reserves of the Prime and EtherFi markets aren't covered here."
        glossary={aaveV3Glossary()}
        howItWorks={[
          WHAT_IT_IS,
          <>
            Ethereum has three separate <GlossaryLink term="Market">markets</GlossaryLink>: Core, Prime and EtherFi.
            Each is its own pool with its own <GlossaryLink term="Reserve">reserves</GlossaryLink> (one asset each),
            risk settings and prices.
          </>,
          "A wallet's account in each market is separate, so a wallet that uses two markets has two accounts.",
          ONE_HEALTH_FACTOR,
          PRICES,
        ]}
        search="You can search by wallet address. The listing filters by Status (open, closed or liquidated), Market, Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, debt or collateral."
        views={[
          {
            heading: "Listing",
            body: (
              <ul className={UL}>
                <li>
                  Each card shows one account: the wallet, its market, what it supplied, what it owes and its health
                  factor.
                </li>
                <li>
                  The listing shows open accounts by default. Searching for a wallet shows its accounts of every status.
                </li>
              </ul>
            ),
          },
          POSITION_PAGE,
          marketView(
            "/ethereum/aave-v3/markets",
            "The market view shows each Core reserve with its size, rates, risk settings and price.",
            "Use the Core market link",
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
      tracks={
        <>
          {base
            ? "The Rails Aave V3 explorer shows every account on Aave V3's Base market, whether still open or closed, and the full history of each one. It also shows the reserves of "
            : "The Rails Aave V3 explorer shows the accounts on Arbitrum that Rails has read, with the full history of each one, and a wallet appears once someone opens it. It also shows the reserves of "}
          <Link href={base ? "/base/aave-v3/markets" : "/arbitrum/aave-v3/markets"} className={INLINE_LINK}>
            the {chain} market
          </Link>
          , with their rates, risk settings and prices.
        </>
      }
      glossary={aaveV3Glossary()}
      howItWorks={[
        WHAT_IT_IS,
        <>
          {chain} has one <GlossaryLink term="Market">market</GlossaryLink>, which is its own pool. Its{" "}
          <GlossaryLink term="Reserve">reserves</GlossaryLink> (one asset each), risk settings and prices are separate
          from Aave V3 on Ethereum.
        </>,
        ONE_HEALTH_FACTOR,
        base ? (
          <>
            Dollar values use the pool&apos;s prices at the block the row names, the same prices that decide{" "}
            <GlossaryLink term="Liquidation">liquidation</GlossaryLink>.
          </>
        ) : (
          PRICES
        ),
      ]}
      search={
        base
          ? "You can search by wallet address. The listing filters by Status (open, closed or liquidated), Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, debt or collateral."
          : "You can search by wallet address, which finds the wallets already read. To read any other wallet, enter it on the protocol page. The listing filters by Debt, Collateral and Transactions, and sorts by last activity, last opened, collateral or debt."
      }
      views={[
        base
          ? {
              heading: "Listing",
              body: (
                <>
                  <ul className={UL}>
                    <li>
                      Each card shows one account: the wallet, what it supplied, what it owes and its health factor.
                    </li>
                    <li>
                      The listing shows open accounts by default. Searching for a wallet shows its accounts of every
                      status.
                    </li>
                  </ul>
                  <BaseLendingCoverageNote route="/api/aave-v3-base/coverage" restsOnOpen />
                </>
              ),
            }
          : {
              heading: "Listing",
              body: (
                <ul className={UL}>
                  <li>
                    Each card shows one open account: the wallet, what it supplied, what it owes and its health factor.
                  </li>
                  <li>
                    The listing draws on each day&apos;s most active wallets and any wallet a reader has opened. The
                    footer says how many positions have been read.
                  </li>
                </ul>
              ),
            },
        POSITION_PAGE,
        marketView(
          base ? "/base/aave-v3/markets" : "/arbitrum/aave-v3/markets",
          `The market view shows each ${chain} reserve with its size, rates, risk settings and price.`,
          `Use the ${chain} market link`,
        ),
      ]}
      docs={docs}
    />
  );
}
