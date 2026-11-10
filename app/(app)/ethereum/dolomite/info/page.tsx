// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Dolomite on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Dolomite's official
// documentation (docs.dolomite.io).

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { DOLOMITE_ADDRESSES } from "@/lib/dolomite/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("dolomite");

const DOCS = "https://docs.dolomite.io";
const RISK = `${DOCS}/risk-management`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Account",
    definition:
      "An account is identified by the owner's wallet address plus an account number. Each token in it is a positive balance (the account holds it) or a negative balance (the account owes it).",
    sources: [{ label: "Accounts", href: `${DOCS}/developer-documentation/dolomite-margin-glossary#accounts` }],
  },
  {
    term: "Dolomite Balance",
    definition:
      "A Dolomite Balance is an owner's account number 0, the default account where deposits are held. Opening a Borrow Position means moving tokens from it into a new account.",
    sources: [
      { label: "Dolomite Balances", href: `${DOCS}/dolomite-balances` },
      {
        label: "Managing Borrow Positions",
        href: `${DOCS}/developer-documentation/managing-borrow-positions#opening-a-borrow-position`,
      },
    ],
  },
  {
    term: "Borrow Position",
    definition:
      "A Borrow Position is an account with a number other than 0. It is judged on its own balances, so a liquidation reaches only that account and not the owner's others.",
    sources: [
      { label: "Managing Borrow Positions", href: `${DOCS}/developer-documentation/managing-borrow-positions` },
    ],
  },
  {
    term: "Minimum collateralization",
    definition:
      "Minimum collateralization is the ratio of value held to value owed that an account is judged against. A minimum of 120% would mean each $100 owed needs $120 held. Some assets add a requirement on top of Dolomite's global minimum.",
    sources: [{ label: "Minimum collateralizations", href: `${RISK}#minimum-collateralizations-ltvs` }],
  },
  {
    term: "E-Mode",
    definition:
      "E-Mode is an automatic override of an account's risk terms. When all the assets in an account fit a category the protocol has configured, such as correlated stablecoins, the category's terms replace the defaults.",
    sources: [
      { label: "Automatic E-Mode", href: `${RISK}#automatic-e-mode` },
      {
        label: "E-Mode and segregated risk (how to read an account's override)",
        href: `${DOCS}/developer-documentation/e-mode-and-segregated-risk`,
      },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "The liquidation penalty is the extra collateral a liquidator earns for closing debt. A liquidation happens when an account falls below its minimum collateralization. An approved liquidator repays part or all of the debt and takes collateral worth slightly more, and the borrower bears the penalty.",
    sources: [
      { label: "Liquidations", href: `${RISK}#liquidations` },
      { label: "Liquidation penalties", href: `${RISK}#liquidation-penalties` },
    ],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one account, which is an owner address and an account number.</li>
        <li>A row shows what the account holds, what it owes and the minimum collateralization it is held to.</li>
        <li>A row also shows whether the account is open, closed, or closed by a liquidation.</li>
      </ul>
    ),
  },
  {
    heading: "Account page",
    body: (
      <ul className={UL}>
        <li>
          The top card shows the account&apos;s balances and the minimum collateralization it is judged by now,
          including any <GlossaryLink term="E-Mode">E-Mode</GlossaryLink> terms that apply to it.
        </li>
        <li>The timeline lists each event on the account, newest first.</li>
      </ul>
    ),
  },
  {
    heading: "Markets page",
    body: (
      <p>
        The markets page lists every market with its minimum collateralization, price, supplied and borrowed amounts,
        borrow rate and supply rate. It also shows the spread (the liquidation penalty for that market) and utilization
        (the share of supplied tokens that is lent out). A market&apos;s premiums show under the figures they raise.{" "}
        <Link href="/ethereum/dolomite/markets" className={INLINE_LINK}>
          Open the markets page to see them all
        </Link>
        .
      </p>
    ),
  },
];

const reads: InfoReads = {
  contracts: [
    {
      name: "DolomiteMargin",
      address: DOLOMITE_ADDRESSES.MARGIN,
      reads:
        "the market list, each market's token, price, supplied and borrowed amounts, rates, premiums and whether it is closing; the global minimum collateralization and liquidation spread; and each account's balances and the terms it is judged by.",
    },
    {
      name: "Each market's token",
      reads: "its symbol and decimals, so amounts and prices read in whole tokens.",
    },
  ],
  how: "The markets page reads DolomiteMargin at most every ten minutes, and an account page reads it at each load. Account histories come from Rails's server store of Dolomite's events.",
  notes: [
    <>
      Some accounts are judged on different terms from the markets table. DolomiteMargin names a{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", DOLOMITE_ADDRESSES.DEFAULT_RISK_OVERRIDE_SETTER)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        DefaultAccountRiskOverrideSetter
      </a>
      , which gives an account whose assets fit a category (<GlossaryLink term="E-Mode">E-Mode</GlossaryLink>, such as a
      staked ETH against ETH pair) a lower minimum collateralization, a narrower liquidation spread and no market
      premiums. The override is looked up by account, so the markets page cannot show it; each account page reads its
      account&apos;s terms and shows them.
    </>,
    <>
      Rails checks every market&apos;s price against the others. Where two markets report the same price to the last
      unit, the second uses the first&apos;s price feed, and the markets page tags it &ldquo;priced as&rdquo; the first.
      Every other market&apos;s price moves on its own feed.
    </>,
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="dolomite"
      tracks={
        <>
          The Rails Dolomite explorer shows every account on Dolomite on Ethereum, whether still open or closed, with
          what it holds, what it owes and the full history of each one. It also shows{" "}
          <Link href="/ethereum/dolomite/markets" className={INLINE_LINK}>
            the markets
          </Link>{" "}
          and the minimum collateralization that Dolomite requires in each.
        </>
      }
      notCovered="Dolomite on other chains isn't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Dolomite is a lending protocol: owners deposit tokens, and other owners borrow against them. Every balance
          sits in an <GlossaryLink term="Account">account</GlossaryLink>, identified by the owner&apos;s wallet address
          plus an account number. To borrow, an account takes a negative balance in a token, which means it owes that
          token. It holds other tokens as collateral, the assets that back the debt.
        </>,
        <>
          An owner&apos;s deposits sit in the <GlossaryLink term="Dolomite Balance">Dolomite Balance</GlossaryLink>,
          which is account number 0. Each <GlossaryLink term="Borrow Position">Borrow Position</GlossaryLink> is a
          separate account with its own balances, so a liquidation reaches only that account.
        </>,
        <>
          Each account must stay above its{" "}
          <GlossaryLink term="Minimum collateralization">minimum collateralization</GlossaryLink>, which depends on the
          assets it holds and owes. An account whose assets fit a category gets that category&apos;s terms from{" "}
          <GlossaryLink term="E-Mode">E-Mode</GlossaryLink>. An account that falls below its minimum is{" "}
          <GlossaryLink term="Liquidation">liquidated</GlossaryLink>, which closes part or all of its debt.
        </>,
      ]}
      reads={reads}
      views={views}
      search="You can search by owner address. The listing filters by Status, Supplied, Borrowed, Account, History, Debt (USD), Collateral (USD) and Transactions, and sorts by Recent activity, Debt or Collateral."
      docs={{ label: "Dolomite documentation", href: DOCS }}
    />
  );
}
