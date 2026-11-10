// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Compound V2 on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Compound's official
// documentation (rails-ops reference/official-docs/compound-v2.md).

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { COMPTROLLER_FAMILIES } from "@/lib/comptroller/families";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("compound-v2");

const DOCS = "https://docs.compound.xyz/v2";
const CTOKENS = `${DOCS}/ctokens`;
const COMPTROLLER = `${DOCS}/comptroller`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "cToken",
    definition:
      "A cToken is the receipt a supplier gets for a token placed in a market. Its exchange rate rises when the market's suppliers earn interest, and the receipt then redeems for more of the token.",
    sources: [{ label: "cTokens", href: CTOKENS + "/#introduction" }],
  },
  {
    term: "Exchange rate",
    definition:
      "The exchange rate is the amount of the market's token that one cToken can be redeemed for. It rises when the market's suppliers earn interest.",
    sources: [{ label: "Exchange rate", href: CTOKENS + "/#exchange-rate" }],
  },
  {
    term: "Comptroller",
    definition:
      "The Comptroller is the contract that sets the risk rules for every market. It decides how much a wallet may borrow and when a wallet can be liquidated.",
    sources: [{ label: "Comptroller", href: COMPTROLLER + "/#introduction" }],
  },
  {
    term: "Entering a market",
    definition:
      "A wallet enters a market to let its supply there count as collateral. A market that has not been entered adds nothing to what the wallet may borrow.",
    sources: [{ label: "Enter markets", href: COMPTROLLER + "/#enter-markets" }],
  },
  {
    term: "Collateral factor",
    definition:
      "The collateral factor is the share of a supplied asset's value that counts towards borrowing. Governance sets it for each market, from 0% to 90%. At 0% the asset cannot back a loan.",
    sources: [{ label: "Collateral factor", href: COMPTROLLER + "/#collateral-factor" }],
  },
  {
    term: "Account liquidity",
    definition:
      "Account liquidity is a wallet's borrowing room: its entered supply times each collateral factor, minus what it owes. A negative result is a shortfall, and the wallet can be liquidated.",
    sources: [{ label: "Account liquidity", href: COMPTROLLER + "/#account-liquidity" }],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation happens to a wallet whose debt passes its borrowing limit. A liquidator repays part of the debt and takes collateral at a discount.",
    sources: [{ label: "Liquidate borrow", href: CTOKENS + "/#liquidate-borrow" }],
  },
  {
    term: "Liquidator",
    definition: "A liquidator is anyone who repays part of a wallet's debt in return for the liquidation incentive.",
    sources: [{ label: "Liquidate borrow", href: CTOKENS + "/#liquidate-borrow" }],
  },
  {
    term: "Close factor",
    definition:
      "The close factor is the share of one debt that a single liquidation may repay. That is why a liquidated wallet often keeps part of its debt.",
    sources: [{ label: "Close factor", href: COMPTROLLER + "/#close-factor" }],
  },
  {
    term: "Liquidation incentive",
    definition:
      "The liquidation incentive is the extra collateral a liquidator receives for repaying a wallet's debt. Part of that extra collateral goes to the reserves of the seized collateral's market.",
    sources: [{ label: "Liquidation incentive", href: COMPTROLLER + "/#liquidation-incentive" }],
  },
  {
    term: "Reserve factor",
    definition:
      "The reserve factor is the share of the interest borrowers pay that goes to the market's reserves. Suppliers receive the rest, so at 100% suppliers receive nothing.",
    sources: [{ label: "Reserve factor", href: CTOKENS + "/#reserve-factor" }],
  },
  {
    term: "Fixed price",
    definition:
      "A fixed price is a number governance stores in the price oracle for a token that has no live price feed. Governance can change it.",
    sources: [{ label: "Price Feed", href: DOCS + "/prices/#introduction" }],
  },
];

const CV2 = COMPTROLLER_FAMILIES["compound-v2"];

/** Slot 2a: the contracts behind the markets pages. */
const reads: InfoReads = {
  contracts: [
    {
      name: "Comptroller",
      address: CV2.comptroller,
      reads:
        "the list of markets, the oracle it uses, the close factor and liquidation incentive, and for each market its collateral factor, borrow cap and whether supplying or borrowing is paused.",
    },
    {
      name: "Each market's cToken",
      reads:
        "what is supplied, borrowed and held as cash, the reserves, the supply and borrow rates, the reserve factor and which rate model the market uses.",
    },
    {
      name: "Price oracle",
      address: CV2.oracle,
      reads:
        "each market's price, the one the Comptroller uses for liquidations, and whether a price feed stands behind it or governance stored a fixed price.",
    },
    {
      name: "Each market's rate model",
      reads:
        "the base rate, multiplier, kink and jump multiplier that set the borrow rate, and the blocks a year the rates are counted over. The five oldest markets run the first model, which has no kink.",
    },
  ],
  how: "The markets pages read these contracts through Rails's server at most every ten minutes, and a wallet page reads the wallet's markets at each load.",
};

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one wallet&apos;s full history in the protocol, open or closed.</li>
        <li>A row shows what the wallet supplied, what it borrowed across every market, and where it stands now.</li>
        <li>
          A closed wallet that was liquidated is marked Liquidated. An open wallet that was liquidated stays open, and
          the row shows how many liquidations it has had.
        </li>
      </ul>
    ),
  },
  {
    heading: "Wallet page",
    body: (
      <ul className={UL}>
        <li>The top card shows the wallet&apos;s supply, borrows and account liquidity as read from the chain now.</li>
        <li>
          The timeline lists each event on the wallet, and shows each seizure, the collateral a liquidator takes, in a
          liquidation leg by leg.
        </li>
      </ul>
    ),
  },
  {
    heading: "Markets page",
    body: (
      <p>
        The markets page lists every market the Comptroller holds, with how much is supplied, borrowed and available in
        each, its rates and its collateral factor, and flags the markets with a fixed price. Each market opens a page
        with its rate curve and parameters.{" "}
        <Link href="/ethereum/compound-v2/markets" className={INLINE_LINK}>
          See every market
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="compound-v2"
      tracks={
        <>
          The Rails Compound V2 explorer shows the full history of every wallet that has supplied to or borrowed from
          Compound V2 on Ethereum, whether still open or closed, with every liquidation it went through. It also shows{" "}
          <Link href="/ethereum/compound-v2/markets" className={INLINE_LINK}>
            the markets
          </Link>{" "}
          themselves and how much of each is borrowed.
        </>
      }
      glossary={glossary}
      reads={reads}
      howItWorks={[
        <>
          Compound V2 is a pooled lending protocol. A market is a pool of one token that people supply and borrow. A
          wallet (an account address) supplies a token to a market and receives{" "}
          <GlossaryLink term="cToken">cTokens</GlossaryLink>. One row on this page is one wallet.
        </>,
        <>
          A wallet supplies a token and <GlossaryLink term="Entering a market">enters the market</GlossaryLink>, so the
          supply counts as collateral (the assets that back a loan). It can then borrow up to its{" "}
          <GlossaryLink term="Account liquidity">account liquidity</GlossaryLink>, its borrowing room: each entered
          supply times its <GlossaryLink term="Collateral factor">collateral factor</GlossaryLink>, minus its debt. If
          the room turns negative, a <GlossaryLink term="Liquidator">liquidator</GlossaryLink> steps in.
        </>,
        <>
          Every market sits under one <GlossaryLink term="Comptroller">Comptroller</GlossaryLink>, which sets these
          rules. A <GlossaryLink term="Liquidation">liquidation</GlossaryLink> repays part of the debt, capped by the{" "}
          <GlossaryLink term="Close factor">close factor</GlossaryLink>. The liquidator then receives a{" "}
          <GlossaryLink term="Liquidation incentive">liquidation incentive</GlossaryLink>.
        </>,
        <>
          Suppliers currently earn no interest. Governance, the process by which holders of Compound&apos;s COMP token
          vote on its rules, has set every market&apos;s{" "}
          <GlossaryLink term="Reserve factor">reserve factor</GlossaryLink> to 100%, as the markets page reads from the
          chain. All the interest borrowers pay goes to the reserves, which the market holds for the protocol, so the{" "}
          <GlossaryLink term="Exchange rate">exchange rate</GlossaryLink> no longer rises. A few markets use a{" "}
          <GlossaryLink term="Fixed price">fixed price</GlossaryLink>, and the explorer flags them wherever they appear.
        </>,
      ]}
      views={views}
      search={
        <>
          You can search by wallet address. Status keeps open, closed or liquidated wallets. Debt (USD) and Collateral
          (USD) keep wallets within a size range. Supplying and Borrowing keep wallets holding a chosen token.
          Liquidated before keeps wallets that were liquidated at least once. Transactions keeps wallets within a range
          of transaction counts. The listing sorts by Recent activity, Debt or Collateral.
        </>
      }
      docs={{ label: "Compound V2 documentation", href: DOCS + "/" }}
    />
  );
}
