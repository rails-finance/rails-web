// focus: the explorer's explainer; the shell's gate stands over the explorer
// How the Yearn V3 roster is built — /ethereum/yearn/vaults/info, on the
// menu-led About layout (ProtocolInfoPage, ui-jobs 791): the intro, then a
// section per menu entry (Vaults, Assets), with the glossary in its column.
// ----------------------------------------------------------------------------
// The About entry in the rail, which /ethereum/yearn/info redirects here. The
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

import { GlossaryLink, ProtocolInfoPage, type InfoTerm, type InfoView } from "@/components/shared/protocol-info-page";
import { Prov } from "@/components/shared/provenance";
import { loadYearnEthereumVaultDirectory } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { loadYearnCensus } from "@/lib/yearn/vault-census";
import { yearnEndorsedCountProv, yearnRosterCensusProv } from "@/lib/yearn/vault-provenance";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";
import { YEARN_VAULTS_LEAD } from "@/lib/vaults/family-leads";
import { YEARN_DOCS } from "@/lib/vaults/family-docs";

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
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (v: number) => WORDS[v] ?? n(v);

const UL = "list-disc space-y-1 pl-5";

const V3 = "https://docs.yearn.fi/developers/v3";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "A Yearn V3 vault, which Yearn's docs call an allocator vault, is an ERC-4626 contract that takes deposits, mints shares and allocates the deposits to strategies.",
    sources: [{ label: "Definitions", href: `${V3}/overview#definitions` }],
  },
  {
    term: "Strategy",
    definition:
      "A strategy is a contract added to a vault that puts the vault's token to work in one place. Yearn's tokenized strategies are ERC-4626 vaults a holder can also deposit into directly.",
    sources: [{ label: "Definitions", href: `${V3}/overview#definitions` }],
  },
  {
    term: "Vault factory",
    definition:
      "A vault factory is a contract Yearn governance deployed that anyone can use to deploy a vault. Each V3 release has its own.",
    sources: [{ label: "Definitions", href: `${V3}/overview#definitions` }],
  },
  {
    term: "Role manager",
    definition: "The role manager is the contract or address that hands out every power over a vault.",
    sources: [{ label: "Role Manager", href: `${V3}/periphery#role-manager` }],
  },
  {
    term: "Accountant",
    definition: "The accountant is the contract that charges a vault's fees when a strategy reports.",
    sources: [{ label: "Accountant", href: `${V3}/periphery#accountant` }],
  },
  {
    term: "Profit unlock",
    definition:
      "A reported gain is locked in shares and released into the share price over the vault's profit unlock window. A loss is not spread out.",
    sources: [{ label: "Vault accounting", href: `${V3}/yield_accrual#vault-accounting-allocator-vault` }],
  },
  {
    term: "Endorsement",
    definition: "Endorsement is Yearn putting its name to a vault. Yearn's registry stores the endorsed vaults.",
    sources: [{ label: "Registry", href: `${V3}/periphery#registry` }],
  },
];

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
  const views: readonly [InfoView, ...InfoView[]] = [
    {
      heading: "The roster",
      section: "vaults",
      body: (
        <div data-intro-roster>
          <p data-figure="roster-census">
            The roster is every vault the {word(factories.length)} V3 factories deployed,{" "}
            <Prov info={yearnRosterCensusProv(coords, { catalogSize: vaults.length, censusBlock })}>
              {n(vaults.length)} of them at block {n(censusBlock)}
            </Prov>
            .
          </p>
          <ul className={`mt-1.5 ${UL}`}>
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
        </div>
      ),
    },
    {
      heading: "What the roster leaves out",
      section: "vaults",
      body: (
        <ul className={UL} data-intro-floor>
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
      ),
    },
    {
      heading: "Endorsement",
      section: "vaults",
      body: (
        <ul className={UL} data-intro-endorsed>
          <li>The roster shows Yearn&rsquo;s endorsement as a badge and the Yearn mark.</li>
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
      ),
    },
    {
      heading: "Reading the roster",
      section: "vaults",
      body: (
        <ul className={UL} data-intro-units>
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
      ),
    },
  ];

  return (
    <ProtocolInfoPage
      session="yearn"
      layer={{}}
      tracks={YEARN_VAULTS_LEAD}
      glossary={glossary}
      howItWorks={[
        <>
          A Yearn V3 <GlossaryLink term="Vault">vault</GlossaryLink> takes deposits of one token and issues shares for
          them. It keeps some of the token idle for withdrawals and lends the rest to{" "}
          <GlossaryLink term="Strategy">strategies</GlossaryLink>, each of which puts the token to work somewhere and
          reports what it owes back.
        </>,
        <>
          A share&rsquo;s worth is the vault&rsquo;s answer to <code>convertToAssets</code>, which the Share price
          column shows in the vault&rsquo;s asset.
        </>,
        <>
          The <GlossaryLink term="Role manager">role manager</GlossaryLink> hands out every power over the vault. The{" "}
          <GlossaryLink term="Accountant">accountant</GlossaryLink> charges fees when a strategy reports.
        </>,
        <>
          A reported gain reaches the share price over the vault&rsquo;s{" "}
          <GlossaryLink term="Profit unlock">profit unlock</GlossaryLink> window, so the price climbs smoothly. A loss
          lands at once.
        </>,
      ]}
      views={views}
      guide={false}
      docs={{ label: "Yearn documentation", href: YEARN_DOCS }}
    />
  );
}
