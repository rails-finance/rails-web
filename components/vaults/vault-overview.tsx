// The /vaults overview (rails-ops ui-jobs 776): what a vault is, how Rails
// shows one (E6.1), then a card per family and chain the index lists (E6.2,
// VAULT_INDEX_LISTED: IPOR Fusion joins at its launch). A card states its
// family's lead (lib/vaults/family-leads.ts, the first sentence of its info
// page), its roster's vault count at that roster's block with the roster's
// read stamp, and links the roster. Each roster is read at a block of its
// chain, so each card carries its own stamp.

import Link from "next/link";
import { IndexNotice } from "@/components/shared/index-notice";
import { ChainLabel } from "@/components/shared/rail-header";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { RosterReadStamp } from "@/components/vaults/roster-read-stamp";
import { VaultOverviewScope } from "@/components/vaults/vault-overview-scope";
import { INLINE_LINK, PAGE_LINK } from "@/lib/shared/ui-grammar";
import { assetParamLabel, assetParamNames, vaultHasAsset } from "@/lib/vaults/asset-param";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";
import { assetKey } from "@/lib/shared/asset-family";
import { vaultFamilyLead } from "@/lib/vaults/family-leads";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import {
  chainName,
  VAULT_INDEX_LISTED,
  VAULT_INDEX_PROTOCOL_LABEL,
  vaultIndexRosterHref,
  vaultIndexRosterKey,
  vaultIndexRosterKeyOf,
  type VaultIndexProtocol,
  type VaultIndexRoster,
} from "@/lib/vaults/index-rosters";
import { rosterCountProv, type RosterRead } from "@/lib/vaults/roster-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** An ISO time as seconds; null where absent or unparsable (roster-read-stamp's
 *  `isoSeconds`, which a server component cannot call from a client module). */
const isoSeconds = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

const CARD = "rounded-2xl bg-raised px-5 py-4";

/** What a vault is, and how Rails shows one. */
export function VaultOverviewIntro() {
  return (
    <section
      className="max-w-3xl space-y-3 text-sm leading-relaxed text-foreground"
      data-anatomy="E6.1"
      data-vault-overview-intro=""
    >
      <p>
        A vault is a contract that takes deposits of one token and issues shares for them. Its steward or its code puts
        the token to work, lending it or depositing it in other protocols, and each share redeems for more of the token
        as that work earns. A holder can redeem as much as the vault can pay out at the time.
      </p>
      <p>Rails shows a vault from the chain:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          The roster lists every vault of a family on a chain, with each vault&rsquo;s total assets and share price,
          read at one block.
        </li>
        <li>The vault page shows the vault&rsquo;s size, yield, withdrawals and losses.</li>
        <li>Holders lists every address holding a share, from a census of the vault&rsquo;s transfers.</li>
        <li>The steward is who can change the vault, and the page lists what they have changed.</li>
        <li>Where the assets are names the markets, strategies or pools the token sits in.</li>
        <li>Every figure carries a receipt: the contract it was read from and the block.</li>
      </ul>
      <p>
        Each family&rsquo;s roster is read at a block of its own chain, so each card below states its count at that
        block and how old the read is.
      </p>
    </section>
  );
}

/** The link's words: Maple's roster is its pools page, sBOLD's is the vault. */
const OPEN: Partial<Record<VaultIndexProtocol, string>> = {
  maple: "Open the pools page",
  sbold: "Open the vault",
};

/** The rosters that read `?asset=` on arrival (VaultRoster); Maple's pools
 *  page and sBOLD's vault page do not. */
const TAKES_ASSET: readonly VaultIndexProtocol[] = ["morpho", "aave", "yearn", "ipor-fusion"];

/** Under `?asset=`: the param, its words, and the roster's vaults over it. */
interface AssetCut {
  param: string;
  label: string;
  count: number;
}

function OverviewCard({ roster, cut }: { roster: VaultIndexRoster; cut: AssetCut | null }) {
  const { protocol, chainId } = roster;
  const label = VAULT_INDEX_PROTOCOL_LABEL[protocol];
  const read: RosterRead = {
    label: `${label} on ${chainName(chainId)}`,
    block: roster.blockNumber,
    at: isoSeconds(roster.readAt),
  };
  const counted = roster.blockNumber > 0;
  const count = cut ? cut.count : roster.count;
  const noun = `${cut ? `${cut.label} ` : ""}${count === 1 ? "vault" : "vaults"}`;
  const href = vaultIndexRosterHref(protocol, chainId);
  return (
    <article
      className={`${CARD} flex flex-col`}
      data-anatomy="E6.2"
      data-overview-card={vaultIndexRosterKey(roster)}
      data-overview-count={counted ? count : ""}
      data-overview-block={roster.blockNumber}
    >
      <header className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{label}</h2>
        <ChainLabel chainId={chainId} named anatomy={null} />
      </header>
      <p className="mt-2 text-sm text-rb-500" data-overview-lead="">
        {vaultFamilyLead(protocol, chainId)}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-sm">
        {counted ? (
          <span className="text-foreground" data-overview-vaults="">
            <Prov info={rosterCountProv(read, count, cut?.label)}>
              {n(count)} {noun}
            </Prov>
          </span>
        ) : (
          <span className="text-rb-500" data-overview-vaults="unread">
            Count not read
          </span>
        )}
        <span className="text-[11px] text-rb-500">
          <RosterReadStamp reads={[read]} />
        </span>
        <Link
          href={cut && TAKES_ASSET.includes(protocol) ? `${href}?asset=${encodeURIComponent(cut.param)}` : href}
          className={`ml-auto ${PAGE_LINK}`}
          prefetch={false}
          data-overview-roster=""
        >
          {OPEN[protocol] ?? "Open the roster"}
        </Link>
      </div>
    </article>
  );
}

const GRID = "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** The cards, read from the index (cached five minutes, shared with /start);
 *  a listed roster the read did not return draws no card. Under `?asset=`
 *  (the start page, the asset step and the search link it) a line names the
 *  asset, a card stands only where its roster has a vault over it, and its
 *  count and link are that asset's. */
export async function VaultOverviewCards({ asset }: { asset?: string }) {
  const { rosters, vaults, indexDown } = await loadVaultIndex();
  const byKey = new Map(rosters.map((r) => [vaultIndexRosterKey(r), r]));
  const names = assetParamNames(asset);
  const over = names.size > 0 ? vaults.filter((v) => vaultHasAsset(v, names)) : null;
  const label = asset && over ? assetParamLabel(asset, vaults) : null;
  const adjective = asset && over ? assetParamLabel(asset, vaults, true) : null;
  const overCount = (k: string) => (over ?? []).filter((v) => vaultIndexRosterKeyOf(v) === k).length;
  const cards = VAULT_INDEX_LISTED()
    .flatMap((r) => byKey.get(vaultIndexRosterKey(r)) ?? [])
    .filter((r) => !over || overCount(vaultIndexRosterKey(r)) > 0);
  // Each roster's vaults' asset and share keys, for Focus.
  const keys = new Map<string, string[]>();
  for (const v of vaults) {
    const k = vaultIndexRosterKeyOf(v);
    keys.set(k, [...(keys.get(k) ?? []), assetKey(v.chainId, v.asset.address), assetKey(v.chainId, v.address)]);
  }
  return (
    <>
      {indexDown && (
        <IndexNotice chainFilled={cards.some((r) => r.blockNumber > 0)} className="mt-4 text-sm text-rb-500" />
      )}
      {asset && label && (
        <p className="mt-6 text-sm text-foreground" data-overview-asset={asset}>
          {cards.length > 0 ? `Vaults over ${label}` : `No vault Rails reads is over ${label}.`}
          <span className="text-rb-500"> · </span>
          <Link href={VAULT_INDEX_HREF} className={INLINE_LINK} prefetch={false} data-overview-asset-clear="">
            Every family
          </Link>
        </p>
      )}
      {/* One receipts scope over the cards, so each count and stamp opens its receipt (decision 0062). */}
      <ProvSection scope="vault-overview" as="div">
        <VaultOverviewScope
          className={GRID}
          cards={cards.map((r) => ({ chainId: r.chainId, keys: keys.get(vaultIndexRosterKey(r)) ?? [] }))}
        >
          {cards.map((r) => {
            const k = vaultIndexRosterKey(r);
            return (
              <OverviewCard
                key={k}
                roster={r}
                cut={asset && adjective ? { param: asset, label: adjective, count: overCount(k) } : null}
              />
            );
          })}
        </VaultOverviewScope>
      </ProvSection>
    </>
  );
}

/** The cards' placeholder while the index is read. */
export function VaultOverviewCardsLoading() {
  return (
    <div className={GRID} data-vault-overview-cards="pending">
      {VAULT_INDEX_LISTED().map((r) => (
        <div key={vaultIndexRosterKey(r)} className={`${CARD} h-36 animate-pulse`} />
      ))}
    </div>
  );
}
