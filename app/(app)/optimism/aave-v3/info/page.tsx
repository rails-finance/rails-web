// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Aave V3 on Optimism (ui-jobs 578), drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary is the
// other Aave V3 pages' (content/aave-v3/event-prose.yaml); the contracts in
// "How Rails reads it" are the ones rails-server's aave-v3-optimism-at-block.ts
// reads. Unlaunched with the explorer: infoMetadata adds noindex and the root
// layout's strip covers this route.

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoView,
  GUIDE_NO_LEARN_MORE,
} from "@/components/shared/protocol-info-page";
import { aaveV3Glossary } from "@/lib/aave-v3/event-templates";
import { AAVE_V3_OPTIMISM_CONTRACTS as C, OP_ROUTE } from "@/lib/aave-v3-optimism/types";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("aave-v3-optimism");

const UL = "list-disc space-y-1 pl-5";

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's account",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={OP_ROUTE} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see its account on the Pool.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>
            The account card shows what the wallet supplies and owes, each in dollars at Aave&apos;s oracle, its health
            factor and its room to borrow.
          </li>
          <li>
            Each supplied asset shows its liquidation threshold and supply rate, each borrowed asset its borrow rate,
            and each balance the interest it gathered over the last 30 days.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Market overview and reserves",
    body: (
      <p>
        <Link href={`${OP_ROUTE}/markets`} className={INLINE_LINK}>
          The market overview
        </Link>{" "}
        lists every reserve with what is supplied and borrowed, its rates, caps and risk settings; each reserve opens
        its page, with its rate curve and parameters.
      </p>
    ),
  },
];

const reads: InfoReads = {
  contracts: [
    {
      name: "Pool",
      address: C.pool,
      reads: "each reserve's settings, rates and interest indexes, and an account's totals and health factor.",
    },
    {
      name: "UiPoolDataProvider",
      address: C.uiPoolDataProvider,
      reads: "an account's balances, collateral switches and E-Mode category in one call.",
    },
    { name: "AaveOracle", address: C.oracle, reads: "each reserve's dollar price." },
    { name: "PoolAddressesProvider", address: C.addressesProvider, reads: "the Pool and oracle it names." },
  ],
  how: "Rails's server reads these contracts at the block current when you open a page, and an account's balances and each reserve's interest index again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "Accounts are read from the Pool's state for the wallet you enter, so there is no listing of every account, no holder ranking and no history until Rails indexes Aave V3 on Optimism.",
    "Interest over 30 days is stated only where the account's balance did not move between the two reads; a balance opened or changed inside the window says so instead.",
    "The addresses are those in Aave's address book (aave-address-book, AaveV3Optimism.sol), each checked on chain: the PoolAddressesProvider names the Pool and the oracle.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="aave-v3-optimism"
      tracks={
        <>
          The Rails Aave V3 explorer on Optimism shows a wallet&apos;s account on the Pool: what it supplies and owes in
          dollars, its health factor and the interest over the last 30 days. It also shows{" "}
          <Link href={`${OP_ROUTE}/markets`} className={INLINE_LINK}>
            every reserve
          </Link>
          .
        </>
      }
      notCovered="An account's history, a listing of every account, the largest suppliers and borrowers, liquidations, configuration changes and incentive rewards aren't covered here."
      glossary={aaveV3Glossary()}
      howItWorks={[
        <>
          Aave V3 lets people supply crypto to earn interest and borrow against it. A{" "}
          <GlossaryLink term="Market">market</GlossaryLink> is one Pool; Optimism has one, apart from Aave V3 on
          Ethereum, Base and Arbitrum.
        </>,
        <>
          Each asset in the Pool is a <GlossaryLink term="Reserve">reserve</GlossaryLink> with its own rates, caps and
          risk settings. A frozen reserve takes no new supply or borrowing, and the market overview tags it.
        </>,
        <>
          A wallet&apos;s <GlossaryLink term="Collateral">collateral</GlossaryLink> backs all its{" "}
          <GlossaryLink term="Debt">debt</GlossaryLink> in the Pool under one{" "}
          <GlossaryLink term="Health factor">health factor</GlossaryLink>. An E-Mode category lends higher thresholds to
          related assets, such as ETH and its staked forms.
        </>,
        <>
          Dollar values use the AaveOracle, the contract that reports each asset&apos;s price, mostly from Chainlink
          feeds. The Pool uses the same prices when it carries out a{" "}
          <GlossaryLink term="Liquidation">liquidation</GlossaryLink>.
        </>,
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Aave V3 documentation", href: "https://aave.com/docs/aave-v3/overview" }}
    />
  );
}
