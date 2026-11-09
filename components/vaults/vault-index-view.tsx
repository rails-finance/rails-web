"use client";

// The cross-protocol vault index (rails-ops ui-jobs 39; decision 0028 point 8):
// the shared roster (components/vaults/vault-roster.tsx) over the union of the
// vault rosters, its rows the index's table (vault-index-table.tsx, ui-jobs 538).
// ----------------------------------------------------------------------------
// The index owns no vault page: every row opens the vault's page under its
// protocol, a Maple pool's opening Maple's pools page. Facets: Token (by
// symbol, across chains), Network and Protocol, with the rosters' search.
// Each roster was read at its block and the read-at line names each one.
// No USD and no cross-asset total. The index carries no receipts and offers
// no inspector (Miles, 8 Nov 2026): each vault's page keeps them.

import Link from "next/link";
import { ProvUnscoped } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { VaultIndexTable, useVaultIndexSort } from "@/components/vaults/vault-index-table";
import { CompareBar } from "@/components/vaults/compare-selection";
import { isoSeconds, RosterBlock, RosterReadStamp } from "@/components/vaults/roster-read-stamp";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { protocolForPathname } from "@/lib/shared/protocols";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { symbolsOfKeyword } from "@/lib/shared/asset-categories";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import {
  chainName,
  VAULT_INDEX_PROTOCOL_LABEL,
  VAULT_INDEX_PROTOCOLS,
  VAULT_INDEX_ROSTERS,
  vaultIndexHoldersHref,
  vaultIndexHref,
  vaultIndexKey,
  vaultIndexProtocol,
  vaultIndexRosterHref,
  vaultIndexRosterKey,
  vaultIndexRosterKeyOf,
  type VaultIndexRoster,
} from "@/lib/vaults/index-rosters";

const n = (v: number) => v.toLocaleString("en-US");

/** Each row's lead zone: the roster entry whose route holds the vault's
 *  family directory (Maple: its pools page), keyed by protocol and chain
 *  (Morpho is on two); its tint and mark are that entry's. */
const LEAD_IDS = Object.fromEntries(
  VAULT_INDEX_ROSTERS.map((r) => [
    vaultIndexRosterKey(r),
    protocolForPathname(vaultIndexRosterHref(r.protocol, r.chainId))?.id ?? null,
  ]),
) as Record<string, string | null>;

const FACETS: VaultRosterFacet[] = [
  {
    id: "network",
    label: "Network",
    valueOf: (v) => String(v.chainId),
    labelOf: (c) => chainName(Number(c)),
  },
  {
    id: "protocol",
    label: "Protocol",
    valueOf: (v) => vaultIndexProtocol(v),
    labelOf: (p) => VAULT_INDEX_PROTOCOL_LABEL[p as keyof typeof VAULT_INDEX_PROTOCOL_LABEL] ?? p,
    order: VAULT_INDEX_PROTOCOLS,
  },
];

// One token across chains: USDC on Base and USDC on Ethereum are one option.
// An asset whose symbol did not decode is an option by address.
const TOKEN_FACET: VaultRosterFacet = {
  id: "asset",
  label: "Token",
  valueOf: (v) => (v.asset.named ? v.asset.symbol : v.asset.address),
  labelOf: (s) => s,
};

/** The index states no receipts: its figures are plain, each vault's page
 *  carries them (check:prov reads this). */
export const PROV_EXEMPT = "the cross-protocol index states no receipts; each vault's page carries them (ui-jobs 538)";

export function VaultIndexView({
  initialSearch,
  vaults,
  yields,
  rosters,
  asset,
}: {
  /** The query string the page was served with (the roster's preset and sort). */
  initialSearch?: string;
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  rosters: VaultIndexRoster[];
  /** `?asset=`: the Token facet chosen on arrival, one symbol or a comma
   *  list, matched without case; a keyword (`stablecoins`) stands for its
   *  category's symbols (the search's "USDC vaults" row, ui-jobs 482). */
  asset?: string;
}) {
  // A comma list chooses each named token that has a vault (the guided way
  // in's "Earning in ETH", ui-jobs 478); a name with none is dropped.
  const assetValues = asset
    ? [
        ...new Set(
          asset
            .split(",")
            .map((a) => a.trim().toLowerCase())
            .filter(Boolean)
            .flatMap((a) => {
              const named = new Set([a, ...symbolsOfKeyword(a).map((s) => s.toLowerCase())]);
              return vaults.map(TOKEN_FACET.valueOf).filter((value) => named.has(value.toLowerCase()));
            }),
        ),
      ]
    : [];
  // `?network=` and `?protocol=` (written by the roster, which keeps its
  // facets in the URL here) choose those facets on arrival, as `?asset=` does.
  const indexSort = useVaultIndexSort(initialSearch ?? "");
  const arrival = new URLSearchParams(initialSearch ?? "");
  const chosen = (id: string, known: string[]) =>
    (arrival.get(id) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => known.includes(x));
  const networks = chosen("network", [...new Set(vaults.map((v) => String(v.chainId)))]);
  const protocols = chosen("protocol", [...VAULT_INDEX_PROTOCOLS]);
  const initialFilters = {
    ...(assetValues.length > 0 ? { [TOKEN_FACET.id]: assetValues } : {}),
    ...(networks.length > 0 ? { network: networks } : {}),
    ...(protocols.length > 0 ? { protocol: protocols } : {}),
  };

  const hooksOf = (v: VaultSummary) => ({
    "data-protocol": vaultIndexProtocol(v),
    "data-chain": String(v.chainId),
    "data-family": v.family,
  });

  const total = vaults.length;

  const readOf = (r: VaultIndexRoster) => ({
    label: `${VAULT_INDEX_PROTOCOL_LABEL[r.protocol]} on ${chainName(r.chainId)}`,
    block: r.blockNumber,
    at: r.readBy?.blockTime ?? isoSeconds(r.readAt),
  });
  const counts = rosters.filter((r) => !r.chainStale);

  // One stamp for the oldest roster's read; the panel names each roster's block.
  const readAt = <RosterReadStamp reads={counts.map(readOf)} />;

  const drawer = (
    <p data-index-counts={total}>
      Every vault the rosters list:{" "}
      {counts.map((r, i) => (
        <span
          key={vaultIndexRosterKey(r)}
          data-index-key={vaultIndexRosterKey(r)}
          data-index-count={r.protocol}
          data-count={r.count}
          data-index-roster={r.protocol}
          data-index-chain={r.chainId}
          data-index-block={r.blockNumber}
        >
          {i > 0 && ", "}
          <Link href={vaultIndexRosterHref(r.protocol, r.chainId)} className={PAGE_LINK} prefetch={false}>
            {VAULT_INDEX_PROTOCOL_LABEL[r.protocol]}
          </Link>{" "}
          {n(r.count)} at <RosterBlock read={readOf(r)} chainId={r.chainId} />
          {r.chainId !== MAINNET_CHAIN_ID && ` on ${chainName(r.chainId)}`}
        </span>
      ))}
      ; each row opens under its protocol.
    </p>
  );

  return (
    // The whole index is exempt from the coverage tripwire, its reason on the
    // element (the tripwire reads `data-prov-exempt`).
    <div data-prov-exempt={PROV_EXEMPT}>
      <ProvUnscoped>
        <VaultRoster
          initialSearch={initialSearch}
          vaults={vaults}
          yields={yields}
          chainId={MAINNET_CHAIN_ID as ChainId}
          blockNumber={0}
          chainStale={rosters.every((r) => r.chainStale)}
          skel="index"
          facets={FACETS}
          assetFacet={TOKEN_FACET}
          initialFilters={initialFilters}
          facetsInUrl
          hrefOf={vaultIndexHref}
          holdersHrefOf={vaultIndexHoldersHref}
          receiptsOf={() => ({})}
          hooksOf={hooksOf}
          mobileSort={indexSort.mobileSort}
          table={(rows, part) => (
            <VaultIndexTable
              rows={rows}
              part={part}
              initialSearch={initialSearch ?? ""}
              yieldOf={(v) => yields[vaultIndexKey(v)]}
              leadOf={(v) => LEAD_IDS[vaultIndexRosterKeyOf(v)] ?? null}
              hrefOf={vaultIndexHref}
              holdersHrefOf={vaultIndexHoldersHref}
              hooksOf={hooksOf}
            />
          )}
          head={{
            census: null,
            censusFigure: "index-census",
            listingHref: null,
            infoHref: null,
            indexHref: null,
            readAt,
            drawer,
          }}
        />
      </ProvUnscoped>
      <CompareBar />
    </div>
  );
}
