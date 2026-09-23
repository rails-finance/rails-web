// MakerDAO vault listing — the page fetch, shared by the browser and the SSR
// first paint so both ask the index exactly the same question.
//
// It exists for one wrinkle the params object cannot carry. A 20-byte address
// typed into the search box is one of two different things: the OWNER of a set
// of vaults, or a urn addressed directly (the cdp-less identity a LockStake
// Engine vault has). rails-server takes both, as `owner` and `urn` — but it ANDs
// its conditions, so there is no single request that means "either". Asking for
// the owner and then, only on an empty answer, for the urn costs a second
// request in the miss case alone, and keeps the search resolving both identities
// the way the retired in-memory tier did (it matched the substring against
// either column).

import { fetchMakerVaults } from "@/lib/api/fetch-makerdao-vaults";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import { makerFiltersToFetchParams, type MakerListFilters, type MakerRosterState } from "./list-filter-dimensions";

export interface MakerVaultPage {
  data: MakerVaultSummary[];
  total: number;
}

const EMPTY: MakerVaultPage = { data: [], total: 0 };

export async function fetchMakerVaultPage(
  filters: MakerListFilters,
  page: number,
  roster: MakerRosterState | undefined,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<MakerVaultPage> {
  const params = makerFiltersToFetchParams(filters, page, roster);
  // Null = a selection nothing can match (a collateral type no ilk is named, a
  // typed name with no roster to resolve it). No request: rails-server ignores
  // params it cannot answer, so asking anyway would return the whole index.
  if (!params) return EMPTY;

  const first = await fetchMakerVaults({ ...params, baseUrl, signal, headers });
  if (first.pagination.total > 0 || !params.owner) {
    return { data: first.data, total: first.pagination.total };
  }

  // Nothing owned by that address. It may BE a vault — retry the same question
  // with the address read as a urn.
  const asUrn = await fetchMakerVaults({ ...params, owner: undefined, urn: params.owner, baseUrl, signal, headers });
  return { data: asUrn.data, total: asUrn.pagination.total };
}
