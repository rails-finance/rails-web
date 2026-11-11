// About this explorer: Euler V2 on Base or Arbitrum, drawn on the typed template
// (rails-ops standards/info-page-template.md). The contracts in "How Rails reads it"
// are the ones rails-server's euler-at-block.ts reads.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReadContract,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { EULER_CONTRACTS, EULER_DOLLARS, EULER_INDEXED, EULER_SESSION, type EulerChainId } from "@/lib/euler/types";
import { CHAIN_NAME } from "@/lib/euler/words";
import { explorerHref } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const DOCS = { label: "Euler documentation", href: "https://docs.euler.finance" };
const UL = "list-disc space-y-1 pl-5";
/** Vaults the factory had deployed on 10 Nov 2026. */
const VAULTS: Record<EulerChainId, number> = { 8453: 457, 42161: 193 };

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "An Euler vault holds one asset. Depositors receive shares that redeem for more of the asset as borrowers pay interest, and borrowers take the asset against collateral in other vaults.",
    sources: [DOCS],
  },
  {
    term: "Ethereum Vault Connector",
    definition:
      "The Ethereum Vault Connector (EVC) records, for each account, the vaults it has enabled as collateral and the vault it borrows from.",
    sources: [DOCS],
  },
  {
    term: "Account",
    definition:
      "Each wallet has 256 accounts. Account 0 is the wallet's address; each other account is the address with its last byte changed. Each account's loan and collateral stand apart from the others'.",
    sources: [DOCS],
  },
  {
    term: "Controller",
    definition:
      "The vault an account borrows from. While the account owes it, it decides whether the account may move its collateral.",
    sources: [DOCS],
  },
  {
    term: "Unit of account",
    definition:
      "The unit a vault prices its loan and collateral in, through its oracle router. Many vaults use US dollars; some use a token such as WETH.",
    sources: [DOCS],
  },
  {
    term: "Liquidation LTV",
    definition:
      "The share of a collateral's value a vault counts toward a loan before it can be liquidated. A loan's health is the collateral counted this way over the debt.",
    sources: [DOCS],
  },
];

const howItWorks: readonly [ReactNode, ...ReactNode[]] = [
  <>
    A depositor puts an asset into a <GlossaryLink term="Vault">vault</GlossaryLink> and receives shares. Each share
    redeems for more of the asset as borrowers pay interest.
  </>,
  <>
    A borrower enables vaults as collateral on one of its <GlossaryLink term="Account">accounts</GlossaryLink>, then
    borrows from another vault, which becomes the account&apos;s{" "}
    <GlossaryLink term="Controller">controller</GlossaryLink>. The{" "}
    <GlossaryLink term="Ethereum Vault Connector">connector</GlossaryLink> keeps both lists.
  </>,
  <>
    The controller values the collateral and the debt in its{" "}
    <GlossaryLink term="Unit of account">unit of account</GlossaryLink>. When the collateral counted at each
    vault&apos;s <GlossaryLink term="Liquidation LTV">liquidation LTV</GlossaryLink> falls below the debt, the loan can
    be liquidated.
  </>,
  EULER_DOLLARS ? (
    <>Rails shows dollars where a vault&apos;s unit of account is US dollars, and the unit&apos;s token otherwise.</>
  ) : (
    <>Rails states each figure in its asset, and a value in the unit&apos;s token where that unit is a token.</>
  ),
];

function views(chain: EulerChainId): readonly [InfoView, ...InfoView[]] {
  return [
    {
      heading: "A wallet's accounts",
      body: (
        <>
          <p>
            Enter a wallet address or ENS name on the{" "}
            <Link href={explorerHref(chain, "euler-v2")} className={INLINE_LINK}>
              front door
            </Link>{" "}
            to see that wallet&apos;s Euler accounts on {CHAIN_NAME[chain]}.
          </p>
          <ul className={`${UL} mt-2`}>
            <li>Every account that borrows, or has a deposit enabled as collateral, is found on all 256 accounts.</li>
            {EULER_INDEXED[chain] ? (
              <li>
                A deposit not used as collateral is found on every account, from Rails&apos;s index of Euler on{" "}
                {CHAIN_NAME[chain]}.
              </li>
            ) : (
              <li>A deposit not used as collateral is found on account 0, the wallet&apos;s own address.</li>
            )}
            <li>
              Each row names what the account supplies or borrows, in which vault, and opens that holding&apos;s page.
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: "Holding page",
      body: (
        <p>
          A deposit&apos;s page shows what its shares redeem for, what the share price added over the last 30 days, and
          the loan it backs. A loan&apos;s page shows the debt, the collateral&apos;s value, the loan&apos;s health and
          the interest over the last 30 days, with each collateral on a row. Under the card, the vault&apos;s totals,
          its utilisation and rates, and its oracle&apos;s price.
        </p>
      ),
    },
  ];
}

function reads(chain: EulerChainId): InfoReads {
  const c = EULER_CONTRACTS[chain];
  const contracts: [InfoReadContract, ...InfoReadContract[]] = [
    {
      name: "Ethereum Vault Connector",
      address: c.evc,
      reads:
        "each account's collateral vaults and the vault it borrows from, for all 256 of a wallet's accounts; and an account's owner.",
    },
    {
      name: "Vault factory",
      address: c.factory,
      reads: `the list of every vault it deployed (${VAULTS[chain]} on 10 Nov 2026), and whether a vault is one of them.`,
    },
    {
      name: "Each vault",
      reads:
        "an account's shares and debt, what shares redeem for, its interest index and rate, its totals, its unit of account and oracle, and its liquidation LTV for each collateral; and the wallet's shares on account 0, for every vault.",
    },
    {
      name: "Each oracle router",
      reads: "the price of the vault's asset, and of each collateral, in the vault's unit of account.",
    },
    { name: "Each token", reads: "its symbol and decimals." },
  ];
  return {
    contracts,
    how: EULER_INDEXED[chain]
      ? `Rails indexes every vault's and the connector's events on ${CHAIN_NAME[chain]} from Euler's deployment. A wallet's deposits on all 256 accounts come from that index, and each is read again at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final.`
      : "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back. Finding a wallet's accounts is one batch of about a thousand calls. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.",
    notes: EULER_INDEXED[chain]
      ? []
      : [
          "A deposit not enabled as collateral is visible only in the vault's own balance, so finding it on every account would take a balance call per vault for each of 256 accounts. Rails reads it on account 0 only.",
        ],
  };
}

export function EulerInfoPage({ chain }: { chain: EulerChainId }) {
  return (
    <ProtocolInfoPage
      session={EULER_SESSION[chain]}
      tracks={
        <>
          The Rails Euler V2 explorer shows a wallet&apos;s Euler accounts on {CHAIN_NAME[chain]}: each loan with its
          collateral and health, and each deposit, with what the vault paid or charged over the last 30 days.
        </>
      }
      notCovered="Euler Earn, EulerSwap and Euler's rewards aren't covered here."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads(chain)}
      views={views(chain)}
      docs={DOCS}
    />
  );
}
