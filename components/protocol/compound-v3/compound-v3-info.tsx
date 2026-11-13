// The Compound V3 /info page for its three routes (Ethereum, Base, Arbitrum), drawn on the
// typed template (rails-ops standards/info-page-template.md). One component so the routes
// share the glossary and the page's shape; what differs per chain is the markets, the listing
// and the market view, each stated from that chain's roster (lib/compound*/asset-catalog.ts).
// Optimism's info page (app/(app)/optimism/compound-v3/info) takes the glossary and the
// "how it works" items from here.

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReadContract,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { cometDeploymentOf } from "@/lib/compound/deployments";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

const DOCS = "https://docs.compound.xyz";
const BORROWING = `${DOCS}/collateral-and-borrowing/`;
const LIQUIDATION = `${DOCS}/liquidation/`;

export type CompoundV3InfoDeployment = "ethereum" | "base" | "arbitrum";

const SEARCH_0 =
  "You can search by wallet address. The listing filters by Status (open, closed or liquidated), Market, Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, borrow balance or collateral.";
const SEARCH_1 =
  "You can search by wallet address. The listing filters by Status (open, closed or liquidated), Market, Debt and Collateral by size in US dollars, History (liquidated before) and Transactions, and sorts by recent activity, borrow balance or collateral.";
const SEARCH_2 =
  "You can search by wallet address, which finds the wallets already read. To read any other wallet, enter it on the protocol page. The listing filters by Debt, Collateral and Transactions, and sorts by last activity, last opened, collateral or debt.";

export const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
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
      "Collateral is a token a wallet supplies to back its borrowing. Each collateral asset has a borrow collateral factor (Borrow CF), the percentage of its value that can be borrowed. The collateral earns no interest.",
    sources: [{ label: "Collateral and borrowing", href: `${BORROWING}#collateral--borrowing` }],
  },
  {
    term: "Interest rate",
    definition:
      "Supplying the base asset earns the supply rate and borrowing it costs the borrow rate. Both rise as more of the base asset is lent out, and interest accrues every second. Rails shows each a year without compounding, as the docs' Supply APR and Borrow APR.",
    sources: [{ label: "Interest rates", href: `${DOCS}/interest-rates/#interest-rates` }],
  },
  {
    term: "Liquidation",
    definition:
      "A wallet becomes liquidatable when its debt exceeds what its collateral covers. That is measured with the liquidation collateral factors (Liquidation CF), the percentages of each collateral asset's value that can be borrowed before an account is liquidatable. They are higher than the borrow collateral factors, which set its borrowing capacity.",
    sources: [{ label: "Liquidatable accounts", href: `${LIQUIDATION}#liquidatable-accounts` }],
  },
  {
    term: "Absorb",
    definition:
      "Absorb is the function that liquidates an account. Any address can call it on a liquidatable account, and the Comet then takes over the account's debt and collateral. The borrower is paid the collateral's value minus a penalty, in the base asset: each asset's liquidation factor is the share paid.",
    sources: [{ label: "Absorb", href: `${LIQUIDATION}#absorb` }],
  },
  {
    term: "Reserves",
    definition:
      "Reserves are a balance of the base or collateral asset that a market's protocol holds to protect users from bad debt. A liquidation adds the seized collateral to the protocol's holdings.",
    sources: [{ label: "Reserves", href: `${LIQUIDATION}#reserves` }],
  },
];

export const WHAT_IT_IS = (
  <>
    Compound V3, which Compound&apos;s docs call Compound III, is a lending protocol. People supply crypto to earn
    interest, or supply <GlossaryLink term="Collateral">collateral</GlossaryLink> and borrow against it. On this page an
    account is the balances one wallet (an address that holds crypto) has in one market.
  </>
);

export const ONE_BASE_ASSET = (
  <>
    Each market is a smart contract called a <GlossaryLink term="Comet">Comet</GlossaryLink>, with one{" "}
    <GlossaryLink term="Base asset">base asset</GlossaryLink>. Suppliers of the base asset earn interest, and borrowers
    draw the base asset alone.
  </>
);

export const INTEREST = (
  <>
    The <GlossaryLink term="Interest rate">interest rate</GlossaryLink> on supplying and on borrowing rises as more of
    the base asset is lent out. Each market sets its own rates.
  </>
);

export const LIQUIDATION_ITEM = (
  <>
    When an account&apos;s debt passes what its collateral covers, anyone can trigger its{" "}
    <GlossaryLink term="Liquidation">liquidation</GlossaryLink>, and the market takes over its debt and collateral. The
    step is the Comet&apos;s <GlossaryLink term="Absorb">absorb</GlossaryLink> function. The market pays the borrower
    the collateral&apos;s value minus a penalty, from its <GlossaryLink term="Reserves">reserves</GlossaryLink>.
  </>
);

// Slot 2a (decision 0059 point 6): the contracts the markets pages and
// position pages read, and the roster facts that left the markets page.
const CONFIGURATOR: Record<CompoundV3InfoDeployment, string> = {
  ethereum: "0x316f9708bb98af7da9c68c1c3b5e79039cd336e3",
  base: "0x45939657d1ca34a8fa39a924b71d28fe8431e581",
  arbitrum: "0xb21b06d71c75973babde35b49ffdac3f82ad3775",
};

const ROSTER_NOTE: Record<CompoundV3InfoDeployment, string> = {
  ethereum:
    "No contract lists a chain's Comets, so the roster is stated: the three Ethereum markets Rails indexes, of the seven Compound's docs list.",
  base: "No contract lists a chain's Comets, so the roster is stated. A name will not settle it on Base: four different contracts answer to cUSDCv3 and one of them is Compound's. The five markets here are the ones Compound's Configurator deployed.",
  arbitrum:
    "No contract lists a chain's Comets, so the roster is stated: the four in Compound's own deployment records for Arbitrum, each answering to the same governor on chain.",
};

function readsFor(deployment: CompoundV3InfoDeployment): InfoReads {
  const [first, ...rest] = cometDeploymentOf(deployment).markets;
  const comets: [InfoReadContract, ...InfoReadContract[]] = [
    {
      name: `${first.label} (Comet)`,
      address: first.comet,
      reads:
        "its supply and borrowing, utilization, both rates and their kinks, reserves and their target, minimum borrow, and each collateral asset's factors, supply cap and total; for a wallet, its balance in the base asset and each collateral.",
    },
    ...rest.map((m) => ({ name: `${m.label} (Comet)`, address: m.comet, reads: `the same as ${first.label}.` })),
  ];
  return {
    contracts: [
      ...comets,
      {
        name: "Configurator",
        address: CONFIGURATOR[deployment],
        reads:
          deployment === "base"
            ? "the contract that deployed the five markets and through which governance sets their terms. Rails takes the markets it deployed as the roster, and reads each market's terms from its Comet."
            : "the contract through which governance sets each market's terms. Rails reads those terms from each Comet.",
      },
      {
        name: "Each asset's price feed",
        reads:
          "the Comet names one feed for its base asset and one for each collateral asset. Rails asks the Comet for each feed's price, the price its liquidations use. The WETH market prices in ETH.",
      },
    ],
    how:
      deployment === "arbitrum"
        ? "The markets pages read every Comet from the chain at most every ten minutes, and an account page reads the wallet's market at each load."
        : "The markets pages read every Comet through Rails's server at most every ten minutes, and an account page reads the wallet's market at each load.",
    notes: [ROSTER_NOTE[deployment]],
  };
}

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
            The Rails Compound V3 explorer shows every account in three of Compound V3&apos;s Ethereum markets, those
            lending USDC, WETH and USDT, whether still open, closed or liquidated, and the full history of each one. It
            also shows{" "}
            <Link href="/ethereum/compound-v3/markets" className={INLINE_LINK}>
              the markets
            </Link>{" "}
            themselves, with their interest rates and reserves.
          </>
        }
        glossary={GLOSSARY}
        reads={readsFor("ethereum")}
        howItWorks={[
          WHAT_IT_IS,
          <>
            Compound&apos;s docs list seven markets on Ethereum; Rails reads three, with USDC, WETH and USDT as their
            base assets. {ONE_BASE_ASSET}
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
            heading: "Account page",
            body: (
              <ul className={UL}>
                <li>
                  The top card shows what the account supplied or borrowed and the collateral it locked, with the
                  market&apos;s reading of whether the account is liquidatable, read now from the market&apos;s
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
            <Link href="/base/compound-v3/markets" className={INLINE_LINK}>
              the markets
            </Link>{" "}
            themselves, with their interest rates and reserves.
          </>
        }
        glossary={GLOSSARY}
        reads={readsFor("base")}
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
                  noun="account"
                />
              </>
            ),
          },
          {
            heading: "Account page",
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
            "/base/compound-v3/markets",
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
      reads={readsFor("arbitrum")}
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
                    accounts listing
                  </Link>{" "}
                  holds the open accounts.
                </li>
              </ul>
              <p className="mt-1.5">{SEARCH_2}</p>
            </>
          ),
        },
        {
          heading: "Account page",
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
