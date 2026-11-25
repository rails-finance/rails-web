// How Morpho's vault layer is built on one chain — /base/morpho/vaults/info and
// /ethereum/morpho/vaults/info (rails-ops ui-jobs 486), on the menu-led About
// layout (ProtocolInfoPage with a `layer`, ui-jobs 791): the intro, then a
// section for the roster and one for its holder listing, with the glossary in
// its column.
// ----------------------------------------------------------------------------
// The intro and the roster section are the roster's words, its census count
// with its receipt, and the vault's "?" concepts, which left the roster's head
// (ui-jobs 771: the roster opens on its read stamp alone). The positions
// section was the listing's "How this listing is built" drawer.
//
// THE THREE-BLOCKS ITEMS NAME NO FINALIZED BLOCK. This page reads no position
// and no overlay, so a number here would be a different request's answer
// wearing the listing's words. They state the mechanism instead, and the
// figure stays where it is read — on a position page, beside the cards it is
// about.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: the items about
// the vaults nobody has ever held and the ones that did not pass the
// completeness check are about the census. A census that does not answer
// leaves those unstated rather than stated emptily.
//
// SERVER-ONLY.

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoTerm,
  type InfoView,
  type MenuSection,
} from "@/components/shared/protocol-info-page";
import { Prov } from "@/components/shared/provenance";
import { hasUnpricedSentence, UnpricedSentence } from "@/components/vaults/unpriced-sentence";
import { loadMetaMorphoCensus } from "@/components/vaults/metamorpho-roster-page";
import { metaMorphoVaultRosterHref, metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { loadMetaMorphoVaultRoster, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { vaultDirectoryCensusProv } from "@/lib/morpho-base/vault-provenance";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { chainMeta } from "@/lib/shared/chains";
import { metaMorphoLead } from "@/lib/vaults/family-leads";
import { MORPHO_VAULT_V1_ROLES_DOCS } from "@/lib/vaults/family-docs";

const n = (v: number) => v.toLocaleString("en-US");

const UL = "list-disc space-y-1 pl-5";

const MORPHO_DOCS = "https://docs.morpho.org";
const MORPHO_VAULT_V2_DOCS = `${MORPHO_DOCS}/learn/concepts/vault-v2/`;
const MORPHO_ROLES_DOCS = `${MORPHO_DOCS}/curate/concepts/roles/`;
const MORPHO_MARKET_DOCS = `${MORPHO_DOCS}/learn/concepts/blue/#what-is-a-variable-rate-market`;

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A MetaMorpho vault is a pool that one curator runs. It takes deposits of one token and lends them into several Morpho Blue markets. Morpho's docs call it a Morpho Vault V1.",
    sources: [
      { label: "Morpho curation", href: `${MORPHO_DOCS}/curate/#introduction-to-curation` },
      { label: "Vaults V1 roles", href: MORPHO_VAULT_V1_ROLES_DOCS },
    ],
  },
  {
    term: "Market",
    definition:
      "A Morpho Blue market pairs one loan asset with one collateral token, isolated from every other market. A vault supplies the loan asset to the markets its curator picks.",
    sources: [{ label: "Markets", href: MORPHO_MARKET_DOCS }],
  },
  {
    term: "Curator",
    definition:
      "The curator is the one address that sets which markets a vault may supply and caps each one. Raising a cap or adding a market waits out a timelock.",
    sources: [{ label: "Curator", href: `${MORPHO_ROLES_DOCS}#curator-1` }],
  },
  {
    term: "Owner",
    definition:
      "The owner is the one address with full control of a vault. It appoints the curator and sets the performance fee.",
    sources: [{ label: "Owner", href: `${MORPHO_ROLES_DOCS}#owner-1` }],
  },
  {
    term: "Share price",
    definition:
      "The share price is what one share is worth in the vault's asset: the vault's answer to convertToAssets for one share. It rises as the markets pay interest.",
    sources: [
      {
        label: "Yield in Morpho Vaults V1",
        href: `${MORPHO_DOCS}/curate/concepts/yield/#yield-in-morpho-vaults-v1-legacy`,
      },
    ],
  },
  {
    // ui-jobs 664, VA9: the docs' V2, which this section does not list.
    term: "Vault V2",
    definition:
      "Morpho's docs name Morpho Vault V2 the primary vault surface and say “Morpho Vaults V1 are now legacy”.",
    sources: [{ label: "Vault V2", href: MORPHO_VAULT_V2_DOCS }],
  },
];

/** The chain's facts in the three-blocks view. */
const FINALIZED: Record<MetaMorphoChainId, string> = {
  8453: "on Base the tag steps in jumps, 643 to 795 blocks behind head.",
  1: "on Ethereum the tag moves 32 blocks at a time, about two epochs behind head.",
};

/** What the six-million-block window the sweep does not use spans on each chain. */
const WINDOW: Record<MetaMorphoChainId, string> = {
  8453: "139 days on Base",
  1: "about 833 days on Ethereum",
};

export async function MetaMorphoVaultsInfo({ chainId }: { chainId: MetaMorphoChainId }) {
  const [census, roster] = await Promise.all([loadMetaMorphoCensus(chainId), loadMetaMorphoVaultRoster(chainId)]);
  const chain = chainId === 1 ? "Ethereum" : "Base";
  const neverHeld = census.filter((c) => c.participants === 0).length;
  const unproven = census.filter((c) => !c.sumMatches);
  const censusBlock = census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null;
  const menu: readonly [MenuSection, ...MenuSection[]] = [
    { key: "roster", label: "Vault roster", href: metaMorphoVaultRosterHref(chainId) },
    { key: "positions", label: "Vault positions", href: metaMorphoVaultsListingHref(chainId) },
  ];

  const views: readonly [InfoView, ...InfoView[]] = [
    {
      heading: "The roster",
      section: "roster",
      body: (
        <div data-intro-roster>
          <p data-figure="directory-census">
            The roster is{" "}
            <Prov
              info={vaultDirectoryCensusProv(
                { chainId },
                { catalogSize: roster.vaults.length, censusBlock: roster.censusBlock },
              )}
            >
              the {n(roster.vaults.length)} vaults the two MetaMorpho factories had made on {chain} at block{" "}
              {n(roster.censusBlock)}
            </Prov>
            . Each was found from the creation event its factory emits.
          </p>
          <ul className={`mt-1.5 ${UL}`}>
            <li>The list is a floor: a vault deployed without a factory emits no creation event.</li>
            <li>A vault created after the census block joins when the census runs again.</li>
            <li>Names are read live, because a V1.1 owner can rename a vault.</li>
            <li>
              Each total and share price is read at the block the read stamp names, and re-read at most every five
              minutes.
            </li>
          </ul>
        </div>
      ),
    },
    {
      heading: "Reading the roster",
      section: "roster",
      body: (
        <ul className={UL} data-intro-figures>
          <li>
            Amounts are in each vault&rsquo;s asset. Nothing is priced in USD, so two assets are never ordered or added
            together.
          </li>
          <li>
            Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days, annualised simply, net of the
            fees taken inside the share. Rewards paid outside the share, such as MORPHO, are not in it.
          </li>
          <li>
            An empty vault answered zero to <code>totalAssets()</code>.
          </li>
          {censusBlock != null && (
            <li>
              Holders counts every address holding a share at census block {n(censusBlock)}. It is a floor, since one
              address is often a wrapper.
            </li>
          )}
        </ul>
      ),
    },
    {
      heading: "Who is on the listing",
      section: "positions",
      body: (
        <ul className={UL} data-intro-membership>
          <li>
            Membership comes only from the census: every address on either side of any <code>Transfer</code> a vault has
            emitted. The sweep runs from the vault&rsquo;s creation block, rather than a fixed window of six million
            blocks ({WINDOW[chainId]}).
          </li>
          <li>
            The sweep counts as complete when Σ <code>balanceOf</code> equals <code>totalSupply()</code> to the wei at
            the census block. A sweep that came back short fails, and the previous census stands.
          </li>
          <li>Transfers, first seen, last activity and the kind of holding address all come from that sweep.</li>
          {neverHeld > 0 && (
            <li data-intro-empty>
              {n(neverHeld)} of the {n(census.length)} catalogued vaults have never been held: the sweep found no{" "}
              <code>Transfer</code> in their whole life. The roster marks each &ldquo;no holder yet&rdquo;, and the
              vault filter leaves them out.
            </li>
          )}
          {unproven.length > 0 && (
            <li data-intro-unproven>
              {n(unproven.length)} vaults failed the Σ <code>balanceOf</code> check at the last sweep, so their holder
              sets are not stated as whole: {unproven.map((c) => c.symbol ?? c.vault).join(", ")}.
            </li>
          )}
        </ul>
      ),
    },
    {
      heading: "Three blocks",
      section: "positions",
      body: (
        <ul className={UL} data-intro-blocks>
          <li>The census block, stated on the listing, is when membership was swept.</li>
          <li>The block each card names is when its shares, claim and share of the vault were read.</li>
          <li>
            The chain&rsquo;s <code>finalized</code> block is the cut below which a position&rsquo;s history is stored.
            A position page states it beside the cards it was read with.
          </li>
          <li>How far it trails head varies: {FINALIZED[chainId]}</li>
        </ul>
      ),
    },
    {
      heading: "Value and sorting",
      section: "positions",
      body: (
        <ul className={UL} data-intro-sort>
          <li>
            A card&rsquo;s Value · USD is its balance at the census block, converted by the vault&rsquo;s{" "}
            <code>convertToAssets</code>. The chain&rsquo;s Aave V3 oracle (<code>IAaveOracle.getAssetPrice</code>)
            prices it at the same block, and the receipt names both.
          </li>
          <li>
            The daily census computes it once, so it is what a position was worth at that block and says nothing about
            now.
          </li>
          {hasUnpricedSentence(census) && (
            <li>
              <UnpricedSentence census={census} />
            </li>
          )}
          <li>
            The Size filter&rsquo;s brackets are whole-dollar lower bounds on that value. Its Unpriced option is the
            rows the oracle declined.
          </li>
          <li>
            Sorting by share of the vault compares across vaults: each balance over its vault&rsquo;s supply at the
            census block.
          </li>
          <li>
            Sorting by shares orders raw balances in each vault&rsquo;s units. A share token&rsquo;s{" "}
            <code>decimals()</code> is its asset&rsquo;s plus the factory&rsquo;s offset, so raw counts do not compare
            across vaults.
          </li>
        </ul>
      ),
    },
  ];

  const layerTitle = `About MetaMorpho vaults on ${chainMeta(chainId).name}`;
  return (
    <ProtocolInfoPage
      session={chainId === 1 ? "morpho" : "morpho-base"}
      layer={{ title: layerTitle, menu }}
      tracks={
        <>
          {metaMorphoLead(chainId)} The{" "}
          <Link href={metaMorphoVaultsListingHref(chainId)} className={INLINE_LINK} prefetch={false}>
            positions listing
          </Link>{" "}
          names every address holding a share in one of them.
        </>
      }
      glossary={glossary}
      howItWorks={[
        <>
          A MetaMorpho <GlossaryLink term="Vault">vault</GlossaryLink> pools one asset and lends it across the Morpho
          Blue <GlossaryLink term="Market">markets</GlossaryLink> its{" "}
          <GlossaryLink term="Curator">curator</GlossaryLink> chooses. A holder owns shares, and a share buys back more
          of the asset as those markets pay interest.
        </>,
        <>
          The curator picks the markets and caps each one. The <GlossaryLink term="Owner">owner</GlossaryLink> can
          replace the curator and sets the fee.
        </>,
        <>
          A vault&rsquo;s total assets include interest up to the block read. Morpho Blue books interest only when a
          market is touched, so the sum the vault has allocated trails it.
        </>,
        <>
          On a V1.1 vault, lost assets are assets no market holds after a loss. The{" "}
          <GlossaryLink term="Share price">share price</GlossaryLink> is not lowered for them.
        </>,
      ]}
      views={views}
      search={
        <span data-intro-search>
          The search matches an address, or part of one, against the holder. An address the census has never seen has no
          row here. The listing records nothing about the search.
        </span>
      }
      guide={false}
      notCovered="Morpho Vault V2 isn't listed here."
      docs={{ label: "Morpho documentation", href: `${MORPHO_DOCS}/` }}
    />
  );
}
