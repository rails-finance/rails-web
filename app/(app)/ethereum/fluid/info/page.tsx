// About this explorer — Fluid on Ethereum, drawn on the typed template
// (rails-ops standards/info-page-template.md). Every link is Fluid's official
// documentation at docs.fluid.io. The glossary sits in this file: Fluid keeps no
// content/fluid/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("fluid");

const DOCS = "https://docs.fluid.io";
const POSITIONS = `${DOCS}/integrate/vault-user-positions.html`;
const HEALTH = `${POSITIONS}#health-factors-collateral-factor-liquidation-threshold-penalty-etc`;
const SMART = `${POSITIONS}#smart-debt-smart-col-amounts`;
const LIQUIDATION = `${DOCS}/integrate/liquidation-swaps.html#fluid-liquidation-swaps`;

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A vault is a Fluid contract that holds the collateral of its borrowers and lends them one other token. Each vault has its own limits.",
    sources: [
      { label: "Contracts overview", href: `${DOCS}/#core` },
      { label: "Architecture", href: `${DOCS}/#architecture` },
    ],
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
      "An oracle is the price source that tells a vault how much the collateral is worth. The vault uses that value to decide how much can be borrowed.",
    sources: [{ label: "Architecture", href: `${DOCS}/#architecture` }],
  },
  {
    term: "Smart vault",
    definition:
      "A smart vault holds its collateral, its debt or both as shares of a DEX pool. A DEX is a decentralised exchange, and its pool is the liquidity that traders swap against. Pool shares earn trading fees.",
    sources: [
      { label: "Contracts overview", href: `${DOCS}/#core` },
      { label: "Smart debt and smart collateral amounts", href: SMART },
    ],
  },
  {
    term: "Borrow limit",
    definition:
      "The borrow limit is the most a position may borrow, as a share of its collateral's value. The vault refuses to lend beyond it.",
    sources: [{ label: "Vault configuration", href: HEALTH }],
  },
  {
    term: "Liquidation threshold",
    definition:
      "The liquidation threshold is the debt-to-collateral share at which liquidation can start. A position with debt above it can be liquidated.",
    sources: [{ label: "Vault configuration", href: HEALTH }],
  },
  {
    term: "Liquidation",
    definition:
      "A liquidation lets anyone repay part of a position's debt and receive collateral from it at a discount. The collateral is sold to repay the debt.",
    sources: [{ label: "Fluid liquidation swaps", href: LIQUIDATION }],
  },
  {
    term: "Maximum liquidation limit",
    definition:
      "The maximum liquidation limit is a share of collateral value above the liquidation threshold. A position with debt above it can have all of its debt liquidated.",
    sources: [{ label: "Vault configuration", href: HEALTH }],
  },
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "Listing",
    body: (
      <ul className={UL}>
        <li>Each row is one position, identified by its NFT id and its current owner.</li>
        <li>
          A row shows the position&apos;s collateral and debt in the vault&apos;s own tokens, with no dollar value.
        </li>
        <li>A row says whether the position is open or closed and whether it has been liquidated.</li>
      </ul>
    ),
  },
  {
    heading: "Position page",
    body: (
      <p>
        The position page shows the position&apos;s current collateral and debt, read from the blockchain. Its timeline
        lists every deposit, borrow, repayment, withdrawal and liquidation on the position.
      </p>
    ),
  },
  {
    heading: "Vaults page",
    body: (
      <p>
        The vaults page lists every vault Fluid has created. For each vault, it shows the borrow limit, the liquidation
        threshold and the maximum liquidation limit.{" "}
        <Link href="/ethereum/fluid/vaults" className={INLINE_LINK}>
          Open the vaults page to see every vault
        </Link>
        .
      </p>
    ),
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="fluid"
      tracks={
        <>
          The Rails Fluid explorer shows every borrowing position in Fluid&apos;s vaults on Ethereum, whether still open
          or closed, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/fluid/vaults" className={INLINE_LINK}>
            the vaults
          </Link>{" "}
          themselves, with the limits that decide when a position is liquidated.
        </>
      }
      notCovered="Fluid's deposit-and-earn lending, its DEX trading and its vaults on other blockchains aren't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          Fluid is a lending protocol. A <GlossaryLink term="Vault">vault</GlossaryLink> is a pool of one collateral
          token, the asset that backs a loan, that lets people borrow one other token. The debt is what the borrower
          owes. A <GlossaryLink term="Position">position</GlossaryLink> is one borrower&apos;s collateral and debt in a
          vault. It is an NFT, a token its owner holds, so it can move between wallets (account addresses).
        </>,
        <>
          The vault&apos;s <GlossaryLink term="Oracle">oracle</GlossaryLink> prices the collateral. Some vaults are{" "}
          <GlossaryLink term="Smart vault">smart vaults</GlossaryLink>: a side, collateral or debt, is held as shares of
          a DEX pool, an exchange&apos;s liquidity pool. Amounts on that side are then counted in pool shares, not
          tokens.
        </>,
        <>
          Each vault sets three limits, each a share of the collateral&apos;s value. The{" "}
          <GlossaryLink term="Borrow limit">borrow limit</GlossaryLink> is the most a position may borrow. The{" "}
          <GlossaryLink term="Liquidation threshold">liquidation threshold</GlossaryLink> is higher: debt above it can
          be liquidated. Above the{" "}
          <GlossaryLink term="Maximum liquidation limit">maximum liquidation limit</GlossaryLink>, all of the debt could
          be liquidated.
        </>,
        <>
          To <GlossaryLink term="Liquidation">liquidate</GlossaryLink> a position, anyone repays part of its debt and
          receives collateral at a discount. The position&apos;s collateral is sold to repay its debt, so the debt
          falls.
        </>,
      ]}
      views={views}
      search="You can search by owner wallet or NFT id. The listing filters by Status (open or closed), Debt (the amount borrowed), Vault kind (Standard pairs or Smart vaults), History (Liquidated before or Never liquidated) and Transactions (how many a position has), and sorts by Recent activity, Debt size, Collateral size or Event count."
      docs={{ label: "Fluid documentation", href: DOCS }}
    />
  );
}
