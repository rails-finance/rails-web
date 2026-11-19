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
// minutes and never caches a failure; a failed read states the count as not
// read and the prose stands.
//
// THE CENSUS HEADER IS FETCHED HERE, without the live overlay: three of the
// paragraphs are about the census itself — which vaults nobody has ever held,
// which did not pass the completeness check, which assets the oracle declined —
// and each names the block the sweep ran to. A census that does not answer
// leaves those three unstated rather than stated emptily; the rest of the page
// is about the section's rules and stands either way.

import Link from "next/link";
import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { AaveFirstPartySources } from "@/components/vaults/aave-first-party-sources";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { aaveVaultCatalogueProv } from "@/lib/aave-vaults/vault-provenance";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { UnpricedSentence } from "@/components/vaults/unpriced-sentence";
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
    "How Rails builds the vault position listing on Ethereum: membership from a whole-Transfer census proven complete by Σ balanceOf, the one priced figure and the block it was priced at, the vaults nobody has ever held, and what the search does and does not do.",
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
      <p data-intro-vault>
        Three families of ERC-4626 vault that Aave deploys. Savings GHO is one vault over GHO: a holder&rsquo;s shares
        grow with a stored yield index, and withdrawals are clamped to the GHO the contract holds. A static aToken wraps
        exactly one Aave V3 aToken, so its shares are a non-rebasing claim on a supply position and its share price is
        the reserve&rsquo;s accrued index. An Umbrella stake token is staked against one reserve&rsquo;s deficit:
        Umbrella can slash it, taking part of the stake to cover the deficit, which lowers every holder&rsquo;s share
        price at once, and redemption runs through a cooldown and a window after it.
      </p>
      <p data-intro-roster>
        {data.chainStale ? (
          <>
            One row on the roster is one vault: savings GHO, the static aTokens <code>getStataTokens()</code> returns
            and the stake tokens <code>getStkTokens()</code> returns. Aave&rsquo;s contracts were not read just now, so
            the count is not stated.
          </>
        ) : (
          <>
            One row on the roster is one vault.{" "}
            <Prov info={aaveVaultCatalogueProv(coords, data)}>
              Aave&rsquo;s contracts name {n(data.catalogSize)} vaults at block {n(data.blockNumber)}
            </Prov>
            : savings GHO, the {n(data.stataCount)} static aTokens <code>getStataTokens()</code> returns and the{" "}
            {n(data.stakeCount)} stake tokens <code>getStkTokens()</code> returns.
          </>
        )}{" "}
        Both calls answer their whole family, so the list is complete at its block. Outside it: Aave&rsquo;s deployments
        on other chains, the legacy static-aToken factory, and any ERC-4626 Aave has not published. Every figure on the
        roster is a call answered at the block its read stamp names, re-read at most every five minutes.
      </p>
      <p data-intro-figures>
        Amounts are in each vault&rsquo;s asset and nothing is priced in USD. Three of the four stake tokens hold a
        static aToken, so their amounts are in that wrapper&rsquo;s units. A static aToken holding nothing still answers
        a share price well above one: the reserve&rsquo;s index. Yield is Rails&rsquo;s figure: the share price&rsquo;s
        growth over 30 days, annualised simply; Umbrella&rsquo;s rewards are paid outside the share and are not in it.
        The deposit cap, the wrapped aToken and the cooldown are on each vault&rsquo;s page.
        {censusBlock != null && (
          <>
            {" "}
            Holders counts every address holding a share at census block {n(censusBlock)}. The positions listing names{" "}
            <Link href={ethereumVaultsListingHref()} className={INLINE_LINK} prefetch={false}>
              every holder
            </Link>
            ; the paragraphs below say how it is built.
          </>
        )}
      </p>
      <p data-intro-membership>
        Membership comes from the census and only from the census: every address named either side of any{" "}
        <code>Transfer</code> a vault has ever emitted, swept whole, and proven complete by Σ <code>balanceOf</code>{" "}
        equalling <code>totalSupply()</code> wei-exact at the census block the listing states. A sweep that came back
        short cannot pass that check, so a silent partial answer becomes a refused load and the previous census stands.
        Transfers, first seen, last activity and what the holding address is all come from that sweep, at that block.
        The one priced figure on a card, Value · USD, is the census&rsquo;s too and is explained below.
      </p>
      <p data-intro-sort>
        The listing rests on value. Each card&rsquo;s Value · USD is the census&rsquo;s figure at the census block: the
        balance at that block through the vault&rsquo;s <code>convertToAssets</code> and Aave V3&rsquo;s oracle on
        Ethereum (<code>IAaveOracle.getAssetPrice</code>) at the same block, the oracle and the block named on the
        figure&rsquo;s receipt. It is computed once by the daily census and never read for a listing page, so it is what
        a position was worth at that block and says nothing about now. Where a vault&rsquo;s asset is a wrapper the
        oracle does not price directly (a stake token holds a static aToken), the census prices that wrapper&rsquo;s
        underlying and converts through the wrapper&rsquo;s <code>convertToAssets</code>, and the receipt states the
        hop. <UnpricedSentence census={census} /> The Size filter&rsquo;s brackets are whole-dollar lower bounds on that
        value, and its Unpriced option is the rows the oracle declined. Sorting by share of the vault orders each
        row&rsquo;s balance over its vault&rsquo;s supply at the census block, which compares across vaults; sorting by
        shares sorts on the raw balance in each vault&rsquo;s units (the share tokens here have 6, 8 and 18 decimals),
        so it orders raw share counts, which do not compare across vaults.
      </p>
      {/* THE TRAP, SAID ONCE. The two layers hold the same assets, and the only
          place that can be said without repeating it on every card is here. It
          is prose rather than a caveat on a figure because no total is rendered
          anywhere in this section — the place a reader could go wrong is their
          own arithmetic over a column, and that is a thing to name rather than
          to annotate. Each vault page states its own half of the relationship
          (`backedBy` in lib/sources/chain/aave-ethereum-vault.ts, and the hop in
          the other direction on a stake token's own page). */}
      <p data-intro-layers>
        The section lists two layers of one machine, and a reader must not add them together. An Umbrella stake
        token&rsquo;s shares are a claim on a single position, the static aToken it is staked on, so that stake
        token&rsquo;s holding of the wrapper and the stake token&rsquo;s holders are the same assets at two heights.
        Nothing here sums them: the census line counts positions and Value · USD is per row, so no total is rendered
        anywhere in this section. Each static aToken&rsquo;s page names the stake token that holds it and the share it
        holds, and each stake token&rsquo;s page names the wrapper its assets sit in.
      </p>
      {/* ui-jobs 664, VA7: the docs' word for the page's "Static aToken". */}
      <p data-intro-glossary>
        A static aToken is what{" "}
        <a href={AAVE_TOKENIZATION_DOCS} target="_blank" rel="noopener" className="link-external">
          Aave&rsquo;s docs
        </a>{" "}
        call a StataToken: &ldquo;ERC-4626 compliant tokens that wrap Aave&rsquo;s aTokens to provide a non-rebasing
        yield accrual mechanism&rdquo;.
      </p>
      {empty.length > 0 && (
        <p data-intro-empty>
          {empty.length === 1 ? "One catalogued vault has" : `${n(empty.length)} catalogued vaults have`} never been
          held: no address has ever held shares of{" "}
          {empty.map((c, i) => (
            <span key={c.vault} data-empty-vault={c.vault}>
              {i > 0 ? (i === empty.length - 1 ? " or " : ", ") : ""}
              {c.symbol ?? c.vault}
            </span>
          ))}{" "}
          as of block {n(empty[0].censusBlock)}. The sweep ran and returned no logs at all: those vaults have no history
          to read.
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
        has no row here: the listing answers no rows for it and records nothing about the search, because a set
        assembled from what visitors typed would be a public record of who looked at what.
      </p>
      <AaveFirstPartySources />
      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}
