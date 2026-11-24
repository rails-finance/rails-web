// focus: the explorer's explainer; the shell's gate stands over the explorer
// How Aave's vault layer on Ethereum is built — /ethereum/aave/vaults/info.
// ----------------------------------------------------------------------------
// The (i) in the section rail. The first paragraphs are the roster's words and
// its catalogue count, which left the roster's head (ui-jobs 771: the roster
// opens on its read stamp alone), and Aave's pages; the rest were the
// listing's "How this listing is built" drawer.
//
// THE CATALOGUE COUNT IS A CHAIN READ: what Aave's enumerators answer at a
// block. The page asks the roster's loader, which caches a good read for five
// minutes; a failed read is re-read on every request until its cache entry
// expires, and while it fails the count is stated as not read and the prose
// stands.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: three of the
// paragraphs are about the census itself — which vaults nobody has ever held,
// which did not pass the completeness check, which assets the oracle declined —
// and each names the block the sweep ran to. A census that does not answer
// leaves those three unstated rather than stated emptily; the rest of the page
// is about the section's rules and stands either way.

import Link from "next/link";
import { INFO_H2, INFO_UL, VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { AaveFirstPartySources } from "@/components/vaults/aave-first-party-sources";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { aaveVaultCatalogueProv } from "@/lib/aave-vaults/vault-provenance";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { AAVE_VAULTS_LEAD } from "@/lib/vaults/family-leads";
import { hasUnpricedSentence, UnpricedSentence } from "@/components/vaults/unpriced-sentence";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "About the Vaults section on Ethereum",
  canonicalPath: "/ethereum/aave/vaults/info",
  description:
    "What Aave's three vault families are and how Rails lists them on Ethereum: the roster read from Aave's enumerators at one block, what is outside it and what its figures leave out; then the vault position listing: membership from a whole-Transfer census proven complete by Σ balanceOf, the one priced figure and the block it was priced at, the vaults nobody has ever held, and what the search does and does not do.",
});

const n = (v: number) => v.toLocaleString("en-US");

const AAVE_TOKENIZATION_DOCS = "https://aave.com/docs/aave-v3/smart-contracts/tokenization";

/** The census header alone — one row per catalogued vault, no live overlay and
 *  one position row, because nothing on this page is about a position. An
 *  unanswered census is an empty header, and the paragraphs that rest on it
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

export default async function EthereumVaultsInfoPage() {
  const [census, data] = await Promise.all([loadCensus(), loadAaveEthereumVaultDirectory()]);
  const coords = { blockNumber: data.blockNumber || undefined, readBy: serverReadOf(data) };
  const censusBlock = census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null;
  const empty = census.filter((c) => c.participants === 0);
  const unproven = census.filter((c) => !c.sumMatches);

  return (
    <VaultsInfoPage chainId={MAINNET_CHAIN_ID} protocol={protocolForHref("/ethereum/aave")!}>
      <p>
        {AAVE_VAULTS_LEAD} The{" "}
        <Link href={ethereumVaultsListingHref()} className={INLINE_LINK} prefetch={false}>
          positions listing
        </Link>{" "}
        names every address holding a share in one of them.
      </p>

      <section data-intro-vault>
        <h2 className={INFO_H2}>The three families</h2>
        <ul className={INFO_UL}>
          <li>
            Savings GHO is one vault over GHO. A holder&rsquo;s shares grow with a stored yield index, and withdrawals
            are capped at the GHO the contract holds.
          </li>
          <li>
            A static aToken wraps one Aave V3 aToken. Its shares are a non-rebasing claim on a supply position, and its
            share price is the reserve&rsquo;s accrued index.
          </li>
          {/* ui-jobs 664, VA7: the docs' word for the page's "Static aToken". */}
          <li data-intro-glossary>
            <a href={AAVE_TOKENIZATION_DOCS} target="_blank" rel="noopener" className="link-external">
              Aave&rsquo;s docs
            </a>{" "}
            call a static aToken a StataToken: &ldquo;ERC-4626 compliant tokens that wrap Aave&rsquo;s aTokens to
            provide a non-rebasing yield accrual mechanism&rdquo;.
          </li>
          <li>
            An Umbrella stake token is staked against one reserve&rsquo;s deficit. Umbrella can slash it to cover the
            deficit, which lowers every holder&rsquo;s share price at once. Redemption runs through a cooldown and then
            a window.
          </li>
        </ul>
      </section>

      <section data-intro-roster>
        <h2 className={INFO_H2}>The roster</h2>
        <p className="mt-1.5" data-figure="directory-catalogue">
          {data.chainStale ? (
            <>
              One row is one vault: savings GHO, the static aTokens <code>getStataTokens()</code> returns and the stake
              tokens <code>getStkTokens()</code> returns. Aave&rsquo;s contracts were not read just now, so the count is
              not stated.
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
        <ul className={INFO_UL}>
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
      </section>

      <section data-intro-figures>
        <h2 className={INFO_H2}>Reading the roster</h2>
        <ul className={INFO_UL}>
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
      </section>

      {/* THE TRAP, SAID ONCE. The two layers hold the same assets, and the only
          place that can be said without repeating it on every card is here.
          Each vault page states its own half of the relationship (`backedBy` in
          lib/sources/chain/aave-ethereum-vault.ts, and the hop in the other
          direction on a stake token's page). */}
      <section data-intro-layers>
        <h2 className={INFO_H2}>Two layers, one set of assets</h2>
        <p className="mt-1.5">
          An Umbrella stake token holds a static aToken. The wrapper&rsquo;s holding and the stake token&rsquo;s holders
          are then the same assets at two heights, so a reader must not add them together.
        </p>
        <p className="mt-2">
          Nothing here sums them. Each static aToken&rsquo;s page names the stake token that holds it, and each stake
          token&rsquo;s page names its wrapper.
        </p>
      </section>

      <section data-intro-membership>
        <h2 className={INFO_H2}>Who is on the positions listing</h2>
        <ul className={INFO_UL}>
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
      </section>

      <section data-intro-sort>
        <h2 className={INFO_H2}>Value and sorting</h2>
        <ul className={INFO_UL}>
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
      </section>

      <section data-intro-search>
        <h2 className={INFO_H2}>Search</h2>
        <p className="mt-1.5">
          The search matches an address, or part of one, against the holder. An address the census has never seen has no
          row here. The listing records nothing about the search.
        </p>
      </section>

      <AaveFirstPartySources />
      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}
