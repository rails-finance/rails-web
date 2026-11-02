// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary terms sit
// here; every source is the MakerDAO docs dump (rails-ops reference/official-docs/makerdao.md).

import Link from "next/link";
import { ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
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
      "One borrower's position: collateral locked in it and the DAI or USDS drawn against it. Each vault holds one collateral type, such as ETH-A.",
    sources: [{ label: "Vat glossary", href: `${VAT}#glossary-vat---vault-engine` }],
  },
  {
    term: "Vat",
    definition:
      "Maker's core accounting contract. It records every vault's collateral and debt and sets the rules for changing them.",
    sources: [{ label: "Vat introduction", href: `${VAT}#1-introduction-summary` }],
  },
  {
    term: "Stability fee",
    definition:
      "The interest on a vault's debt, set by governance for each collateral type. It is booked when the rate is next updated, so debt drawn and repaid between updates pays none.",
    sources: [
      { label: "Stability fee accumulation", href: `${RATES}#stability-fee-accumulation` },
      { label: "Who calls drip", href: `${RATES}#who-calls-drip` },
    ],
  },
  {
    term: "Collateral ratio",
    definition:
      "The collateral's value divided by the debt. Below the collateral type's minimum ratio the vault can be liquidated.",
    sources: [{ label: "Spot variables", href: `${SPOT}#variables` }],
  },
  {
    term: "Delayed price feed",
    definition:
      "The oracle price Maker acts on, one to two hours behind the market price. Values and ratios on this explorer use it.",
    sources: [{ label: "Oracle Security Module", href: `${OSM}#1-introduction` }],
  },
  {
    term: "Liquidation auction",
    definition:
      "The sale of a seized vault's collateral for DAI, at a price that falls over time. Collateral left after the debt and penalty are covered goes back to the vault.",
    sources: [
      { label: "Liquidation 2.0 module", href: `${LIQUIDATIONS}#1-introduction` },
      { label: "Clipper take", href: `${LIQUIDATIONS}#clippertake-performs-several-initial-checks` },
    ],
  },
  {
    term: "Urn",
    definition:
      "The Vat's record of one position's collateral and debt, held under an address. A vault is an urn with a vault number; a LockStake urn has none.",
    sources: [{ label: "Vat glossary", href: `${VAT}#glossary-vat---vault-engine` }],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="makerdao"
      name="MakerDAO"
      tracks="Every MakerDAO vault and every Sky LockStake urn on Ethereum, open, closed or liquidated, with its history, and the Vat's balance sheet. Farm and delegate choices and reward claims are not shown."
      glossary={GLOSSARY}
      howItWorks={[
        "A borrower locks collateral in a vault and draws DAI against it. MakerDAO renamed itself Sky in 2024 and now also mints USDS, and the two swap one for one through Sky's DAI-USDS converter.",
        "A vault pays a stability fee, with a rate governance sets for each collateral type.",
        "Below the collateral type's minimum ratio the vault is liquidated and its collateral is sold at auction.",
      ]}
      search="Search takes a wallet address, a vault number or a collateral type. Filters: status (open, closed, liquidated) and collateral type. Sort: recent activity, collateral, debt."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>One row per vault or urn: its collateral, its debt with accrued fees, and its status.</li>
              <li>The collateral ratio beside each debt uses the delayed price feeds.</li>
              <li>Open positions show by default. Searching a wallet shows every status.</li>
            </ul>
          ),
        },
        {
          heading: "Vat balance sheet",
          body: (
            <p>
              The Vat&apos;s debt and collateral, split by collateral type.{" "}
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
                The card states the{" "}
                <Link href="/ethereum/makerdao/14012" className={INLINE_LINK}>
                  collateral, debt with the stability fee in it, and collateral ratio
                </Link>{" "}
                and the owner. Lifetime flows adds up what went in and out.
              </p>
              <p className="mt-2">
                The timeline lists every event, including{" "}
                <Link href="/ethereum/makerdao/24785" className={INLINE_LINK}>
                  what a liquidation&apos;s auction sold and handed back
                </Link>{" "}
                and{" "}
                <Link href="/ethereum/makerdao/3772" className={INLINE_LINK}>
                  who the vault passed to
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          heading: "LockStake urn page",
          body: (
            <>
              <p>
                A LockStake owner locks SKY and draws USDS through Sky&apos;s LockStake Engine. The engine makes a
                separate address, the urn, for the Vat to record the SKY and the debt under, and an urn has no vault
                number.{" "}
                <Link href="/ethereum/makerdao/0xdfdb5d44f1c0b935c00e4fff6cbfd76c0db7e97c" className={INLINE_LINK}>
                  See an example urn
                </Link>
                .
              </p>
              <p className="mt-2">
                The engine stakes the SKY in a farm and passes its voting power to a delegate, both chosen by the owner.
                Governance can set an exit fee on SKY taken out.
              </p>
              <p className="mt-2">
                Below the minimum ratio an auction can sell the SKY. The urn page says whether governance has these
                auctions switched on and the price cap it has set on SKY.
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
              is a separate explorer. It lists every address holding sUSDS, with the interest each has earned.
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
