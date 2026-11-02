// The Morpho Blue /info page for its three routes (Ethereum, Base, Arbitrum), drawn on the
// typed template (rails-ops standards/info-page-template.md). One component so the routes
// share the glossary and the page's shape; what differs per chain is the scope: Ethereum
// replays events, Base reads the contract at a block and has a vault layer, Arbitrum reads
// the wallets Rails has seen.

import Link from "next/link";
import type { ReactNode } from "react";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { MORPHO_ARBITRUM_MARKETS } from "@/lib/morpho-arbitrum/market-catalog";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export type MorphoInfoDeployment = "ethereum" | "base" | "arbitrum";

const UL = "list-disc space-y-1 pl-5";
const DOCS = "https://docs.morpho.org";
const BLUE = `${DOCS}/learn/concepts/blue/`;
const LTV = `${DOCS}/developers/borrow/concepts/ltv/`;
const LIQUIDATION = `${DOCS}/learn/concepts/liquidation/`;

const MARKET_TERM: InfoTerm = {
  term: "Market",
  definition:
    "A market pairs one loan token with one collateral token. It is isolated from every other market, so its risk stays inside it, and its settings never change after it is created. Borrowers pay interest at a rate the market's rate model sets.",
  sources: [
    { label: "Markets", href: `${BLUE}#what-is-a-variable-rate-market` },
    { label: "Interest rates", href: `${DOCS}/learn/concepts/irm/#understanding-borrow-and-supply-apy` },
  ],
};

const COMMON_TERMS: readonly InfoTerm[] = [
  {
    term: "Collateral",
    definition:
      "Collateral is the token a borrower locks in a market to secure a loan. It earns no interest, and it counts only toward that market.",
    sources: [{ label: "Collateral", href: `${LTV}#collateral` }],
  },
  {
    term: "LLTV",
    definition:
      "The liquidation loan-to-value (LLTV) is the largest share of the collateral's value that a borrower may owe in a market. It is both the borrow limit and the liquidation line.",
    sources: [{ label: "LLTV", href: `${LTV}#liquidation-loan-to-value-lltv` }],
  },
  {
    term: "Oracle",
    definition: "A market's oracle is the contract that prices one unit of its collateral in its loan token.",
    sources: [{ label: "Oracle", href: `${DOCS}/learn/concepts/oracle/#what-is-an-oracle` }],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation happens when a borrower owes more than the LLTV allows. A liquidator repays some or all of the debt and takes the borrower's collateral plus a bonus.",
    sources: [
      { label: "Key features of liquidation", href: `${LIQUIDATION}#key-features-of-liquidation` },
      { label: "Liquidation incentive", href: `${LIQUIDATION}#liquidation-incentive-factor-lif` },
    ],
  },
];

const VAULT_TERM: InfoTerm = {
  term: "Vault",
  definition:
    "A vault is a pool that one curator runs. It takes depositors' tokens, all of one kind, and lends them into several markets, and the curator chooses which markets it may use. A depositor holds shares, a claim on the vault, and each share is worth more tokens as the markets pay interest.",
  sources: [{ label: "Morpho curation", href: `${DOCS}/curate/#introduction-to-curation` }],
};

function glossaryFor(deployment: MorphoInfoDeployment): readonly [InfoTerm, ...InfoTerm[]] {
  return deployment === "base" ? [MARKET_TERM, ...COMMON_TERMS, VAULT_TERM] : [MARKET_TERM, ...COMMON_TERMS];
}

const WHAT_IT_IS = (
  <>
    Morpho Blue is a lending protocol. People lend one token, the loan token, and borrow it by locking another token,
    the <GlossaryLink term="Collateral">collateral</GlossaryLink>, as security. Borrowers pay interest on what they
    borrow. A position on this page is one wallet (an account address) borrowing in one{" "}
    <GlossaryLink term="Market">market</GlossaryLink>.
  </>
);

const ISOLATED_MARKETS = (
  <>
    Morpho Blue is a smart contract, a program on the chain, that holds many separate markets, and anyone can create
    one. Each market has one loan token, one collateral token, one <GlossaryLink term="Oracle">oracle</GlossaryLink> and
    one liquidation loan-to-value limit (<GlossaryLink term="LLTV">LLTV</GlossaryLink>), and none of them changes
    afterwards.
  </>
);

const LIQUIDATION_ITEM = (
  <>
    The LLTV is the borrow limit and the liquidation line at once. When the oracle&apos;s price puts a borrower&apos;s
    debt past the LLTV, anyone can start a <GlossaryLink term="Liquidation">liquidation</GlossaryLink>. The liquidator,
    who repays the debt, earns a bonus, and the liquidation protects the market&apos;s lenders.
  </>
);

const FIGURES_IN_LOAN_TOKEN =
  "Every figure is in the market's loan token, because Morpho Blue never states a dollar value, so a debt reads like 1,200 USDC.";

function marketsView(href: string, body: ReactNode): InfoView {
  return {
    heading: "Markets",
    body: (
      <p>
        The{" "}
        <Link href={href} className={INLINE_LINK}>
          markets overview
        </Link>{" "}
        {body}
      </p>
    ),
  };
}

const LOAN_TOKEN_ROWS =
  "shows one row for each loan token, with what it is lent against and how much is lent and borrowed. Opening a row lists that token's markets.";

export function MorphoInfoPage({ deployment }: { deployment: MorphoInfoDeployment }) {
  const docs = { label: "Morpho documentation", href: `${DOCS}/` };
  const glossary = glossaryFor(deployment);

  if (deployment === "ethereum") {
    return (
      <ProtocolInfoPage
        session="morpho"
        name="Morpho Blue"
        tracks={
          <>
            The Rails Morpho Blue explorer shows every position on Ethereum, whether still open, closed or liquidated,
            and the full history of each one. It also shows{" "}
            <Link href="/ethereum/morpho/markets" className={INLINE_LINK}>
              the markets
            </Link>
            , with the borrowing limit that governs each.
          </>
        }
        notCovered="Morpho vaults, which pool depositors' tokens and lend them into several markets, aren't covered on Ethereum."
        glossary={glossary}
        howItWorks={[
          WHAT_IT_IS,
          ISOLATED_MARKETS,
          LIQUIDATION_ITEM,
          <>
            Rails rebuilds each position and its history from the contract&apos;s logged events. {FIGURES_IN_LOAN_TOKEN}
          </>,
        ]}
        views={[
          {
            heading: "Listing",
            body: (
              <p>
                Each card shows one position: the wallet, its market, its collateral, what it borrowed and its status.
                The listing opens on the open positions. Opening a card shows the position&apos;s collateral, debt and
                risk figures, its lifetime flows and its timeline of events.
              </p>
            ),
          },
          marketsView("/ethereum/morpho/markets", LOAN_TOKEN_ROWS),
        ]}
        search={
          <>
            You can search by wallet address, market name or market id, the market&apos;s unique identifier, a
            64-character code. The Status filter keeps open, closed or liquidated positions. The Market, Loan and
            Collateral filters keep positions in the markets you pick, or that lend or lock the tokens you pick. The
            Debt (loan token) filter sets a range for what a position owes. The Transactions filter sets a range for how
            many transactions a position has. Recent activity sorts by the latest event, First seen by the
            position&apos;s first event, and Event count by how many events its history holds.
          </>
        }
        docs={docs}
      />
    );
  }

  if (deployment === "base") {
    return (
      <ProtocolInfoPage
        session="morpho-base"
        name="Morpho Blue"
        tracks={
          <>
            The Rails Morpho Blue explorer shows every position on Base, a network built on Ethereum, whether still
            open, closed or liquidated, with its collateral and debt read from the chain and the full history of each
            one. It also shows{" "}
            <Link href="/base/morpho/markets" className={INLINE_LINK}>
              the markets
            </Link>{" "}
            and{" "}
            <Link href="/base/morpho/vaults" className={INLINE_LINK}>
              the vaults
            </Link>{" "}
            that lend into them.
          </>
        }
        glossary={glossary}
        howItWorks={[
          WHAT_IT_IS,
          ISOLATED_MARKETS,
          LIQUIDATION_ITEM,
          <>
            Rails reads each position&apos;s collateral and debt from the contract at the block (the chain&apos;s unit
            of time) its card names, beside the value the market&apos;s oracle puts on that collateral.{" "}
            {FIGURES_IN_LOAN_TOKEN}
          </>,
          <>
            A <GlossaryLink term="Vault">vault</GlossaryLink> is a pool that one curator runs. It lends depositors&apos;
            tokens into several markets, so a depositor does not pick markets one by one.
          </>,
        ]}
        views={[
          {
            heading: "Listing",
            body: (
              <>
                <p>
                  Each card shows one position: the wallet, its market, its collateral, its debt and its status. Opening
                  a card shows the position&apos;s collateral, debt and history, with the wallet&apos;s other positions
                  one link away.
                </p>
                <BaseLendingCoverageNote
                  route="/api/morpho-base/coverage"
                  unreadListed={false}
                  subject="Morpho Blue"
                  subjectPossessive="Morpho Blue&rsquo;s"
                  noun="position"
                />
              </>
            ),
          },
          marketsView("/base/morpho/markets", LOAN_TOKEN_ROWS),
          {
            heading: "Vaults",
            body: (
              <ul className={UL}>
                <li>
                  <Link href="/base/morpho/vaults" className={INLINE_LINK}>
                    The vault roster
                  </Link>{" "}
                  lists every MetaMorpho vault (Morpho&apos;s vault kind, run by a curator who picks its markets) that
                  Rails has found on Base. Each row shows its total assets, which is what the vault holds and has lent,
                  and its share price, which is what one share is worth in the vault&apos;s token. It also shows its
                  30-day yield, the share price&apos;s change over the last 30 days.
                </li>
                <li>
                  <Link href="/base/morpho/vaults/positions" className={INLINE_LINK}>
                    The vault positions listing
                  </Link>{" "}
                  shows each address that holds shares, a depositor&apos;s claim on a vault.
                </li>
                <li>
                  <Link href="/base/morpho/vaults/info" className={INLINE_LINK}>
                    The vault layer&apos;s about page
                  </Link>{" "}
                  explains how Rails builds that listing.
                </li>
              </ul>
            ),
          },
        ]}
        search={
          <>
            You can search by wallet address or market id, the market&apos;s unique identifier, a 64-character code. The
            Loan token and Collateral token filters keep positions in markets that use the tokens you pick. The Status
            filter keeps open, closed or liquidated positions. The Debt (loan token) and Collateral (loan token) filters
            set a range for what a position owes and holds. The History filter keeps positions liquidated before, and
            the Transactions filter sets a range for how many transactions a position has. Recent activity sorts by the
            latest event. Debt and Collateral sorts appear only once one loan token is chosen, because amounts in
            different tokens cannot be compared.
          </>
        }
        docs={docs}
      />
    );
  }

  const markets = MORPHO_ARBITRUM_MARKETS.length;
  return (
    <ProtocolInfoPage
      session="morpho-arbitrum"
      name="Morpho Blue"
      tracks={
        <>
          The Rails Morpho Blue explorer reads the positions of any wallet you enter on{" "}
          <Link href="/arbitrum/morpho" className={INLINE_LINK}>
            the Arbitrum front page
          </Link>
          , a network built on Ethereum, across all {markets} markets in a single read of the chain. It also lists{" "}
          <Link href="/arbitrum/morpho/positions" className={INLINE_LINK}>
            the positions Rails has already read
          </Link>{" "}
          and shows{" "}
          <Link href="/arbitrum/morpho/markets" className={INLINE_LINK}>
            the markets
          </Link>
          .
        </>
      }
      notCovered="Wallets that nobody has entered, and that were not among a day's most active, aren't listed here."
      glossary={glossary}
      howItWorks={[
        WHAT_IT_IS,
        ISOLATED_MARKETS,
        LIQUIDATION_ITEM,
        <>
          Rails asks the contract what each market holds for the wallet, all at one block (the chain&apos;s unit of
          time), and builds the wallet&apos;s history from its store of the contract&apos;s logs. Every figure is in the
          market&apos;s loan token, so a debt reads like 1,200 USDC. A wallet&apos;s dollar totals use the Aave V3
          Arbitrum oracle&apos;s price where that oracle lists the token.
        </>,
      ]}
      views={[
        {
          heading: "Listing",
          body: (
            <p>
              The listing holds the positions Rails has read, which come from each day&apos;s most active wallets since
              20 October 2026 and from any wallet a reader opened. Each card shows one position, and opening it shows
              the wallet&apos;s positions and their timeline.
            </p>
          ),
        },
        marketsView(
          "/arbitrum/morpho/markets",
          `shows the ${markets} markets Rails found from the contract's creation log, read live at one block.`,
        ),
      ]}
      search="You can search the listing by wallet address. The Debt (USD) and Collateral (USD) filters set a range for what a position owes and holds. The Transactions filter sets a range for how many transactions the wallet has. Last activity sorts by the latest event, Last opened by when a reader last opened the wallet, and Collateral and Debt by size."
      docs={docs}
    />
  );
}
