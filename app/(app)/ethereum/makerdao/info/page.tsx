// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary terms sit
// here; every source is the MakerDAO docs dump (rails-ops reference/official-docs/makerdao.md).

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("makerdao");

const UL = "list-disc space-y-1 pl-5";
const DOCS = "https://github.com/sky-ecosystem/mcd-docs-content/blob/master/smart-contract-modules";
const VAT = `${DOCS}/core-module/vat-detailed-documentation.md`;
const RATES = `${DOCS}/rates-module/README.md`;
const LIQUIDATIONS = `${DOCS}/dog-and-clipper-detailed-documentation.md`;
const OSM = `${DOCS}/oracle-module/oracle-security-module-osm-detailed-documentation.md`;
const SPOT = `${DOCS}/core-module/spot-detailed-documentation.md`;

const GLOSSARY: [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A vault is one borrower's position in Maker: crypto locked as collateral and the DAI or USDS borrowed against it. Each vault holds one collateral type, such as ETH-A, which is ETH with the risk setting A.",
    sources: [{ label: "Vat glossary", href: `${VAT}#glossary-vat---vault-engine` }],
  },
  {
    term: "Collateral",
    definition:
      "Collateral is the crypto asset a borrower locks in a vault as security for the debt. If the debt grows too large against it, the collateral is sold to repay the debt.",
    sources: [{ label: "Vat introduction", href: `${VAT}#1-introduction-summary` }],
  },
  {
    term: "Vat",
    definition:
      "The Vat is Maker's core accounting contract. It stores every vault and urn with the collateral and debt of each, and sets the rules for changing them.",
    sources: [{ label: "Vat introduction", href: `${VAT}#1-introduction-summary` }],
  },
  {
    term: "Stability fee",
    definition:
      "The stability fee is the interest on a vault's debt, at a rate governance sets for each collateral type. The fee is added only when someone triggers a rate update, so debt drawn and repaid between updates pays none.",
    sources: [
      { label: "Stability fee accumulation", href: `${RATES}#stability-fee-accumulation` },
      { label: "Who calls drip", href: `${RATES}#who-calls-drip` },
    ],
  },
  {
    term: "Collateral ratio",
    definition:
      "The collateral ratio is the collateral's value divided by the debt. Below the collateral type's minimum ratio the vault can be liquidated.",
    sources: [{ label: "Spot variables", href: `${SPOT}#variables` }],
  },
  {
    term: "Delayed price feed",
    definition:
      "The delayed price feed is the oracle price Maker acts on, one to two hours behind the market price. Values and ratios on this explorer use it, so a vault can look safer or riskier here than at the current market price.",
    sources: [{ label: "Oracle Security Module", href: `${OSM}#1-introduction` }],
  },
  {
    term: "Liquidation auction",
    definition:
      "A liquidation auction sells a seized vault's collateral for DAI at a price that falls over time, run by Maker's Clipper auction contract. The sale must cover the vault's debt plus the liquidation penalty, a charge added to that debt, and any collateral left over is returned to the vault.",
    sources: [
      { label: "Liquidation 2.0 module", href: `${LIQUIDATIONS}#1-introduction` },
      { label: "Clipper take", href: `${LIQUIDATIONS}#clippertake-performs-several-initial-checks` },
    ],
  },
  {
    term: "Urn",
    definition:
      "An urn is the Vat's record of one position's collateral and debt, kept under one address. A vault is an urn that also has a vault number, the id Rails shows for it; a LockStake urn has none.",
    sources: [{ label: "Vat glossary", href: `${VAT}#glossary-vat---vault-engine` }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="makerdao"
      name="MakerDAO"
      tracks={
        <>
          The Rails MakerDAO explorer shows every MakerDAO vault and every Sky LockStake urn on Ethereum, whether open,
          closed or liquidated, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/makerdao/system" className={INLINE_LINK}>
            the Vat&apos;s balance sheet
          </Link>
          : the debt and collateral of the whole system.
        </>
      }
      glossary={GLOSSARY}
      howItWorks={[
        <>
          MakerDAO, renamed Sky in 2024, lets people borrow DAI against crypto they lock up. DAI and USDS are
          stablecoins, tokens meant to hold a steady value, and they swap one for one through Sky&apos;s DAI-USDS
          converter. A borrower opens a <GlossaryLink term="Vault">vault</GlossaryLink>, locks{" "}
          <GlossaryLink term="Collateral">collateral</GlossaryLink> (crypto kept as security) in it, and draws (mints)
          DAI or USDS against it as debt.
        </>,
        <>
          The <GlossaryLink term="Vat">Vat</GlossaryLink> is Maker&apos;s core accounting contract, which records every
          vault&apos;s collateral and debt. Each vault pays a{" "}
          <GlossaryLink term="Stability fee">stability fee</GlossaryLink>, which is interest at a rate set by
          governance, the holders of Maker&apos;s governance token who vote on rules and rates.
        </>,
        <>
          When the <GlossaryLink term="Collateral ratio">collateral ratio</GlossaryLink> falls below the minimum for its
          collateral type, the vault is liquidated: its collateral is seized and sold in a{" "}
          <GlossaryLink term="Liquidation auction">liquidation auction</GlossaryLink> to repay the debt.
        </>,
        <>
          Values and ratios use the <GlossaryLink term="Delayed price feed">delayed price feed</GlossaryLink>, which
          lags the market by one to two hours. Sky&apos;s LockStake Engine adds a second kind of position, an{" "}
          <GlossaryLink term="Urn">urn</GlossaryLink> that holds SKY, Sky&apos;s token, as collateral and has no vault
          number.
        </>,
      ]}
      search="Search takes a wallet address (the account address of a person or contract), a vault number or a collateral type. The Status filter offers Open, Closed and Liquidated, and the Collateral type filter lists each collateral type. Sort offers Recent activity, Collateral (USD) and Debt."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>
                Each row is one vault or urn, and shows its collateral, its debt including accrued fees, and its status.
              </li>
              <li>The collateral ratio beside each debt is calculated from the delayed price feeds.</li>
              <li>Open positions show by default, and searching a wallet address shows positions of every status.</li>
            </ul>
          ),
        },
        {
          heading: "Vat balance sheet",
          body: (
            <p>
              This page shows the Vat&apos;s debt and collateral, split by collateral type.{" "}
              <Link href="/ethereum/makerdao/system" className={INLINE_LINK}>
                See the balance sheet of the Vat
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Vault page",
          body: (
            <>
              <p>
                The card shows the collateral, the debt including the stability fee, the collateral ratio and the owner.{" "}
                <Link href="/ethereum/makerdao/14012" className={INLINE_LINK}>
                  See an example vault
                </Link>
                . The Lifetime flows section totals what went into and out of the vault.
              </p>
              <p className="mt-2">
                The timeline lists every event of the vault, including what a liquidation&apos;s auction sold and handed
                back (
                <Link href="/ethereum/makerdao/24785" className={INLINE_LINK}>
                  an example
                </Link>
                ) and who the vault passed to (
                <Link href="/ethereum/makerdao/3772" className={INLINE_LINK}>
                  an example
                </Link>
                ).
              </p>
            </>
          ),
        },
        {
          heading: "LockStake urn page",
          body: (
            <>
              <p>
                A LockStake owner locks SKY and draws USDS through Sky&apos;s LockStake Engine. The engine creates a
                separate address, the urn, under which the Vat records the SKY and the debt, and an urn has no vault
                number.{" "}
                <Link href="/ethereum/makerdao/0xdfdb5d44f1c0b935c00e4fff6cbfd76c0db7e97c" className={INLINE_LINK}>
                  See an example urn
                </Link>
                .
              </p>
              <p className="mt-2">
                The owner chooses a farm, a contract that pays rewards for staked SKY, and a delegate, who gets the
                voting power the SKY carries in governance. Rails does not show those choices or reward claims.
                Governance can set an exit fee, a charge taken when SKY is withdrawn.
              </p>
              <p className="mt-2">
                Below the minimum ratio, an auction can sell the SKY only if governance has switched these auctions on.
                The urn page says whether they are on and shows the price cap, a ceiling governance sets on the SKY
                price used for the urn.
              </p>
            </>
          ),
        },
        {
          heading: "Sky Savings",
          body: (
            <p>
              <Link href="/ethereum/sky-savings" className={INLINE_LINK}>
                Sky Savings
              </Link>{" "}
              is a separate explorer for a savings product, not for vaults. It lists every wallet address holding sUSDS,
              with the interest each has earned.
            </p>
          ),
        },
      ]}
      docs={{
        label: "MakerDAO technical documentation",
        href: "https://github.com/sky-ecosystem/mcd-docs-content/blob/master/README.md",
      }}
    />
  );
}
