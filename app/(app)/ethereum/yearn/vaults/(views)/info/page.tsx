// How the Yearn V3 roster is built — /ethereum/yearn/vaults/info.
// ----------------------------------------------------------------------------
// The (i) in the rail, and what /ethereum/yearn/info sends a reader to. The
// roster page carries the figures it read; this page carries what a reader has
// to know to read them — which contracts are on the list, what puts one there,
// what the endorsement badge is, and what a Yearn V3 vault is made of.
//
// NO CHAIN READ HERE. Every sentence is about the rules the roster follows, and
// the counts come from the roster the pages serve (lib/yearn/vault-roster.ts:
// the box's weekly census over the baked catalogue); the roster beside it
// states the block its figures came from.

import { VaultsInfoPage } from "@/components/vaults/vaults-info-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";

export const metadata = listingMetadata({
  title: "About the Yearn V3 vault roster",
  canonicalPath: "/ethereum/yearn/vaults/info",
  description:
    "How Rails builds the Yearn V3 roster: every vault the five V3 factories deployed rather than the endorsed shortlist, the creation log that enumerates them, what the endorsed badge means, and why totals stay in each vault's own asset.",
});

const n = (v: number) => v.toLocaleString("en-US");

/** A small count in words, the way prose says it. Kept derived from the
 *  catalogue rather than written into the sentence, so a sixth release moves
 *  this page when the census picks it up. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (v: number) => WORDS[v] ?? n(v);

export default async function YearnVaultsInfoPage() {
  const roster = await loadYearnVaultRoster();
  const { vaults, factories, censusBlock } = roster;
  return (
    <VaultsInfoPage chainId={MAINNET_CHAIN_ID} protocol={protocolForHref("/ethereum/yearn")!}>
      <p data-intro-membership>
        A Yearn V3 vault takes deposits of one token and issues shares for them. It keeps some of that token idle for
        withdrawals and lends the rest to strategies, each of which puts the token to work somewhere and reports what it
        owes back. What a share is worth is the vault&rsquo;s answer: total assets divided by shares, which is what the
        Share price column on the roster shows, in the vault&rsquo;s asset.
      </p>
      <p data-intro-roster>
        The roster is every vault the {word(factories.length)} V3 factories deployed — {n(vaults.length)} of them at
        block {n(censusBlock)} — which is a wider list than the shortlist Yearn endorses. Anyone may deploy from a
        factory, and a deployment is announced by a creation event on that factory, which is the only enumeration there
        is: a vault keeps no list of its siblings and a factory keeps no list of its children. Each vault the sweep
        found is then asked which factory made it, which release it runs and which token it takes, and the three answers
        must match the event before it joins the roster.
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
        vault; the strategies behind it are judged one at a time.
      </p>
      <p data-intro-units>
        Every figure on the roster is a quantity of one vault&rsquo;s asset, and the roster holds{" "}
        {n(new Set(vaults.map((v) => v.asset.address)).size)} different assets. Vaults are grouped by asset and ordered
        inside a group by size, so the only comparisons the page offers are between quantities of the same token. There
        is no dollar value anywhere and no total across the page.
      </p>
      <p data-intro-scope>
        Yearn V2 is a separate registry with different vault code and is absent from this page. A holder&rsquo;s reading
        of a Yearn vault — what one address holds, and the history behind it — is work that has not been done here yet;
        the roster is about the contracts.
      </p>
    </VaultsInfoPage>
  );
}
