// The Aave V4 /info page for both deployments, drawn on the typed template
// (rails-ops standards/info-page-template.md). One component so the two routes
// share the glossary (content/aave-v4/event-prose.yaml) and the page's shape;
// what differs per chain is the hubs, the prices, the search and the hubs view.

import Link from "next/link";
import type { ReactNode } from "react";
import { ProtocolInfoPage, type InfoView } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { aaveV4Glossary } from "@/lib/aave-v4/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const UL = "list-disc space-y-1 pl-5";

const HUBS_AND_SPOKES =
  "Hubs hold the liquidity. Spokes are the markets people use: each takes collateral and borrows from a hub over a credit line.";

const SORT = "Sort: recent activity, debt, supply, health factor.";

function listing(extra?: ReactNode): InfoView {
  return {
    heading: "Listing",
    body: (
      <>
        <ul className={UL}>
          <li>One card per wallet and spoke: its collateral, debt and health factor, and the hubs it uses.</li>
          <li>A position with no debt shows what it supplied. A health factor below 1.0 is marked liquidatable.</li>
          <li>A closed position shows its highest recorded balances and its outcome, Closed or Liquidated.</li>
          <li>Open positions show by default. Searching a wallet shows every status.</li>
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
        The top card shows collateral, debt and health factor read from the spoke now, with interest, the borrow rate
        and the liquidation price.
      </li>
      <li>A chart traces collateral and debt over the position&apos;s life.</li>
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
        name="Aave V4"
        tracks="Every account on Aave V4's Mag7 spoke on Base, open or closed, with its history, and the Equities hub's reserves. Incentive rewards are not shown."
        glossary={aaveV4Glossary()}
        howItWorks={[
          HUBS_AND_SPOKES,
          "Base has one hub, Equities, and one spoke, Mag7. Coinbase's tokenized stocks are its collateral, and USDC is the one asset it lends.",
          "A wallet's collateral on Mag7 backs its USDC debt under one health factor. The deployment is separate from Aave V4 on Ethereum, with its own contracts and risk settings.",
          "Dollar values use the spoke's oracle prices, the same ones it liquidates with. The stock feeds publish from Sunday 20:00 to Friday 20:00 ET and hold their last value otherwise.",
        ]}
        search={`Search takes a wallet address. Filters: status, liquidatable, liquidated before, supplying, borrowing, debt and supply size, transactions, hide dust. ${SORT}`}
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
                Each reserve on Mag7: its price and when it was published, collateral factor, maximum bonus, supply
                against its cap, and borrowing against the credit line.{" "}
                <Link href="/base/aave-v4/hubs" className={INLINE_LINK}>
                  See the Equities hub
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
      name="Aave V4"
      tracks="Every Aave V4 position on Ethereum, one per wallet and spoke, open or closed, with its history, and each hub's assets and rates. Incentive rewards are not shown."
      glossary={aaveV4Glossary()}
      howItWorks={[
        HUBS_AND_SPOKES,
        "Within one spoke, a wallet's collateral backs all its borrowing under one health factor. Positions on different spokes do not affect each other.",
        "Ethereum has four hubs: Core, Plus, Prime and Global Dollar. Some spokes borrow from more than one, as Bluechip does from Prime and Core.",
        "Dollar values use Aave's own oracle prices, the same ones it liquidates with.",
      ]}
      search={`Search takes a wallet address or ENS name. Filters: status, liquidatable, liquidated before, hub, spoke, supplying, borrowing, debt and supply size, transactions, hide dust. ${SORT}`}
      views={[
        listing(),
        POSITION_PAGE,
        {
          heading: "Hub comparison",
          body: (
            <p>
              Each hub&apos;s supply, borrowing, asset mix and spokes, then one table of every asset in every hub:
              supplied, borrowed, rates and utilisation.{" "}
              <Link href="/ethereum/aave-v4/hubs" className={INLINE_LINK}>
                See the hub comparison
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
