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
import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import { polarisFiltersToFetchParams, type PolarisListFilters } from "@/lib/polaris/list-filter-dimensions";

/** The page slice + the index's own total for the current selection. */
export async function fetchPolarisListingPage(
  filters: PolarisListFilters,
  page: number,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<{ data: PolarisPositionSummary[]; total: number; passedOn: number }> {
  return askPolaris(polarisFiltersToFetchParams(filters, page), filters, baseUrl, signal, headers);
}

/** A selection's total, one row asked (the editors' "Show N", ui-jobs 805). */
export async function countPolarisListing(filters: PolarisListFilters): Promise<number> {
  const params = { ...polarisFiltersToFetchParams(filters, 1), limit: 1, offset: 0 };
  return (await askPolaris(params, filters)).total;
}

async function askPolaris(
  params: ReturnType<typeof polarisFiltersToFetchParams>,
  filters: PolarisListFilters,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<{ data: PolarisPositionSummary[]; total: number; passedOn: number }> {
  const { ownerEns } = parsePolarisSearch(filters.q);
  if (ownerEns) {
    const address = await resolveEnsViaApi(ownerEns, baseUrl, signal);
    if (!address) return { data: [], total: 0, passedOn: 0 };
    params.wallet = address;
  }
  // A wallet search also lists the CDPs the wallet held and sent on (ui-jobs 715).
  const r = await fetchPolarisPositions({ ...params, former: Boolean(params.wallet), baseUrl, signal, headers });
  return { data: r.data, total: r.pagination.total, passedOn: r.pagination.passedOn ?? 0 };
}
