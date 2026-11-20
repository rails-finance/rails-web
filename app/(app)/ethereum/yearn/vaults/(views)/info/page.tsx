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

import { INFO_H2, INFO_UL, VaultsInfoPage } from "@/components/vaults/vaults-info-page";
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
import { YEARN_VAULTS_LEAD } from "@/lib/vaults/family-leads";

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
  const stalePointers = factories.filter((f) => f.onStalePointer).length;
  return (
    <VaultsInfoPage chainId={MAINNET_CHAIN_ID} protocol={protocolForHref("/ethereum/yearn")!}>
      <p>{YEARN_VAULTS_LEAD}</p>

      <section data-intro-vault>
        <h2 className={INFO_H2}>How a vault works</h2>
        <ul className={INFO_UL}>
          <li>
            A Yearn V3 vault takes deposits of one token and issues shares for them. It keeps some of the token idle for
            withdrawals and lends the rest to strategies.
          </li>
          <li>Each strategy puts the token to work somewhere and reports what it owes back.</li>
          <li>
            A share&rsquo;s worth is the vault&rsquo;s answer to <code>convertToAssets</code>, which the Share price
            column shows in the vault&rsquo;s asset.
          </li>
          <li>
            The role manager hands out every power over the vault. The accountant charges fees when a strategy reports.
          </li>
          <li>
            A reported gain reaches the share price over the vault&rsquo;s profit unlock window, so the price climbs
            smoothly. A loss lands at once.
          </li>
          <li data-intro-docs>
            <a href={YEARN_DOCS} target="_blank" rel="noopener" className={`font-medium ${FOOT_LINK}`}>
              Yearn&rsquo;s documentation
            </a>{" "}
            explains vaults and strategies in Yearn&rsquo;s terms.
          </li>
        </ul>
      </section>

      <section data-intro-roster>
        <h2 className={INFO_H2}>The roster</h2>
        <p className="mt-1.5" data-figure="roster-census">
          The roster is every vault the {word(factories.length)} V3 factories deployed,{" "}
          <Prov info={yearnRosterCensusProv(coords, { catalogSize: vaults.length, censusBlock })}>
            {n(vaults.length)} of them at block {n(censusBlock)}
          </Prov>
          .
        </p>
        <ul className={INFO_UL}>
          <li>Anyone may deploy from a factory, so the roster is wider than the shortlist Yearn endorses.</li>
          <li>
            A factory announces each deployment with a creation event. That event is the only list there is: a vault
            keeps no list of its siblings and a factory none of its children.
          </li>
          <li>
            Each vault found is asked which factory made it, which release it runs and which token it takes. All three
            answers must match the event before it joins.
          </li>
          <li>
            Each total and share price is read at the block the read stamp names, and re-read at most every five
            minutes.
          </li>
        </ul>
      </section>

      <section data-intro-floor>
        <h2 className={INFO_H2}>What the roster leaves out</h2>
        <ul className={INFO_UL}>
          <li>
            A V3 vault deployed by hand, with no factory, announces nothing and is on no list, so the roster is a floor.
          </li>
          <li>A vault deployed after the census block joins when the census runs again.</li>
          <li>
            Yearn&rsquo;s registry is a different list: the endorsed shortlist mixed with tokenized strategies no
            factory made.
          </li>
          {stalePointers > 0 && (
            <li>
              The registry&rsquo;s pointer to the release registry has fallen behind at {word(stalePointers)} of the{" "}
              {word(factories.length)} factories.
            </li>
          )}
          <li data-intro-scope>Yearn V2 is a separate registry with different vault code, and is not listed here.</li>
        </ul>
      </section>

      <section data-intro-endorsed>
        <h2 className={INFO_H2}>Endorsement</h2>
        <ul className={INFO_UL}>
          <li>Endorsement is Yearn putting its name to a vault. The roster shows it as a badge and the Yearn mark.</li>
          <li>Yearn can undo it, so the badge describes the block the roster names.</li>
          <li>
            A vault without the badge is still &ldquo;Yearn V3&rdquo;: a contract from a Yearn factory, running
            Yearn&rsquo;s vault code at the release its row states.
          </li>
          <li>An endorsement covers the vault. The strategies behind it are judged one at a time.</li>
          <li>
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
          </li>
        </ul>
      </section>

      <section data-intro-units>
        <h2 className={INFO_H2}>Reading the roster</h2>
        <ul className={INFO_UL}>
          <li>
            Every amount is a quantity of one vault&rsquo;s asset, and the roster holds{" "}
            {n(new Set(vaults.map((v) => v.asset.address)).size)} different assets.
          </li>
          <li>
            Nothing is priced in USD, so two assets are never ordered or added together, and the page has no total.
          </li>
          <li>
            Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days, annualised simply, net of the
            fees taken inside the share. Gauge rewards paid outside the share are not in it.
          </li>
          <li>
            An empty vault answered zero to <code>totalAssets()</code>. A vault never funded looks the same as one whose
            holders have all left.
          </li>
          {holdersBlock != null && (
            <li>
              Holders counts every address holding a share at census block {n(holdersBlock)}. It is a floor, since one
              address is often a wrapper.
            </li>
          )}
          <li>
            To see one address&rsquo;s holding and its history, open the vault&rsquo;s page and enter the address under
            &ldquo;Find an address in this vault&rdquo;.
          </li>
        </ul>
      </section>

      <ProvInspectorLayer />
    </VaultsInfoPage>
  );
}
