// How Morpho's vault layer is built on one chain — /base/morpho/vaults/info and
// /ethereum/morpho/vaults/info (rails-ops ui-jobs 486).
// ----------------------------------------------------------------------------
// The rail's (i). The first paragraphs are the roster's words, its census
// count with its receipt, and the vault's "?" concepts, which left the roster's
// head (ui-jobs 771: the roster opens on its read stamp alone). The rest were
// the positions listing's "How this listing is built" drawer.
//
// THE THREE-BLOCKS PARAGRAPH NAMES NO FINALIZED BLOCK. This page reads no
// position and no overlay, so a number here would be a different request's
// answer wearing the listing's words. It states the mechanism instead, and the
// figure stays where it is read — on a position page, beside the cards it is
// about.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: the paragraphs
// about the vaults nobody has ever held and the ones that did not pass the
// completeness check are about the census itself. A census that does not
// answer leaves those unstated rather than stated emptily.
//
// SERVER-ONLY.

import Link from "next/link";
import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { UnpricedSentence } from "@/components/vaults/unpriced-sentence";
import { loadMetaMorphoCensus } from "@/components/vaults/metamorpho-roster-page";
import { protocolForPathname } from "@/lib/shared/protocols";
import { metaMorphoVaultRosterHref, metaMorphoVaultsListingHref } from "@/lib/vaults/routes";
import { loadMetaMorphoVaultRoster, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { vaultDirectoryCensusProv } from "@/lib/morpho-base/vault-provenance";
import { FOOT_LINK, INLINE_LINK } from "@/lib/shared/ui-grammar";

const n = (v: number) => v.toLocaleString("en-US");

const MORPHO_VAULT_V2_DOCS = "https://docs.morpho.org/learn/concepts/vault-v2/";
const MORPHO_VAULT_DOCS = "https://docs.morpho.org/curate/concepts/roles/#morpho-vaults-v1-roles";

/** The chain's own facts in the paragraphs. */
const WORDS: Record<MetaMorphoChainId, { window: string; finalized: string }> = {
  8453: {
    window: "six million blocks is 139 days on Base",
    finalized:
      "on this chain the tag steps in jumps rather than creeping, and sat between 643 and 795 blocks behind head across five samples.",
  },
  1: {
    window: "six million blocks is about 833 days on Ethereum",
    finalized: "on Ethereum the tag moves an epoch of 32 blocks at a time, about two epochs behind head.",
  },
};

export async function MetaMorphoVaultsInfo({ chainId }: { chainId: MetaMorphoChainId }) {
  const [census, roster] = await Promise.all([loadMetaMorphoCensus(chainId), loadMetaMorphoVaultRoster(chainId)]);
  const chain = chainId === 1 ? "Ethereum" : "Base";
  const neverHeld = census.filter((c) => c.participants === 0).length;
  const unproven = census.filter((c) => !c.sumMatches);
  const words = WORDS[chainId];
  const censusBlock = census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null;

  return (
    <VaultsInfoPage chainId={chainId} protocol={protocolForPathname(metaMorphoVaultRosterHref(chainId))!}>
      <p data-intro-vault>
        A MetaMorpho vault pools one asset and lends it across the Morpho Blue markets its curator chooses. A holder
        owns shares, and a share buys back more of the asset as those markets pay interest. The curator sets which
        markets the vault may lend to and each one&rsquo;s cap; the owner can replace the curator and sets the fee. A
        vault&rsquo;s total assets add each market&rsquo;s interest up to the block read, while Morpho Blue books
        interest only when a market is touched, so the sum the vault has allocated trails it. On a V1.1 vault, lost
        assets are assets no market holds after a loss, and the share price is not lowered for them.
      </p>
      <p data-intro-roster data-figure="directory-census">
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
        , each found from the creation event its factory emits. The list is a floor: a vault deployed without a factory
        emits no creation event, and a vault created since the census block joins when the census runs again. Names are
        read live, because a V1.1 owner can rename a vault. Each total and share price on the roster is a call answered
        at the block its read stamp names, re-read at most every five minutes.
      </p>
      <p data-intro-figures>
        On the roster, amounts are in each vault&rsquo;s asset and nothing is priced in USD, so two assets are never
        ordered or added together. Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days,
        annualised simply, net of the fees the vault takes inside the share; rewards paid outside the share, such as
        MORPHO, are not in it. An empty vault answered zero to <code>totalAssets()</code>.
        {censusBlock != null && (
          <>
            {" "}
            Holders counts every address holding a share at census block {n(censusBlock)}: a floor, since an address is
            often a wrapper. The positions listing names{" "}
            <Link href={metaMorphoVaultsListingHref(chainId)} className={INLINE_LINK} prefetch={false}>
              every holder
            </Link>
            ; the paragraphs below say how that listing is built.
          </>
        )}
      </p>
      <p data-intro-docs>
        <a href={MORPHO_VAULT_DOCS} target="_blank" rel="noopener" className={`font-medium ${FOOT_LINK}`}>
          Morpho&rsquo;s docs
        </a>{" "}
        explain the Vaults V1 roles in Morpho&rsquo;s terms.
      </p>
      <p data-intro-membership>
        Membership comes from the census and only from the census: every address named either side of any{" "}
        <code>Transfer</code> a vault has ever emitted, swept from that vault&rsquo;s creation block rather than from a
        fixed window ({words.window}) and proven complete by Σ <code>balanceOf</code> equalling{" "}
        <code>totalSupply()</code> wei-exact at the census block the listing states. A sweep that came back short cannot
        pass that check, so a silent partial answer becomes a refused load and the previous census stands. Transfers,
        first seen, last activity and what the holding address is all come from that sweep, at that block. The one
        priced figure on a card, Value · USD, is the census&rsquo;s too and is explained below.
      </p>
      {/* ui-jobs 664, VA9: the docs' V2, which this section does not list. */}
      <p data-intro-v2>
        <a href={MORPHO_VAULT_V2_DOCS} target="_blank" rel="noopener" className="link-external">
          Morpho&rsquo;s docs
        </a>{" "}
        name Morpho Vault V2 the primary vault surface and say &ldquo;Morpho Vaults V1 are now legacy&rdquo;; this
        section lists MetaMorpho (V1) vaults only.
      </p>
      <p data-intro-blocks>
        Three blocks, and this section never reduces them to one. The census block the listing states is when membership
        was swept. The block each card names is when its shares, claim and share of the vault were called. The third is
        the lane&rsquo;s own <code>finalized</code> block, the cut a position&rsquo;s stored history is kept below: it
        is read in the same request as the cards it is about, and stated there, on a position page, beside them, never
        here, because a number read for this page would be a different request&rsquo;s answer. That distance is a chain
        answer and never a constant: {words.finalized}
      </p>
      <p data-intro-sort>
        The listing rests on value. Each card&rsquo;s Value · USD is the census&rsquo;s figure at the census block: the
        balance at that block through the vault&rsquo;s own <code>convertToAssets</code> and the chain&rsquo;s Aave V3
        oracle (<code>IAaveOracle.getAssetPrice</code>) at the same block, the oracle and the block named on the
        figure&rsquo;s receipt, computed once by the daily census and never read for a listing page, so it is what a
        position was worth at that block and says nothing about now. <UnpricedSentence census={census} /> The Size
        filter&rsquo;s brackets are whole-dollar lower bounds on that value, and its Unpriced option is the rows the
        oracle declined. Sorting by share of the vault orders each row&rsquo;s balance over its own vault&rsquo;s supply
        at the census block, which compares across vaults; sorting by shares sorts on the raw balance in each
        vault&rsquo;s units, a MetaMorpho share token&rsquo;s <code>decimals()</code> is its asset&rsquo;s plus the
        factory&rsquo;s offset, so it orders raw share counts and not amounts of anything comparable.
      </p>
      {neverHeld > 0 && (
        <p data-intro-empty>
          {n(neverHeld)} of the {n(census.length)} catalogued vaults have never been held: the sweep ran over each
          one&rsquo;s whole life and returned no <code>Transfer</code> at all. Each is named in the roster of vaults as
          &ldquo;no holder yet&rdquo;, a reading about those vaults, not an absence of data about them, and none is
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
        has no row here, the listing answers no rows for it and records nothing about the search, because a set
        assembled from what visitors typed would be a public record of who looked at what. What an address holds right
        now, census member or not, is a different question, and nothing here answers it.
      </p>
      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}
