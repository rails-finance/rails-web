// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Compound V3 on Optimism (ui-jobs 578), drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary and the
// "how it works" items are the other Compound V3 info pages'
// (components/protocol/compound-v3/compound-v3-info.tsx); the contracts in "How
// Rails reads it" are the ones rails-server's compound-v3-optimism-at-block.ts
// reads. Unlaunched with the explorer: infoMetadata adds noindex and the root
// layout's strip covers this route.

import Link from "next/link";
import { ProtocolInfoPage, type InfoReads, type InfoView } from "@/components/shared/protocol-info-page";
import {
  GLOSSARY,
  INTEREST,
  LIQUIDATION_ITEM,
  ONE_BASE_ASSET,
  WHAT_IT_IS,
} from "@/components/protocol/compound-v3/compound-v3-info";
import {
  COMPOUND_OPTIMISM_CONFIGURATOR,
  COMPOUND_OPTIMISM_DEPLOYMENT,
  COMPOUND_OPTIMISM_REWARDS,
} from "@/lib/compound-v3-optimism/asset-catalog";
import { OPC_ROUTE } from "@/lib/compound-v3-optimism/types";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("compound-v3-optimism");

const UL = "list-disc space-y-1 pl-5";
const [USDC, ...REST] = COMPOUND_OPTIMISM_DEPLOYMENT.markets;

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's accounts",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={OPC_ROUTE} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see the markets it lends to, borrows from or holds collateral in. A wallet in one market opens that
          market&apos;s account.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>
            The account card shows the collateral and what the wallet lends or owes, each in dollars at the
            market&apos;s price feeds, and the share of its borrowing limit used.
          </li>
          <li>
            Each collateral asset shows its borrow and liquidate factors; the base balance shows its rate and the
            interest it gathered over the last 30 days; a borrower&apos;s card shows its room to borrow and the debt at
            which the market can absorb it.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Market view",
    body: (
      <p>
        <Link href={`${OPC_ROUTE}/markets`} className={INLINE_LINK}>
          The market view
        </Link>{" "}
        shows each Optimism market with its base asset, collateral assets, interest rates and reserves; each opens its
        own page.
      </p>
    ),
  },
];

const reads: InfoReads = {
  contracts: [
    {
      name: `${USDC.label} (Comet)`,
      address: USDC.comet,
      reads:
        "its supply and borrowing, utilisation, both rates and their kinks, reserves and their target, minimum borrow, and each collateral asset's factors, supply cap and total; for a wallet, its balance and principal in the base asset, each collateral and the market's verdict on it.",
    },
    ...REST.map((m) => ({ name: `${m.label} (Comet)`, address: m.comet, reads: `the same as ${USDC.label}.` })),
    {
      name: "Configurator",
      address: COMPOUND_OPTIMISM_CONFIGURATOR,
      reads: "the contract through which governance sets each market's terms. Rails reads those terms from each Comet.",
    },
    {
      name: "CometRewards",
      address: COMPOUND_OPTIMISM_REWARDS,
      reads: "the COMP an account can claim.",
    },
    {
      name: "Each asset's price feed",
      reads:
        "the Comet names one feed for its base asset and one for each collateral asset. Rails asks the Comet for each feed's price, the price its liquidations use. The WETH market prices in ETH.",
    },
  ],
  how: "Rails's server reads these contracts at the block current when you open a page, and an account's principal and base balance again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "No contract lists a chain's Comets, so the roster is stated: the three in Compound's deployment records for Optimism, each answering to the Configurator there.",
    "Accounts are read from the Comets' state for the wallet you enter, so there is no listing of every account, no holder ranking and no history until Rails indexes Compound V3 on Optimism.",
    "Interest over 30 days is stated only where the account's principal did not move between the two reads; a balance opened or changed inside the window says so instead.",
    "Every Optimism market's COMP reward speed is zero, so nothing new accrues; COMP an account can still claim is shown in COMP, which no Optimism market prices.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="compound-v3-optimism"
      tracks={
        <>
          The Rails Compound V3 explorer on Optimism shows a wallet&apos;s account in each market: its collateral, what
          it lends or owes in dollars, its borrowing limit and the interest over the last 30 days. It also shows{" "}
          <Link href={`${OPC_ROUTE}/markets`} className={INLINE_LINK}>
            the three markets
          </Link>
          , with their interest rates and reserves.
        </>
      }
      notCovered="An account's history, a listing of every account, the largest suppliers and borrowers, absorptions and configuration changes aren't covered here."
      glossary={GLOSSARY}
      howItWorks={[
        WHAT_IT_IS,
        <>
          Optimism has three markets, with USDC, USDT and WETH as their base assets. {ONE_BASE_ASSET} The Optimism
          markets are separate from the Ethereum, Base and Arbitrum markets of the same names.
        </>,
        INTEREST,
        LIQUIDATION_ITEM,
        "The WETH market prices in ETH, so its dollar figures convert at the WETH price from the USDC market.",
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Compound III documentation", href: "https://docs.compound.xyz" }}
    />
  );
}
