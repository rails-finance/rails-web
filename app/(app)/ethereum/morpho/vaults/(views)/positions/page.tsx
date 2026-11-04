// Every MetaMorpho position on Ethereum — /ethereum/morpho/vaults/positions
// (rails-ops ui-jobs 486).
// ----------------------------------------------------------------------------
// The Base listing's twin (app/(app)/base/morpho/vaults/(views)/positions/
// page.tsx states the shape): every position in the MetaMorpho roster on
// Ethereum as a card, live and closed, on the shared listing driver. The census
// read is scoped to `morpho`, since chain 1 also holds Aave's vault families.
// Membership is the census and only the census.

import { BaseVaultPositionsListing } from "@/app/(app)/base/morpho/vaults/(views)/positions/base-vault-positions-listing";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import {
  baseVaultPositionListDimensions,
  baseVaultPositionFiltersToFetchParams,
  BASE_VAULT_POSITION_LIST_DEFAULTS,
} from "@/lib/morpho-base/position-list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { VaultCensusRow, VaultPositionRow } from "@/lib/aave-vaults/vault-position";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Vault positions on Ethereum",
  canonicalPath: "/ethereum/morpho/vaults/positions",
  description:
    "Every address that holds — or has ever held — a share of a MetaMorpho vault catalogued on Ethereum, live and closed, as position cards. Filter by vault, status and what the holding address is; shares, claim and share of the vault read from chain at one block.",
});

export default async function EthereumMorphoVaultPositionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const dims = baseVaultPositionListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, BASE_VAULT_POSITION_LIST_DEFAULTS);

  let census: VaultCensusRow[] = [];
  let blockNumber: number | null = null;

  const initial = await ssrInitial<typeof filters, VaultPositionRow>({
    dims,
    defaults: BASE_VAULT_POSITION_LIST_DEFAULTS,
    filters,
    page,
    label: "Ethereum MetaMorpho vault positions",
    fetchPage: (baseUrl, signal, headers) =>
      fetchVaultPositions({
        ...baseVaultPositionFiltersToFetchParams(filters, page, 1),
        baseUrl,
        signal,
        headers,
      }).then((r) => {
        census = r.census;
        blockNumber = r.blockNumber;
        return { data: r.data, total: r.pagination.total };
      }),
  });

  return (
    <BaseVaultPositionsListing
      {...initial}
      chainId={1}
      initialSearch={sp.toString()}
      initialCensus={census}
      initialBlockNumber={blockNumber}
    />
  );
}
