// The /vaults overview (rails-ops ui-jobs 776, 782): a card per vault family
// the index lists (E6.2, VAULT_INDEX_LISTED: IPOR Fusion joins at its
// launch), then the ways in (E6.3, lib/vaults/overview-words.ts); the FAQ
// (E6.4) is components/vaults/vault-faq.tsx. A family card states its lead
// (lib/vaults/family-leads.ts, the first sentence of its info page), then a
// row per roster, chain by chain: the roster's vault count at its block, its
// read stamp, the row linking the roster. A later chain or version is another
// row, not another card (Miles, 20 Nov 2026).

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { IndexNotice } from "@/components/shared/index-notice";
import { ChainLabel } from "@/components/shared/rail-header";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { RosterReadStamp } from "@/components/vaults/roster-read-stamp";
import { VaultOverviewScope } from "@/components/vaults/vault-overview-scope";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { assetParamLabel, assetParamNames, vaultHasAsset } from "@/lib/vaults/asset-param";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";
import { assetKey } from "@/lib/shared/asset-family";
import { vaultFamilyLead } from "@/lib/vaults/family-leads";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import {
  chainName,
  VAULT_INDEX_LISTED,
  VAULT_INDEX_PROTOCOL_LABEL,
  rosterHrefWithAsset,
  vaultIndexRosterKey,
  vaultIndexRosterKeyOf,
  type VaultIndexProtocol,
  type VaultIndexRoster,
} from "@/lib/vaults/index-rosters";
import { rosterCountProv, type RosterRead } from "@/lib/vaults/roster-provenance";
import { WAYS_IN, WAYS_IN_WORDS } from "@/lib/vaults/overview-words";

const n = (v: number) => v.toLocaleString("en-US");

/** An ISO time as seconds; null where absent or unparsable (roster-read-stamp's
 *  `isoSeconds`, which a server component cannot call from a client module). */
const isoSeconds = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

const CARD = "rounded-2xl bg-raised px-5 py-4";
/** A card that opens a page: the app's blue hover border (ui-grammar's link rule). */
const CARD_LINK =
  "border border-transparent transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** The ways into vaults on Rails (E6.3; ui-jobs 782), under the family
 *  cards: a card each, the whole card the link, its title and a line saying
 *  where it goes. */
export function VaultWaysIn() {
  return (
    <section className="mt-10" aria-labelledby="vault-ways-in" data-anatomy="E6.3" data-vault-ways-in="">
      <h2 id="vault-ways-in" className="text-base font-semibold text-foreground">
        {WAYS_IN_WORDS.heading}
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-rb-500" data-vault-ways-in-lead="">
        {WAYS_IN_WORDS.lead}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WAYS_IN.map((w) => (
          <li key={w.key}>
            <Link href={w.href} className={`${CARD} ${CARD_LINK} block h-full`} prefetch={false} data-way-in={w.key}>
              <WayInBody title={w.title} line={w.line} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WayInBody({ title, line }: { title: string; line: string }) {
  return (
    <>
      <h3 className="text-sm font-semibold text-blue-600 dark:text-[var(--text-link)]">{title}</h3>
      <p className="mt-1.5 text-sm text-rb-500">{line}</p>
    </>
  );
}

/** What the card links: Maple's roster is its pools page, sBOLD's the vault. */
const NOUN: Partial<Record<VaultIndexProtocol, string>> = {
  maple: "pools page",
  sbold: "vault",
};

/** Under `?asset=`: the param, its words, and the roster's vaults over it. */
interface AssetCut {
  param: string;
  /** Before a noun: "USDC", "stablecoin". */
  adjective: string;
  /** After "over": "USDC", "stablecoins". */
  over: string;
  count: number;
}

/** A roster's row in its family's card: the chain's glyph (its name the
 *  label), the count in its receipt, the read stamp and a chevron; the row is
 *  the link to the roster (ui-jobs 782), the count's receipt usable inside it
 *  as 773's count links' are, and the stamp toggling without opening it. */
function RosterRow({ roster, cut }: { roster: VaultIndexRoster; cut: AssetCut | null }) {
  const { protocol, chainId } = roster;
  const label = VAULT_INDEX_PROTOCOL_LABEL[protocol];
  const read: RosterRead = {
    label: `${label} on ${chainName(chainId)}`,
    block: roster.blockNumber,
    // The block's time where rails-server stamped it, as the rosters show it.
    at: roster.readBy?.blockTime || isoSeconds(roster.readAt),
  };
  const counted = roster.blockNumber > 0;
  const count = cut ? cut.count : roster.count;
  const noun = `${cut ? `${cut.adjective} ` : ""}${count === 1 ? "vault" : "vaults"}`;
  const opens = NOUN[protocol] ?? "roster";
  return (
    <Link
      href={rosterHrefWithAsset(protocol, chainId, cut?.param)}
      // The name carries the count, which the label hides from a screen reader.
      aria-label={`${label} on ${chainName(chainId)}: ${counted ? `${n(count)} ${noun}` : "count not read"}. Open the ${opens}`}
      className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-[var(--surface-row-hover)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-rb-800"
      prefetch={false}
      data-overview-roster=""
      data-overview-row={vaultIndexRosterKey(roster)}
      data-overview-count={counted ? count : ""}
      data-overview-block={roster.blockNumber}
    >
      <ChainLabel chainId={chainId} anatomy={null} />
      {counted ? (
        <span className="text-foreground" data-overview-vaults="">
          <Prov info={rosterCountProv(read, count, cut?.over)}>
            {n(count)} {noun}
          </Prov>
        </span>
      ) : (
        <span className="text-rb-500" data-overview-vaults="unread">
          Count not read
        </span>
      )}
      <span className="text-[11px] text-rb-500">
        <RosterReadStamp reads={[read]} inLink />
      </span>
      <ChevronRight className="ml-auto size-4 shrink-0 text-rb-500" aria-hidden />
    </Link>
  );
}

const GRID = "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** The cards, read from the index (cached five minutes, shared with /start):
 *  one per family (ui-jobs 782), its heading and lead, then a row per listed
 *  roster of that family the read returned, in the index's order. Under
 *  `?asset=` (the start page, the asset step and the search link it) a line
 *  names the asset, a row stands only where its roster has a vault over it,
 *  its count and link that asset's, and a card with no rows drops out. */
export async function VaultOverviewCards({ asset }: { asset?: string }) {
  const { rosters, vaults, indexDown } = await loadVaultIndex();
  const byKey = new Map(rosters.map((r) => [vaultIndexRosterKey(r), r]));
  const names = assetParamNames(asset);
  const over = names.size > 0 ? vaults.filter((v) => vaultHasAsset(v, names)) : null;
  const label = asset && over ? assetParamLabel(asset, vaults) : null;
  const adjective = asset && over ? assetParamLabel(asset, vaults, true) : null;
  const overCount = (k: string) => (over ?? []).filter((v) => vaultIndexRosterKeyOf(v) === k).length;
  const listed = VAULT_INDEX_LISTED();
  const shown = listed
    .flatMap((r) => byKey.get(vaultIndexRosterKey(r)) ?? [])
    .filter((r) => !over || overCount(vaultIndexRosterKey(r)) > 0);
  // Each roster's vaults' asset and share keys, for Focus.
  const keys = new Map<string, string[]>();
  for (const v of vaults) {
    const k = vaultIndexRosterKeyOf(v);
    keys.set(k, [...(keys.get(k) ?? []), assetKey(v.chainId, v.asset.address), assetKey(v.chainId, v.address)]);
  }
  // One card per family, in the order its first roster is listed.
  const families = [...new Set(shown.map((r) => r.protocol))];
  const cards = families.map((protocol) => {
    const rows = shown.filter((r) => r.protocol === protocol);
    // The lead names the chains of the rows the card shows.
    const chains = rows.map((r) => r.chainId);
    return {
      key: protocol,
      className: `${CARD} flex flex-col`,
      attrs: { "data-anatomy": "E6.2", "data-overview-card": protocol },
      head: (
        <>
          <h2 className="text-base font-semibold text-foreground">{VAULT_INDEX_PROTOCOL_LABEL[protocol]}</h2>
          <p className="mt-2 text-sm text-rb-500" data-overview-lead="">
            {vaultFamilyLead(protocol, chains)}
          </p>
        </>
      ),
      rows: rows.map((r) => {
        const k = vaultIndexRosterKey(r);
        return {
          chainId: r.chainId,
          keys: keys.get(k) ?? [],
          node: (
            <RosterRow
              roster={r}
              cut={asset && label && adjective ? { param: asset, adjective, over: label, count: overCount(k) } : null}
            />
          ),
        };
      }),
    };
  });
  return (
    <>
      {indexDown && (
        <IndexNotice chainFilled={shown.some((r) => r.blockNumber > 0)} className="mt-4 text-sm text-rb-500" />
      )}
      {asset && label && (
        <p className="mt-6 text-sm text-foreground" data-overview-asset={asset}>
          {shown.length > 0 ? `Vaults over ${label}` : `No vault Rails reads is over ${label}.`}
          <span className="text-rb-500"> · </span>
          <Link href={VAULT_INDEX_HREF} className={INLINE_LINK} prefetch={false} data-overview-asset-clear="">
            Every family
          </Link>
        </p>
      )}
      {/* One receipts scope over the cards, so each count and stamp opens its receipt (decision 0062). */}
      <ProvSection scope="vault-overview" as="div">
        <VaultOverviewScope className={GRID} cards={cards} />
      </ProvSection>
    </>
  );
}

/** The cards' placeholder while the index is read. */
export function VaultOverviewCardsLoading() {
  return (
    <div className={GRID} data-vault-overview-cards="pending">
      {[...new Set(VAULT_INDEX_LISTED().map((r) => r.protocol))].map((p) => (
        <div key={p} className={`${CARD} h-44 animate-pulse`} />
      ))}
    </div>
  );
}
