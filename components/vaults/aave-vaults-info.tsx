// How Aave's vault layer on Ethereum is built — /ethereum/aave-v3/vaults/info,
// the page app/(app)/ethereum/aave-v3/vaults/(views)/info/page.tsx draws, on the
// menu-led About layout (ProtocolInfoPage with a `layer`, ui-jobs 791): the
// intro, then a section for the roster and one for its holder listing, then
// Aave's pages, with the glossary in its column.
// ----------------------------------------------------------------------------
// Linked from the Vaults section of Aave V3's About page. The intro is the
// roster's words and Aave's three families; the positions section was the
// listing's "How this listing is built" drawer.
//
// THE CATALOGUE COUNT IS A CHAIN READ: what Aave's enumerators answer at a
// block. The page asks the roster's loader, which caches a good read for five
// minutes; a failed read is re-read on every request until its cache entry
// expires, and while it fails the count is stated as not read and the prose
// stands.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: three of the
// items are about the census — which vaults nobody has ever held, which did
// not pass the completeness check, which assets the oracle declined — and each
// names the block the sweep ran to. A census that does not answer leaves those
// three unstated rather than stated emptily; the rest of the page is about the
// section's rules and stands either way.
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
import { AaveFirstPartySources } from "@/components/vaults/aave-first-party-sources";
import { Prov } from "@/components/shared/provenance";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { aaveVaultCatalogueProv } from "@/lib/aave-vaults/vault-provenance";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { ethereumVaultRosterHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { AAVE_VAULTS_LEAD } from "@/lib/vaults/family-leads";
import { hasUnpricedSentence, UnpricedSentence } from "@/components/vaults/unpriced-sentence";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

/** The page's metadata; the route exports it. */
export const AAVE_VAULTS_INFO_METADATA = listingMetadata({
  title: "About the Vaults section on Ethereum",
  canonicalPath: "/ethereum/aave-v3/vaults/info",
  description:
    "What Aave's three vault families are and how Rails lists them on Ethereum: the roster read from Aave's enumerators at one block, what is outside it and what its figures leave out; then the vault position listing: membership from a whole-Transfer census proven complete by Σ balanceOf, the one priced figure and the block it was priced at, the vaults nobody has ever held, and what the search does and does not do.",
});

const n = (v: number) => v.toLocaleString("en-US");

const UL = "list-disc space-y-1 pl-5";

const AAVE_TOKENIZATION_DOCS = "https://aave.com/docs/aave-v3/smart-contracts/tokenization";
const AAVE_UMBRELLA_DOCS = "https://aave.com/docs/aave-v3/umbrella";
const AAVE_SGHO_DOCS = "https://aave.com/docs/ecosystem/gho/sgho";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A vault takes deposits of one token and issues shares for them, on the ERC-4626 standard. A share is a claim on part of what the vault holds.",
    sources: [{ label: "Tokenization", href: AAVE_TOKENIZATION_DOCS }],
  },
  {
    term: "Share price",
    definition:
      "The share price is what one share is worth in the vault's asset: the vault's answer to convertToAssets for one share.",
    sources: [{ label: "Tokenization", href: AAVE_TOKENIZATION_DOCS }],
  },
  {
    term: "Savings GHO",
    definition: "Savings GHO (sGHO) is Aave's ERC-4626 savings vault over GHO, the one vault of its family.",
    sources: [{ label: "sGHO", href: AAVE_SGHO_DOCS }],
  },
  {
    term: "aToken",
    definition:
      "An aToken is the token Aave V3 issues for a supply position. Its balance grows as the reserve earns interest.",
    sources: [{ label: "Tokenization", href: AAVE_TOKENIZATION_DOCS }],
  },
  {
    // ui-jobs 664, VA7: the docs' word for the page's "Static aToken".
    term: "Static aToken",
    definition:
      "Aave's docs call a static aToken a StataToken: “ERC-4626 compliant tokens that wrap Aave's aTokens to provide a non-rebasing yield accrual mechanism”.",
    sources: [{ label: "Tokenization", href: AAVE_TOKENIZATION_DOCS }],
  },
  {
    term: "Umbrella stake token",
    definition:
      "Umbrella is Aave's staking layer. Each stake token covers one reserve: if the reserve runs a deficit, its stakers' tokens are slashed to pay it.",
    sources: [
      { label: "Umbrella", href: AAVE_UMBRELLA_DOCS },
      { label: "What is Umbrella", href: "https://aave.com/help/umbrella/umbrella#what-is-umbrella" },
    ],
  },
  {
    term: "Cooldown",
    definition:
      "The cooldown is the wait between asking to redeem a stake token and the window in which it can be redeemed.",
    sources: [{ label: "Umbrella", href: AAVE_UMBRELLA_DOCS }],
  },
];

/** The census header alone — one row per catalogued vault, no live overlay and
 *  one position row, because nothing on this page is about a position. An
 *  unanswered census is an empty header, and the items that rest on it
 *  simply do not appear. */
async function loadCensus(): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId: MAINNET_CHAIN_ID, overlay: false, limit: 1, ...hop });
    return r.census;
  } catch (error) {
    console.error("The vault census did not answer for the Ethereum section's about page:", error);
    return [];
  }
}

/** The layer's pages, each a section of this page. */
const MENU: readonly [MenuSection, ...MenuSection[]] = [
  { key: "roster", label: "Vault roster", href: ethereumVaultRosterHref() },
  { key: "positions", label: "Vault positions", href: ethereumVaultsListingHref() },
];

export async function AaveVaultsInfo() {
  const [census, data] = await Promise.all([loadCensus(), loadAaveEthereumVaultDirectory()]);
  const coords = { blockNumber: data.blockNumber || undefined, readBy: serverReadOf(data) };
  const censusBlock = census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null;
  const empty = census.filter((c) => c.participants === 0);
  const unproven = census.filter((c) => !c.sumMatches);

  const views: readonly [InfoView, ...InfoView[]] = [
    {
      heading: "The roster",
      section: "roster",
      body: (
        <div data-intro-roster>
          <p data-figure="directory-catalogue">
            {data.chainStale ? (
              <>
                One row is one vault: savings GHO, the static aTokens <code>getStataTokens()</code> returns and the
                stake tokens <code>getStkTokens()</code> returns. Aave&rsquo;s contracts were not read just now, so the
                count is not stated.
              </>
            ) : (
              <>
                One row is one vault.{" "}
                <Prov info={aaveVaultCatalogueProv(coords, data)}>
                  Aave&rsquo;s contracts name {n(data.catalogSize)} vaults at block {n(data.blockNumber)}
                </Prov>
                : savings GHO, {n(data.stataCount)} static aTokens from <code>getStataTokens()</code> and{" "}
                {n(data.stakeCount)} stake tokens from <code>getStkTokens()</code>.
              </>
            )}
          </p>
          <ul className={`mt-1.5 ${UL}`}>
            <li>Each call returns its whole family, so the list is complete at its block.</li>
            <li>
              Outside it: Aave&rsquo;s deployments on other chains, the legacy static-aToken factory, and any ERC-4626
              Aave has not published.
            </li>
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
          <li>Amounts are in each vault&rsquo;s asset. Nothing is priced in USD.</li>
          <li>
            Three of the four stake tokens hold a static aToken, so their amounts are in that wrapper&rsquo;s units.
          </li>
          <li>A static aToken holding nothing still shows a share price above one: the reserve&rsquo;s index.</li>
          <li>
            Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days, annualised simply.
            Umbrella&rsquo;s rewards are paid outside the share and are not in it.
          </li>
          {censusBlock != null && (
            <li>Holders counts every address holding a share at census block {n(censusBlock)}.</li>
          )}
          <li>The deposit cap, the wrapped aToken and the cooldown are on each vault&rsquo;s page.</li>
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
            emitted, swept whole.
          </li>
          <li>
            The sweep counts as complete when Σ <code>balanceOf</code> equals <code>totalSupply()</code> to the wei at
            the census block. A sweep that came back short fails, and the previous census stands.
          </li>
          <li>Transfers, first seen, last activity and the kind of holding address all come from that sweep.</li>
          {empty.length > 0 && (
            <li data-intro-empty>
              {empty.length === 1 ? "One catalogued vault has" : `${n(empty.length)} catalogued vaults have`} never been
              held as of block {n(empty[0].censusBlock)}:{" "}
              {empty.map((c, i) => (
                <span key={c.vault} data-empty-vault={c.vault}>
                  {i > 0 ? (i === empty.length - 1 ? " and " : ", ") : ""}
                  {c.symbol ?? c.vault}
                </span>
              ))}
              . The sweep returned no logs for them.
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
      heading: "Value and sorting",
      section: "positions",
      body: (
        <ul className={UL} data-intro-sort>
          <li>
            A card&rsquo;s Value · USD is its balance at the census block, converted by the vault&rsquo;s{" "}
            <code>convertToAssets</code>. Aave V3&rsquo;s oracle on Ethereum (<code>IAaveOracle.getAssetPrice</code>)
            prices it at the same block, and the receipt names both.
          </li>
          <li>
            The daily census computes it once, so it is what a position was worth at that block and says nothing about
            now.
          </li>
          <li>
            A stake token holds a static aToken, which the oracle does not price directly. The census prices the
            wrapper&rsquo;s underlying and converts through the wrapper, and the receipt states the hop.
          </li>
          {/* An empty <li> would draw a bare bullet: the sentence renders only
              when some held vault is unpriced, so the item is guarded on the
              same census rows. */}
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
            Sorting by shares orders raw balances in each vault&rsquo;s units (6, 8 and 18 decimals here), which do not
            compare across vaults.
          </li>
        </ul>
      ),
    },
  ];

  return (
    <ProtocolInfoPage
      session="aave-v3"
      layer={{ title: "About the Vaults section", menu: MENU }}
      tracks={
        <>
          {AAVE_VAULTS_LEAD} The{" "}
          <Link href={ethereumVaultsListingHref()} className={INLINE_LINK} prefetch={false}>
            positions listing
          </Link>{" "}
          names every address holding a share in one of them.
        </>
      }
      glossary={glossary}
      howItWorks={[
        <>
          <GlossaryLink term="Savings GHO">Savings GHO</GlossaryLink> is one{" "}
          <GlossaryLink term="Vault">vault</GlossaryLink> over GHO. A holder&rsquo;s shares grow with a stored yield
          index, and withdrawals are capped at the GHO the contract holds.
        </>,
        <>
          A <GlossaryLink term="Static aToken">static aToken</GlossaryLink> wraps one Aave V3{" "}
          <GlossaryLink term="aToken">aToken</GlossaryLink>. Its shares are a non-rebasing claim on a supply position,
          and its <GlossaryLink term="Share price">share price</GlossaryLink> is the reserve&rsquo;s accrued index.
        </>,
        <>
          An <GlossaryLink term="Umbrella stake token">Umbrella stake token</GlossaryLink> is staked against one
          reserve&rsquo;s deficit. Umbrella can slash it to cover the deficit, which lowers every holder&rsquo;s share
          price at once. Redemption runs through a <GlossaryLink term="Cooldown">cooldown</GlossaryLink> and then a
          window.
        </>,
        // THE TRAP, SAID ONCE. The two layers hold the same assets, and the
        // only place that can be said without repeating it on every card is
        // here. Each vault page states its half of the relationship (`backedBy`
        // in lib/sources/chain/aave-ethereum-vault.ts, and the hop in the other
        // direction on a stake token's page).
        <span key="layers" data-intro-layers>
          An Umbrella stake token holds a static aToken. The wrapper&rsquo;s holding and the stake token&rsquo;s holders
          are then the same assets at two heights, so a reader must not add them together. Nothing here sums them: each
          static aToken&rsquo;s page names the stake token that holds it, and each stake token&rsquo;s page names its
          wrapper.
        </span>,
      ]}
      views={views}
      search={
        <span data-intro-search>
          The search matches an address, or part of one, against the holder. An address the census has never seen has no
          row here. The listing records nothing about the search.
        </span>
      }
      guide={false}
      sources={<AaveFirstPartySources />}
      docs={{ label: "Aave V3 tokenization", href: AAVE_TOKENIZATION_DOCS }}
    />
  );
}
