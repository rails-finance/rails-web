// The Aave V4 /info page for both deployments, drawn on the typed template
// (rails-ops standards/info-page-template.md). One component so the two routes
// share the glossary (content/aave-v4/event-prose.yaml) and the page's shape;
// what differs per chain is the hubs, the prices, the search and the hubs view.

import Link from "next/link";
import type { ReactNode } from "react";
import { GlossaryLink, ProtocolInfoPage, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { aaveV4Glossary } from "@/lib/aave-v4/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

const WHAT_IS_AAVE = (
  <>
    Aave V4 lets people supply crypto to earn interest and borrow against it. A{" "}
    <GlossaryLink term="Position">position</GlossaryLink> is one wallet&apos;s supplied assets and debt on one spoke,
    and a wallet is an account address.
  </>
);

const HUBS_AND_SPOKES = (
  <>
    <GlossaryLink term="Hub">Hubs</GlossaryLink> hold the money that people supply, which is the liquidity available to
    lend. <GlossaryLink term="Spoke">Spokes</GlossaryLink> are where people open positions and borrow from a hub.
    Supplied assets that a wallet enables as <GlossaryLink term="Collateral">collateral</GlossaryLink> back its
    borrowing, and a <GlossaryLink term="Credit line">credit line</GlossaryLink> caps how much a spoke may borrow from a
    hub.
  </>
);

const SORT = "The listing sorts by recent activity, debt, supply or health factor.";

function listing(extra?: ReactNode): InfoView {
  return {
    heading: "Listing",
    body: (
      <>
        <ul className={UL}>
          <li>
            Each card shows one wallet's position on one spoke, with its collateral, its debt, its health factor and the
            hubs it uses.
          </li>
          <li>
            A position with no debt shows what it supplied. A position whose health factor is below 1.0 is marked
            liquidatable, which means anyone may repay part of its debt and take collateral at a bonus.
          </li>
          <li>
            A closed position shows the largest balances Rails recorded in its history and how it ended, either Closed
            or Liquidated.
          </li>
          <li>Open positions show by default. Searching a wallet shows positions of every status.</li>
        </ul>
        {extra}
      </>
    ),
  };
}

const POSITION_PAGE: InfoView = {
  heading: "Position page",
  body: (
    <ul className={UL}>
      <li>
        The top card shows the position&apos;s collateral, debt and health factor, read from the spoke now. It also
        shows the interest so far, which the borrower owes and the supplier earns, and the borrow rate, which is the
        yearly rate on the debt. The liquidation price is the asset price at which the position becomes liquidatable.
      </li>
      <li>A chart traces the collateral and the debt over the position&apos;s life.</li>
      <li>The timeline lists each event on the spoke, newest first.</li>
    </ul>
  ),
};

export function AaveV4InfoPage({ deployment }: { deployment: "ethereum" | "base" }) {
  const docs = { label: "Aave V4 documentation", href: "https://aave.com/docs/aave-v4" };
  if (deployment === "base") {
    return (
      <ProtocolInfoPage
        session="aave-v4-base"
        tracks={
          <>
            The Rails Aave V4 explorer shows every account on the Mag7 spoke on Base, whether still open or closed, and
            the full history of each one. It also shows{" "}
            <Link href="/base/aave-v4/hubs" className={INLINE_LINK}>
              the Equities hub
            </Link>
            : the price, limits and borrowing of each reserve on Mag7.
          </>
        }
        notCovered="Incentive rewards aren't covered here."
        glossary={aaveV4Glossary()}
        howItWorks={[
          WHAT_IS_AAVE,
          HUBS_AND_SPOKES,
          "Base has one hub, Equities, and one spoke, Mag7. Coinbase's tokenized stocks are its collateral, and USDC is the one asset it lends.",
          <>
            A wallet&apos;s collateral on Mag7 backs its USDC debt under one{" "}
            <GlossaryLink term="Health factor">health factor</GlossaryLink>, and each stock&apos;s{" "}
            <GlossaryLink term="Collateral factor">collateral factor</GlossaryLink> sets how much debt it can carry.
            This deployment is separate from Aave V4 on Ethereum, with its own contracts and risk settings.
          </>,
          <>
            Dollar values use the prices from the spoke&apos;s oracle, the service that reports each asset&apos;s price.
            The spoke uses the same prices when it carries out a{" "}
            <GlossaryLink term="Liquidation">liquidation</GlossaryLink>.
          </>,
        ]}
        search={`You can search by wallet address. The listing filters by status, liquidatable, liquidated before (positions that were liquidated at least once), supplying and borrowing (positions holding a chosen asset), debt size (the position's debt in dollars), supply size (its supplied value in dollars), number of transactions, and hiding dust, which removes positions with tiny leftover balances. ${SORT}`}
        views={[
          listing(
            <BaseLendingCoverageNote
              route="/api/aave-v4-base/coverage"
              unreadListed={false}
              subject="this spoke"
              subjectPossessive={"the spoke’s"}
            />,
          ),
          POSITION_PAGE,
          {
            heading: "Equities hub",
            body: (
              <p>
                The Equities hub page lists each reserve on Mag7 with its price and when the price was published, its
                collateral factor and its maximum liquidation bonus. It also shows the supply against the reserve&apos;s
                cap and the borrowing against the credit line. Use this link to open it:{" "}
                <Link href="/base/aave-v4/hubs" className={INLINE_LINK}>
                  the Equities hub page
                </Link>
                .
              </p>
            ),
          },
        ]}
        docs={docs}
      />
    );
  }
  return (
    <ProtocolInfoPage
      session="aave-v4"
      tracks={
        <>
          The Rails Aave V4 explorer shows every position on Ethereum, one for each wallet and spoke, whether still open
          or closed, and the full history of each one. It also compares{" "}
          <Link href="/ethereum/aave-v4/hubs" className={INLINE_LINK}>
            the four hubs
          </Link>
          : their assets, supply, borrowing and rates.
        </>
      }
      notCovered="Incentive rewards aren't covered here."
      glossary={aaveV4Glossary()}
      howItWorks={[
        WHAT_IS_AAVE,
        HUBS_AND_SPOKES,
        <>
          Within one spoke, a wallet&apos;s collateral backs all its borrowing under one{" "}
          <GlossaryLink term="Health factor">health factor</GlossaryLink>, and each asset&apos;s{" "}
          <GlossaryLink term="Collateral factor">collateral factor</GlossaryLink> sets how much debt it can carry.
          Positions on different spokes do not affect each other.
        </>,
        "Ethereum has four hubs, named Core, Plus, Prime and Global Dollar. Some spokes borrow from more than one hub: the Bluechip spoke borrows from both Prime and Core.",
        <>
          Dollar values use the prices from Aave&apos;s oracle, the service that reports each asset&apos;s price. Aave
          uses the same prices when it carries out a <GlossaryLink term="Liquidation">liquidation</GlossaryLink>.
        </>,
      ]}
      search={`You can search by wallet address or by ENS name, a readable wallet name such as name.eth. The listing filters by status, liquidatable, liquidated before (positions that were liquidated at least once), hub, spoke, supplying and borrowing (positions holding a chosen asset), debt size (the position's debt in dollars), supply size (its supplied value in dollars), number of transactions, and hiding dust, which removes positions with tiny leftover balances. ${SORT}`}
      views={[
        listing(),
        POSITION_PAGE,
        {
          heading: "Hub comparison",
          body: (
            <p>
              The hub comparison shows each hub&apos;s supply, borrowing, mix of assets and spokes. It then gives one
              table of every asset in every hub, with the amount supplied, the amount borrowed, the rates and the
              utilisation, which is the share of the supplied amount that is borrowed. Use this link to open it:{" "}
              <Link href="/ethereum/aave-v4/hubs" className={INLINE_LINK}>
                the hub comparison page
              </Link>
              .
            </p>
          ),
        },
      ]}
      docs={docs}
    />
  );
}
