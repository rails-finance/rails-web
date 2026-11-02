// The Compound V3 /info page for its three routes (Ethereum, Base, Arbitrum), drawn on the
// typed template (rails-ops standards/info-page-template.md). One component so the routes
// share the glossary and the page's shape; what differs per chain is the markets, the listing
// and the market view, each stated from that chain's roster (lib/compound*/asset-catalog.ts).

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

const DOCS = "https://docs.compound.xyz";
const BORROWING = `${DOCS}/collateral-and-borrowing/`;
const LIQUIDATION = `${DOCS}/liquidation/`;

export type CompoundV3InfoDeployment = "ethereum" | "base" | "arbitrum";

const SEARCH_0 =
  "You can search by wallet address. The listing filters by Status (open, closed or liquidated), Market, Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, debt or collateral.";
const SEARCH_1 =
  "You can search by wallet address. The listing filters by Status (open, closed or liquidated), Market, Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, debt or collateral.";
const SEARCH_2 =
  "You can search by wallet address, which finds the wallets already read. To read any other wallet, enter it on the protocol page. The listing filters by Debt, Collateral and Transactions, and sorts by last activity, last opened, collateral or debt.";

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Comet",
    definition:
      "A Comet is the smart contract of one Compound V3 market. It holds one base asset and a list of collateral assets, and shares nothing with any other Comet.",
    sources: [
      { label: "Introduction", href: `${DOCS}/#introduction` },
      { label: "Collateral and borrowing", href: BORROWING },
    ],
  },
  {
    term: "Base asset",
    definition:
      "The base asset is the one token a Comet lends out and borrows. A wallet's balance in it is positive if the wallet has supplied and negative if it owes.",
    sources: [
      { label: "Introduction", href: `${DOCS}/#introduction` },
      { label: "Supply", href: `${BORROWING}#supply` },
    ],
  },
  {
    term: "Collateral",
    definition:
      "Collateral is a token a wallet deposits to back its borrowing. Each collateral asset has a factor, the percentage of its value that counts toward borrowing. The collateral earns no interest.",
    sources: [{ label: "Collateral and borrowing", href: `${BORROWING}#collateral--borrowing` }],
  },
  {
    term: "Interest rate",
    definition:
      "Supplying the base asset earns the supply rate and borrowing it costs the borrow rate. Both rise as more of the base asset is lent out, and interest builds up every second.",
    sources: [{ label: "Interest rates", href: `${DOCS}/interest-rates/#interest-rates` }],
  },
  {
    term: "Liquidation",
    definition:
      "A wallet becomes liquidatable when its debt exceeds what its collateral covers. That is measured with the liquidation factors, the percentages of each collateral asset's value that count toward staying safe. They are higher than the borrowing factors, which limit how much a wallet can borrow.",
    sources: [{ label: "Liquidatable accounts", href: `${LIQUIDATION}#liquidatable-accounts` }],
  },
  {
    term: "Absorb",
    definition:
      "Absorbing is the liquidation step. Any address can absorb a liquidatable account, and the Comet then takes over the account's debt and collateral. The borrower is paid the collateral's value minus a penalty, in the base asset.",
    sources: [{ label: "Absorb", href: `${LIQUIDATION}#absorb` }],
  },
  {
    term: "Reserves",
    definition:
      "Reserves are a balance of the base or collateral asset that a market's protocol holds to protect users from bad debt. A liquidation adds the seized collateral to the protocol's holdings.",
    sources: [{ label: "Reserves", href: `${LIQUIDATION}#reserves` }],
  },
];

const WHAT_IT_IS = (
  <>
    Compound V3 is a lending protocol. People supply crypto to earn interest, or deposit{" "}
    <GlossaryLink term="Collateral">collateral</GlossaryLink> and borrow against it. On this page an account is the
    balances one wallet (an address that holds crypto) has in one market.
  </>
);

const ONE_BASE_ASSET = (
  <>
    Each market is a smart contract called a <GlossaryLink term="Comet">Comet</GlossaryLink>, with one{" "}
    <GlossaryLink term="Base asset">base asset</GlossaryLink>. Suppliers of the base asset earn interest, and borrowers
    draw the base asset alone.
  </>
);

const INTEREST = (
  <>
    The <GlossaryLink term="Interest rate">interest rate</GlossaryLink> on supplying and on borrowing rises as more of
    the base asset is lent out. Each market sets its own rates.
  </>
);

const LIQUIDATION_ITEM = (
  <>
    When an account&apos;s debt passes what its collateral covers, anyone can trigger its{" "}
    <GlossaryLink term="Liquidation">liquidation</GlossaryLink>, and the market takes over its debt and collateral.
    Compound calls this step <GlossaryLink term="Absorb">absorbing</GlossaryLink>. The market pays the borrower the
    collateral&apos;s value minus a penalty, from its <GlossaryLink term="Reserves">reserves</GlossaryLink>.
  </>
);

function marketsView(href: string, body: string): InfoView {
  return {
    heading: "Market view",
    body: (
      <p>
        {body} Open{" "}
        <Link href={href} className={INLINE_LINK}>
          the market view
        </Link>{" "}
        to see them.
      </p>
    ),
  };
}

export function CompoundV3InfoPage({ deployment }: { deployment: CompoundV3InfoDeployment }) {
  const docs = { label: "Compound III documentation", href: `${DOCS}/` };

  if (deployment === "ethereum") {
    return (
      <ProtocolInfoPage
        session="compound"
        tracks={
          <>
            The Rails Compound V3 explorer shows every account in Compound V3&apos;s three Ethereum markets, whether
            still open, closed or liquidated, and the full history of each one. It also shows{" "}
            <Link href="/ethereum/compound-v3/markets" className={INLINE_LINK}>
              the markets
            </Link>{" "}
            themselves, with their interest rates and reserves.
          </>
        }
        glossary={GLOSSARY}
        howItWorks={[
          WHAT_IT_IS,
          <>Ethereum has three markets, with USDC, WETH and USDT as their base assets. {ONE_BASE_ASSET}</>,
          INTEREST,
          LIQUIDATION_ITEM,
        ]}
        views={[
          {
            heading: "Listing",
            body: (
              <>
                <ul className={UL}>
                  <li>
                    Each row shows one account: the wallet, its market, what it supplied or borrowed and its collateral.
                  </li>
                  <li>
                    Dollar values use each market&apos;s own prices, the same prices the market uses for liquidation.
                  </li>
                  <li>
                    The listing shows open accounts by default. Searching for a wallet shows its accounts of every
                    status.
                  </li>
                </ul>
                <p className="mt-1.5">{SEARCH_0}</p>
              </>
            ),
          },
          {
            heading: "Position page",
            body: (
              <ul className={UL}>
                <li>
                  The top card shows what the account supplied or borrowed and the collateral it locked, with the
                  market&apos;s own reading of whether the account is liquidatable, read now from the market&apos;s
                  contract.
                </li>
                <li>The timeline lists the account&apos;s events, newest first.</li>
              </ul>
            ),
          },
          marketsView(
            "/ethereum/compound-v3/markets",
            "The market view shows each market with its base asset, collateral assets, interest rates and reserves.",
          ),
        ]}
        docs={docs}
      />
    );
  }

  if (deployment === "base") {
    return (
      <ProtocolInfoPage
        session="compound-base"
        tracks={
          <>
            The Rails Compound V3 explorer shows the accounts in Compound V3&apos;s five Base markets, whether still
            open or closed, and the full history of each one. It also shows{" "}
            <Link href="/base/compound-v3/market" className={INLINE_LINK}>
              the markets
            </Link>{" "}
            themselves, with their interest rates and reserves.
          </>
        }
        glossary={GLOSSARY}
        howItWorks={[
          WHAT_IT_IS,
          <>
            Base has five markets, with USDC, WETH, USDS, AERO and USDbC as their base assets. {ONE_BASE_ASSET} The Base
            markets are separate from the Ethereum markets of the same names.
          </>,
          INTEREST,
          LIQUIDATION_ITEM,
        ]}
        views={[
          {
            heading: "Listing",
            body: (
              <>
                <ul className={UL}>
                  <li>
                    Each row shows one account: the wallet, its market, what it supplied or borrowed and its collateral.
                  </li>
                  <li>
                    Every figure is read from the market&apos;s contract at the block the row names, with dollar values
                    from the prices the market uses for liquidation.
                  </li>
                  <li>
                    The listing shows open accounts by default. Searching for a wallet shows its accounts of every
                    status.
                  </li>
                </ul>
                <p className="mt-1.5">{SEARCH_1}</p>
                <BaseLendingCoverageNote
                  route="/api/compound-base/coverage"
                  unreadListed={false}
                  subject="these five markets"
                  subjectPossessive="the earliest market’s"
                  noun="position"
                />
              </>
            ),
          },
          {
            heading: "Position page",
            body: (
              <ul className={UL}>
                <li>The top card shows the account&apos;s balances in one market, read from its contract.</li>
                <li>
                  The wallet&apos;s own page holds one card for each market the wallet has used, and the timeline lists
                  its events, newest first.
                </li>
              </ul>
            ),
          },
          marketsView(
            "/base/compound-v3/market",
            "The market view shows each Base market with its base asset, collateral assets, interest rates and reserves.",
          ),
        ]}
        docs={docs}
      />
    );
  }

  return (
    <ProtocolInfoPage
      session="compound-v3-arbitrum"
      tracks={
        <>
          The Rails Compound V3 explorer shows the accounts on Arbitrum that Rails has read, with the full history of
          each one, and a wallet appears once someone opens it. It also shows{" "}
          <Link href="/arbitrum/compound-v3/markets" className={INLINE_LINK}>
            the four markets
          </Link>
          , with their interest rates and reserves.
        </>
      }
      glossary={GLOSSARY}
      howItWorks={[
        WHAT_IT_IS,
        <>
          Arbitrum has four markets, with USDC, USDC.e, USD₮0 and WETH as their base assets. {ONE_BASE_ASSET} The
          Arbitrum markets are separate from the Ethereum and Base markets of the same names.
        </>,
        INTEREST,
        LIQUIDATION_ITEM,
        "The WETH market prices in ETH, so its dollar figures convert at the WETH price from the USDC market.",
      ]}
      views={[
        {
          heading: "Listing",
          body: (
            <>
              <ul className={UL}>
                <li>
                  Each card shows one wallet&apos;s account in one market, with its supply, borrowing and collateral.
                </li>
                <li>
                  The listing draws on each day&apos;s most active wallets and any wallet a reader has opened. The{" "}
                  <Link href="/arbitrum/compound-v3/positions" className={INLINE_LINK}>
                    positions listing
                  </Link>{" "}
                  holds the open accounts.
                </li>
              </ul>
              <p className="mt-1.5">{SEARCH_2}</p>
            </>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The wallet&apos;s page holds one card for each market the wallet has used, with its figures read at one
                block.
              </li>
              <li>Opening a card shows that market&apos;s account and its timeline of events.</li>
            </ul>
          ),
        },
        marketsView(
          "/arbitrum/compound-v3/markets",
          "The market view shows each Arbitrum market with its base asset, collateral assets, interest rates and reserves.",
        ),
      ]}
      docs={docs}
    />
  );
}
