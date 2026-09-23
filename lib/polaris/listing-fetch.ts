// One page of the Polaris listing, for both halves of the page: the SSR first
// paint (app/(app)/sepolia/polaris/(views)/page.tsx) and the client driver's
// fetchPage. It is polarisFiltersToFetchParams plus the one step that cannot be
// synchronous — ENS.
//
// /api/polaris/positions filters by `wallet` and takes an ADDRESS: unlike the
// Liquity V2 proxy it does not resolve names, and a non-address wallet comes
// back 400. So an ENS search resolves forward here first (mainnet ENS is the
// right registry for a Sepolia holder — same key), and a name that resolves to
// nothing answers an empty page rather than the whole directory: no holder is
// named, so no CDP is that holder's.

import { fetchPolarisPositions } from "@/lib/api/fetch-polaris-positions";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import { parsePolarisSearch } from "@/lib/polaris/search";
import { polarisFiltersToFetchParams, type PolarisListFilters } from "@/lib/polaris/list-filter-dimensions";

/** Forward-resolve an ENS name through this deployment's own resolver route.
 *  Best-effort: an unreachable resolver reads as "no address", which the caller
 *  turns into an empty page. */
async function resolveEns(name: string, baseUrl?: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl ?? ""}/api/ens/resolve?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const { address } = (await res.json()) as { address: string | null };
    return address ?? null;
  } catch {
    return null;
  }
}

/** The page slice + the index's own total for the current selection. */
export async function fetchPolarisListingPage(
  filters: PolarisListFilters,
  page: number,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<{ data: PolarisPositionSummary[]; total: number }> {
  const params = polarisFiltersToFetchParams(filters, page);
  const { ownerEns } = parsePolarisSearch(filters.q);
  if (ownerEns) {
    const address = await resolveEns(ownerEns, baseUrl, signal);
    if (!address) return { data: [], total: 0 };
    params.wallet = address;
  }
  const r = await fetchPolarisPositions({ ...params, baseUrl, signal, headers });
  return { data: r.data, total: r.pagination.total };
}
