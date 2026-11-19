// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the Yearn V3 roster is built — /ethereum/yearn/vaults/info.
// ----------------------------------------------------------------------------
// The (i) in the rail, and what /ethereum/yearn/info sends a reader to. The
// roster page carries the figures it read; this page carries what a reader has
// to know to read them — which contracts are on the list, what puts one there,
// what the endorsement badge is, and what a Yearn V3 vault is made of.
//
// The roster's words, its census count and endorsed count with their receipts,
// and the vault's "?" concepts live here: the roster opens on its read stamp
// alone (ui-jobs 771). The census count comes from the roster the pages serve
// (lib/yearn/vault-roster.ts: the box's weekly census over the baked
// catalogue). THE ENDORSED COUNT IS A CHAIN READ: the roster's loader caches a
// good read for five minutes; a failed read is re-read on every request until
// its cache entry expires, and while it fails the count is stated as not read
// and the prose stands.

import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { loadYearnEthereumVaultDirectory } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { loadYearnCensus } from "@/lib/yearn/vault-census";
import { yearnEndorsedCountProv, yearnRosterCensusProv } from "@/lib/yearn/vault-provenance";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "About the Yearn V3 vault roster",
  canonicalPath: "/ethereum/yearn/vaults/info",
  description:
    "How Rails builds the Yearn V3 roster: every vault the five V3 factories deployed, endorsed or not, the creation log that enumerates them, what the endorsed badge means, and why totals stay in each vault's asset.",
});

const n = (v: number) => v.toLocaleString("en-US");

/** A small count in words, the way prose says it. Kept derived from the
 *  catalogue rather than written into the sentence, so a sixth release moves
 *  this page when the census picks it up. */
const YEARN_DOCS = "https://docs.yearn.fi/getting-started/intro";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (v: number) => WORDS[v] ?? n(v);

export default async function YearnVaultsInfoPage() {
  const [roster, data, census] = await Promise.all([
    loadYearnVaultRoster(),
    loadYearnEthereumVaultDirectory(),
    loadYearnCensus(),
  ]);
  const { vaults, factories, censusBlock } = roster;
  const coords = { blockNumber: data.blockNumber || undefined, readBy: serverReadOf(data) };
  const endorsed = data.rows.filter((r) => r.endorsed === true).length;
  const holdersBlock = census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null;
  return (
    <VaultsInfoPage chainId={MAINNET_CHAIN_ID} protocol={protocolForHref("/ethereum/yearn")!}>
      <p data-intro-membership>
        A Yearn V3 vault takes deposits of one token and issues shares for them. It keeps some of that token idle for
        withdrawals and lends the rest to strategies, each of which puts the token to work somewhere and reports what it
        owes back. What a share is worth is the vault&rsquo;s answer to <code>convertToAssets</code>, which is what the
        Share price column on the roster shows, in the vault&rsquo;s asset. The role manager hands out every power over
        the vault, and the accountant charges its fees when a strategy reports. A reported gain reaches the share price
        over the vault&rsquo;s profit unlock window, so the price climbs smoothly; a loss lands at once.
      </p>
      <p data-intro-roster data-figure="roster-census">
        The roster is every vault the {word(factories.length)} V3 factories deployed,{" "}
        <Prov info={yearnRosterCensusProv(coords, { catalogSize: vaults.length, censusBlock })}>
          {n(vaults.length)} of them at block {n(censusBlock)}
        </Prov>
        , which is a wider list than the shortlist Yearn endorses. Anyone may deploy from a factory, and a deployment is
        announced by a creation event on that factory, which is the only enumeration there is: a vault keeps no list of
        its siblings and a factory keeps no list of its children. Each vault the sweep found is then asked which factory
        made it, which release it runs and which token it takes, and the three answers must match the event before it
        joins the roster. Each total and share price on the roster is a call answered at the block its read stamp names,
        re-read at most every five minutes.
      </p>
      <p data-intro-floor>
        That makes the roster a floor. The V3 vault is a contract, so it can be compiled and deployed by hand with no
        factory involved, and such a vault announces nothing and appears on no list anywhere; a vault deployed since the
        census block joins when the census runs again. Two lists that look like the roster are neither: the registry
        answers the endorsed shortlist mixed with tokenized strategies no factory made, and the pointer it keeps to the
        release registry has fallen behind at {word(factories.filter((f) => f.onStalePointer).length)} of the{" "}
        {word(factories.length)} factories.
      </p>
      <p data-intro-endorsed>
        Endorsement is Yearn putting its name to a vault, and the roster shows it as a badge and the Yearn mark. It is
        an act Yearn can undo, so the badge describes the block the roster names and nothing later. A vault without one
        still carries the words &ldquo;Yearn V3&rdquo;, because that is what it is: a contract from a Yearn factory,
        running Yearn&rsquo;s vault code at the release the row states. An endorsement is Yearn&rsquo;s word on the
        vault; the strategies behind it are judged one at a time.{" "}
        {data.chainStale ? (
          "The registry was not read just now, so the count of endorsed vaults is not stated."
        ) : (
          <>
            <Prov info={yearnEndorsedCountProv(coords, endorsed, data.catalogSize)}>
              {n(endorsed)} of the {n(data.catalogSize)} vaults on the roster are endorsed at block{" "}
              {n(data.blockNumber)}
            </Prov>
            .
          </>
        )}
      </p>
      <p data-intro-units>
        Every amount on the roster is a quantity of one vault&rsquo;s asset, and the roster holds{" "}
        {n(new Set(vaults.map((v) => v.asset.address)).size)} different assets. Nothing is priced in USD, so two assets
        are never ordered or added together, and there is no total across the page. Yield is Rails&rsquo;s figure: the
        share price&rsquo;s growth over 30 days, annualised simply, net of the fees the vault takes inside the share;
        gauge rewards paid outside the share are not in it. An empty vault answered zero to <code>totalAssets()</code>:
        a deployment never funded looks the same as one whose depositors have all left.
        {holdersBlock != null &&
          ` Holders counts every address holding a share at census block ${n(holdersBlock)}: a floor, since an address is often a wrapper.`}
      </p>
      <p data-intro-scope>
        Yearn V2 is a separate registry with different vault code and is absent from this page. One address&rsquo;s
        holding in a vault, and the history behind it, opens from the vault&rsquo;s page: enter the address under
        &ldquo;Find an address in this vault&rdquo;.
      </p>
      <p data-intro-docs>
        <a href={YEARN_DOCS} target="_blank" rel="noopener" className={`font-medium ${FOOT_LINK}`}>
          Yearn&rsquo;s documentation
        </a>{" "}
        explains vaults and strategies in Yearn&rsquo;s terms.
      </p>
      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}
