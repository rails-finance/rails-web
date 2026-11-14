// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Fluid on Base (ui-jobs 574), drawn on the typed template
// (rails-ops standards/info-page-template.md). The glossary and how-it-works
// are Ethereum's (app/(app)/ethereum/fluid/info/page.tsx) where they hold; the
// contracts in "How Rails reads it" are the ones rails-server's
// fluid-base-at-block.ts reads. Unlaunched with the explorer: infoMetadata adds
// noindex and the root layout's strip covers this route.

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
  GUIDE_NO_LEARN_MORE,
} from "@/components/shared/protocol-info-page";
import { FLUID_BASE_CONTRACTS } from "@/lib/fluid-base/types";
import { FLUID_BASE_DOLLARS } from "@/lib/fluid-base/dollars";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { protocolForSession } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("fluid-base");

const DOCS = "https://docs.fluid.io";
const POSITIONS = `${DOCS}/integrate/vault-user-positions.html`;
const HEALTH = `${POSITIONS}#health-factors-collateral-factor-liquidation-threshold-penalty-etc`;
const SMART = `${POSITIONS}#smart-debt-smart-col-amounts`;
const LIQUIDATION = `${DOCS}/integrate/liquidation-swaps.html#fluid-liquidation-swaps`;
const TERMS = "https://fluid.guides.instadapp.io/vault-protocol/protocol-details";

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A vault is a Fluid contract that holds the collateral of its borrowers and lends them one other token. Each vault has its own limits.",
    sources: [{ label: "Contracts overview", href: `${DOCS}/#core` }],
  },
  {
    term: "Position",
    definition:
      "A position is one borrower's collateral and debt in one vault. Each position is an NFT, a token its owner holds, so it can move between wallets.",
    sources: [{ label: "Get all user vault positions", href: `${POSITIONS}#get-all-user-vault-positions` }],
  },
  {
    term: "Oracle",
    definition:
      "An oracle is the price source that tells a vault how much the collateral is worth. A Fluid vault's oracle prices the collateral in the debt token.",
    sources: [{ label: "Architecture", href: `${DOCS}/#architecture` }],
  },
  {
    term: "Smart vault",
    definition:
      "A smart vault holds its collateral, its debt or both as shares of a DEX pool. A DEX is a decentralised exchange, and its pool is the liquidity that traders swap against.",
    sources: [{ label: "Smart debt and smart collateral amounts", href: SMART }],
  },
  {
    term: "Collateral factor",
    definition:
      "The collateral factor is the share of the collateral's value that can be borrowed against. The vault refuses to lend beyond it.",
    sources: [
      { label: "Health factors: Collateral factor, Liquidation threshold, penalty etc.", href: HEALTH },
      { label: "Protocol Details", href: TERMS },
    ],
  },
  {
    term: "Liquidation threshold",
    definition:
      "The liquidation threshold is the debt-to-collateral share at which liquidation can start. A position with debt above it can be liquidated.",
    sources: [
      { label: "Health factors: Collateral factor, Liquidation threshold, penalty etc.", href: HEALTH },
      { label: "Protocol Details", href: TERMS },
    ],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation lets anyone repay part of a position's debt and receive collateral from it at a discount. The collateral is sold to repay the debt.",
    sources: [{ label: "Fluid liquidation swaps", href: LIQUIDATION }],
  },
  {
    term: "Exchange price",
    definition:
      "A vault counts each position in raw units and turns them into token amounts through its exchange prices, which grow as interest accrues. The growth between two dates is the interest over them.",
    sources: [{ label: "Get all user vault positions", href: POSITIONS }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's positions",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={protocolForSession("fluid-base")!.href} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see that wallet&apos;s Fluid vault positions on Base that hold collateral or debt. Rails shows the newest
          200.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>Each row names the position&apos;s number, its collateral and debt tokens, and its vault.</li>
          <li>Each row opens the position&apos;s page.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Position page",
    body: (
      <p>
        The position page shows the position&apos;s collateral and debt
        {FLUID_BASE_DOLLARS
          ? ", each with its dollar value where Aave prices the token,"
          : " in the vault's tokens,"}{" "}
        its ratio against the vault&apos;s limits, its borrow rate and the room left to borrow, and the interest each
        side gathered over the last 30 days.
      </p>
    ),
  },
];

const reads: InfoReads = {
  contracts: [
    {
      name: "VaultResolver",
      address: FLUID_BASE_CONTRACTS.vaultResolver,
      reads:
        "a wallet's positions, and for one position its collateral and debt with interest and liquidations applied, and its vault's tokens, limits, oracle price, exchange prices and rates.",
    },
    ...(FLUID_BASE_DOLLARS
      ? [
          {
            name: "Aave V3 Base AaveOracle",
            address: FLUID_BASE_CONTRACTS.aaveOracle,
            reads: "the dollar price of each side's token, where Aave lists it.",
          },
        ]
      : []),
    { name: "Each token", reads: "its symbol and decimals, so amounts read in whole tokens." },
  ],
  how: "Rails's server reads these contracts at the block current when you open a page, and the position again at the UTC midnight 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
  notes: [
    "Fluid's position events name no position in an indexed field, and Base's free gateway serves no wide log range, so this explorer has no history until Rails indexes Fluid on Base.",
    "Interest over 30 days is stated only where the position's raw amounts are the same at both reads; a position opened or changed inside the window says so instead.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="fluid-base"
      tracks={
        <>
          The Rails Fluid explorer on Base shows a wallet&apos;s Fluid vault positions: each one&apos;s collateral and
          debt, its ratio against the vault&apos;s limits, and the interest over the last 30 days.
        </>
      }
      notCovered="Fluid's deposit-and-earn lending, its DEX trading, a position's history and a listing of every position aren't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Fluid is a lending protocol. A <GlossaryLink term="Vault">vault</GlossaryLink> holds one collateral token and
          lends one other token. A <GlossaryLink term="Position">position</GlossaryLink> is one borrower&apos;s
          collateral and debt in a vault. It is an NFT, so it can move between wallets.
        </>,
        <>
          The vault&apos;s <GlossaryLink term="Oracle">oracle</GlossaryLink> prices the collateral in the debt token.
          Some vaults are <GlossaryLink term="Smart vault">smart vaults</GlossaryLink>, where a side is held as shares
          of a DEX pool and counted in DEX shares.
        </>,
        <>
          Each vault sets its limits as shares of the collateral&apos;s value. The{" "}
          <GlossaryLink term="Collateral factor">collateral factor</GlossaryLink> is the most a position may borrow.
          Debt above the <GlossaryLink term="Liquidation threshold">liquidation threshold</GlossaryLink> can be{" "}
          <GlossaryLink term="Liquidation">liquidated</GlossaryLink>.
        </>,
        <>
          Interest accrues through the vault&apos;s <GlossaryLink term="Exchange price">exchange prices</GlossaryLink>:
          collateral grows at the supply rate and debt at the borrow rate.{" "}
          {FLUID_BASE_DOLLARS
            ? "The vault's oracle prices collateral in the debt token. Rails values each side in dollars at Aave V3's price on Base."
            : "The vault's oracle prices collateral in the debt token, so every figure is in the vault's tokens."}
        </>,
      ]}
      reads={reads}
      views={views}
      docs={{ label: "Fluid documentation", href: DOCS }}
    />
  );
}
