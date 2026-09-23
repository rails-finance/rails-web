// The Base vault-position listing's filter registry — SERVER-DRIVEN.
// ----------------------------------------------------------------------------
// The sibling of lib/aave-vaults/position-list-filter-dimensions.tsx, and the
// same seam: the census holds every participant of every catalogued vault, live
// and closed, so the listing pages against the store and the URL-backed
// selection maps onto the /api/vaults/positions fetch params. Dimensions carry
// a `param` (the shareable URL) and no in-memory `matches`.
//
// THE OPTION UNIVERSE COMES FROM THE CENSUS HEADER, NEVER FROM A PAGE OF ROWS
// (memory `listing-truncation-and-timeline-axes`). Every response carries one
// census row per vault on the chain — 511 of them here — so the `vault` menu is
// sized from the census and not from the twenty rows that happen to be on
// screen.
//
// FOUR FACETS, NOT FIVE. Ethereum's listing offers a `family` menu because
// Aave deploys three vault families with three mechanics. Every catalogued
// vault on Base is MetaMorpho, so family has exactly one value here — and a
// menu with one option is not a facet, it is a label. The word still appears on
// every card beside the share symbol, because that is where it says something.
// The `Size` facet and the value sort are the Ethereum file's, shared: the
// figure they bracket is the same census-block USD reading on both chains.
//
// AND THE VAULT MENU OFFERS ONLY WHAT THE WHERE MATCHES. 268 of the catalogued
// vaults have never had a single `Transfer`, so their census row states zero
// participants; offering them as filter options would be 268 choices that
// always answer an empty page (memory `moonwell-base-asset-facets`: a facet
// offers only what the WHERE matches). They are not dropped in silence — the
// roster drawer beside this listing states each of them as "no holder yet",
// which is a chain reading rather than an omission.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { joinOptionLabels } from "@/components/shared/filter-bar/types";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { VAULT_POSITION_SHAPES, VAULT_SHAPE_FACET_LABEL, type VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import {
  parseVaultPositionSearch,
  vaultOptionCount,
  vaultSizeDimension,
  VAULT_POSITION_SORT_OPTIONS,
} from "@/lib/aave-vaults/position-list-filter-dimensions";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { FetchVaultPositionsParams } from "@/lib/api/fetch-vault-positions";

/** The backend caps `limit` at 100; 20 keeps the page light, matches every
 *  other listing in the tier, and keeps the live overlay's batch small. */
export const BASE_VAULT_POSITION_ITEMS_PER_PAGE = 20;

export interface BaseVaultPositionListFilters extends BaseListFilters {
  /** A single vault address, lowercased. */
  vault?: string;
  /** "live" | "closed". Undefined = both, the resting view. */
  status?: string;
  shape?: string;
  /** A `Size` bracket's wire value — a whole-dollar lower bound, or "unpriced". */
  size?: string;
}

/** Resting view: every participant of every vault, live and closed, LARGEST
 *  VALUE FIRST (decision D2 of the size-floor plan): page one is the part of a
 *  vault worth browsing, and the dust tail — five sub-0.003 mwETH wallets in a
 *  row was the brief — surfaces only when sorted for. `status` and `size` stay
 *  out of the object so a cleared selection resolves back to "show everything"
 *  and writes no chip. */
export const BASE_VAULT_POSITION_LIST_DEFAULTS: BaseVaultPositionListFilters = {
  q: "",
  sortBy: "value",
  sortOrder: "desc",
};

// The same six sorts as Ethereum's listing, in the same order — the wire values
// are the backend's own sort fields and the figures they order are the same
// census columns on both chains.
export const BASE_VAULT_POSITION_SORT_OPTIONS: SortOption[] = VAULT_POSITION_SORT_OPTIONS;

/** The `vault` facet's options: one per census row that has at least one
 *  position the applied Status filter matches, labelled with the share token's
 *  symbol as the census read it and ordered by that count. Four vaults hold
 *  half of every position on this chain, so that order is the one a reader can
 *  act on.
 *
 *  A symbol is not an identity: on the full census three held vaults are
 *  named plainly "USDC" and two of those hold one position each, so their
 *  labels collided and a reader could not tell which vault a choice was. Where
 *  a symbol repeats among the OFFERED vaults, the label carries the address
 *  too (the address is the identity; the symbol is what the contract says). */
export function baseVaultOptionsFromCensus(census: readonly VaultCensusRow[], status?: string): FilterOptionDef[] {
  const held = census.filter((c) => vaultOptionCount(c, status) > 0);
  return [...held]
    .sort(
      (a, b) =>
        vaultOptionCount(b, status) - vaultOptionCount(a, status) ||
        (a.symbol ?? a.vault).localeCompare(b.symbol ?? b.vault, "en-US") ||
        a.vault.localeCompare(b.vault),
    )
    .map((c) => ({
      value: c.vault,
      label: baseVaultOptionLabel(c, held, status),
    }));
}

/** The label one option wears — stated apart so a verifier can restate it. The
 *  count is the one the applied Status filter matches (`vaultOptionCount`). */
export function baseVaultOptionLabel(c: VaultCensusRow, offered: readonly VaultCensusRow[], status?: string): string {
  const symbol = c.symbol ?? c.vault.slice(0, 10);
  const repeated = c.symbol != null && offered.some((o) => o.vault !== c.vault && o.symbol === c.symbol);
  const name = repeated ? `${symbol} ${c.vault.slice(0, 6)}…${c.vault.slice(-4)}` : symbol;
  return `${name} · ${vaultOptionCount(c, status).toLocaleString("en-US")}`;
}

/**
 * The listing's dimensions. `census` is passed on the client so the vault menu
 * carries the catalogue and its counts; the SSR decode path calls this bare
 * (options change the toolbar's chrome, never the URL codec or the listKey), so
 * both halves derive an identical key.
 */
export function baseVaultPositionListDimensions(
  census: readonly VaultCensusRow[] = [],
  status?: string,
): SerializableDimension<BaseVaultPositionListFilters>[] {
  const vault: SerializableDimension<BaseVaultPositionListFilters> = {
    id: "vault",
    label: "Vault",
    group: "Vault",
    cardinality: "single",
    param: "vault",
    options: baseVaultOptionsFromCensus(census, status),
    get: (f) => (f.vault ? [f.vault] : []),
    set: (f, values) => ({ ...f, vault: values[0] ? values[0].toLowerCase() : undefined }),
    chipLabel: (vals, opts) => `Vault: ${joinOptionLabels(vals, opts)}`,
  };

  // Two states, and the resting view is both — so an empty selection writes no
  // param and no chip. "Open" is the shared pill word (decision D4): a vault
  // position that holds shares is open, and this listing does not invent a
  // vault-only vocabulary for the one axis every listing already has.
  const statusDim: SerializableDimension<BaseVaultPositionListFilters> = {
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "single",
    param: "status",
    options: [
      { value: "live", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
    get: (f) => (f.status ? [f.status] : []),
    set: (f, values) => ({ ...f, status: values[0] || undefined }),
    chipLabel: (vals, opts) => joinOptionLabels(vals, opts),
  };

  const shape: SerializableDimension<BaseVaultPositionListFilters> = {
    id: "shape",
    label: "Holder",
    group: "Holder",
    cardinality: "single",
    param: "shape",
    options: VAULT_POSITION_SHAPES.map((s) => ({ value: s, label: VAULT_SHAPE_FACET_LABEL[s] })),
    get: (f) => (f.shape ? [f.shape] : []),
    set: (f, values) => ({ ...f, shape: values[0] || undefined }),
    chipLabel: (vals, opts) => `Holder: ${joinOptionLabels(vals, opts)}`,
  };

  return [vault, statusDim, shape, vaultSizeDimension<BaseVaultPositionListFilters>()];
}

/** Map the decoded selection + page onto the /api/vaults/positions params. */
export function baseVaultPositionFiltersToFetchParams(
  filters: BaseVaultPositionListFilters,
  page: number,
): FetchVaultPositionsParams {
  return {
    chainId: BASE_CHAIN_ID,
    ...parseVaultPositionSearch(filters.q),
    vault: filters.vault,
    status: filters.status,
    shape: filters.shape,
    size: filters.size,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: BASE_VAULT_POSITION_ITEMS_PER_PAGE,
    offset: (page - 1) * BASE_VAULT_POSITION_ITEMS_PER_PAGE,
  };
}
