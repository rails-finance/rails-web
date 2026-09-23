// How Morpho's vault layer on Base is built — /base/morpho/vaults/info.
// ----------------------------------------------------------------------------
// Reached from the roster above it, and the twin of the Ethereum page beside
// it. These paragraphs were the listing's "How this listing is built" drawer: a
// panel that was always mounted and merely hidden, because what it says is true
// of the section whether or not anyone opens it. That is a page, so it is one.
//
// THE THREE-BLOCKS PARAGRAPH NAMES NO FINALIZED BLOCK. In the drawer it could:
// the drawer rode the same response as the cards, so the distance it stated was
// the one the lane answered as those cards were read. This page reads no
// position and no overlay, so a number here would be a different request's
// answer wearing the listing's words. It states the mechanism instead, and the
// figure stays where it is read — on a position page, beside the cards it is
// about.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: the paragraphs
// about the vaults nobody has ever held, the ones that did not pass the
// completeness check and the assets the oracle declined are all about the
// census itself. A census that does not answer leaves those unstated rather
// than stated emptily.

import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { UnpricedSentence } from "@/components/vaults/unpriced-sentence";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "About MetaMorpho vaults on Base",
  canonicalPath: "/base/morpho/vaults/info",
  description:
    "How Rails builds the vault position listing on Base: membership from a whole-Transfer census swept from each vault's own creation block and proven complete by Σ balanceOf, the three blocks the section reads at, the one priced figure, and what the search does and does not do.",
});

const n = (v: number) => v.toLocaleString("en-US");

/** The census header alone — one row per catalogued vault, no live overlay and
 *  one position row, because nothing on this page is about a position. */
async function loadCensus(): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId: MORPHO_BASE_CHAIN_ID, overlay: false, limit: 1, ...hop });
    return r.census;
  } catch (error) {
    console.error("The vault census did not answer for the Base section's about page:", error);
    return [];
  }
}

export default async function BaseVaultsInfoPage() {
  const census = await loadCensus();
  const neverHeld = census.filter((c) => c.participants === 0).length;
  const unproven = census.filter((c) => !c.sumMatches);

  return (
    <VaultsInfoPage chainId={MORPHO_BASE_CHAIN_ID} protocol={protocolForHref("/base/morpho")!}>
      <p data-intro-membership>
        Membership comes from the census and only from the census: every address named either side of any{" "}
        <code>Transfer</code> a vault has ever emitted, swept from that vault&rsquo;s own creation block rather than
        from a fixed window — six million blocks is 139 days on Base — and proven complete by Σ <code>balanceOf</code>{" "}
        equalling <code>totalSupply()</code> wei-exact at the census block the listing states. A sweep that came back
        short cannot pass that check, so a silent partial answer becomes a refused load and the previous census stands.
        Transfers, first seen, last activity and what the holding address is all come from that sweep, at that block.
        The one priced figure on a card, Value · USD, is the census&rsquo;s too and is explained below; there is no rate
        and no yield on any vault page here.
      </p>
      <p data-intro-blocks>
        Three blocks, and this section never reduces them to one. The census block the listing states is when membership
        was swept. The block each card names is when its shares, claim and share of the vault were called. The third is
        the lane&rsquo;s own <code>finalized</code> block, the cut a position&rsquo;s stored history is kept below: it
        is read in the same request as the cards it is about, and stated there — on a position page, beside them — never
        here, because a number read for this page would be a different request&rsquo;s answer. That distance is a chain
        answer and never a constant: on this chain the tag steps in jumps rather than creeping, and sat between 643 and
        795 blocks behind head across five samples.
      </p>
      <p data-intro-sort>
        The listing rests on value. Each card&rsquo;s Value · USD is the census&rsquo;s figure at the census block: the
        balance at that block through the vault&rsquo;s own <code>convertToAssets</code> and the chain&rsquo;s Aave V3
        oracle (<code>IAaveOracle.getAssetPrice</code>) at the same block, the oracle and the block named on the
        figure&rsquo;s receipt — computed once by the daily census and never read for a listing page, so it is what a
        position was worth at that block and says nothing about now. <UnpricedSentence census={census} /> The Size
        filter&rsquo;s brackets are whole-dollar lower bounds on that value, and its Unpriced option is exactly the rows
        the oracle declined. Sorting by share of the vault orders each row&rsquo;s balance over its own vault&rsquo;s
        supply at the census block, which compares across vaults; sorting by shares sorts on the raw balance in each
        vault&rsquo;s own units — a MetaMorpho share token&rsquo;s <code>decimals()</code> is its asset&rsquo;s plus the
        factory&rsquo;s offset — so it orders raw share counts and not amounts of anything comparable.
      </p>
      {neverHeld > 0 && (
        <p data-intro-empty>
          {n(neverHeld)} of the {n(census.length)} catalogued vaults have never been held: the sweep ran over each
          one&rsquo;s whole life and returned no <code>Transfer</code> at all. Each is named in the roster of vaults as
          &ldquo;no holder yet&rdquo; — a reading about those vaults, not an absence of data about them — and none is
          offered in the vault filter, because a choice that always answers an empty page states nothing.
        </p>
      )}
      {unproven.length > 0 && (
        <p data-intro-unproven>
          {n(unproven.length)} of the vaults did not pass the Σ <code>balanceOf</code> check at the last sweep, so their
          sets are not stated as whole: {unproven.map((c) => c.symbol ?? c.vault).join(", ")}.
        </p>
      )}
      <p data-intro-search>
        The search matches an address, or a fragment of one, against the holder. An address the census has never seen
        has no row here — the listing answers no rows for it and records nothing about the search, because a set
        assembled from what visitors typed would be a public record of who looked at what. What an address holds right
        now, census member or not, is a different question, and nothing here answers it.
      </p>
    </VaultsInfoPage>
  );
}
