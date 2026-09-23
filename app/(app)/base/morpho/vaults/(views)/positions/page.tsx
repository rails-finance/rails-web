// Every MetaMorpho position on Base — /base/morpho/vaults/positions.
// ----------------------------------------------------------------------------
// Every position in the MetaMorpho catalogue on Base as a card, live and
// closed, on the same shared listing driver every explorer's positions ride
// (memory `chain-truth-listing-driver-ssr`: ONE driver for ALL listings) — the
// Liquity V2 grammar.
//
// WHERE THE OTHER SURFACES ARE. The VAULTS tab lands on the roster,
// /base/morpho/vaults, read from chain at one block it names; this listing sits
// one segment under it, because a listing is a way of reaching a vault page and
// never a second home for it (rails-ops decision 0028 point 8). How the vault
// layer is built, in words, is at /base/morpho/vaults/info. A position has a
// path of its own, /base/morpho/vaults/<vault>/<holder>.
//
// A POSITION IS `(vault, holder)`. A holder of three vaults is three positions,
// the way a trove is `(branch, id)`.
//
// MEMBERSHIP IS THE CENSUS AND ONLY THE CENSUS. The set of participants comes
// from a daily whole-`Transfer` sweep per vault — from each vault's own
// creation block, because on Base a fixed floor of six million blocks is 139
// days and would cut a life in half — proven complete by Σ `balanceOf` ==
// `totalSupply()` wei-exact. It is never assembled from what visitors searched:
// that would be a public record of who looked at what, and it could never state
// "N holders" or "the largest holder" truthfully. A search for an address the
// census does not know answers zero rows and inserts nothing.
//
// This half decodes the URL, fetches the first page through this deployment's
// own /api/vaults/positions proxy (which adds the live overlay), and hands the
// rows plus the census header to the client half as SSR first-paint data.
//
// MORPHO'S OWN RAIL HEADER. The vault layer is a view of the Morpho Blue Base
// explorer (rails-ops decision 0028), so the client half hands the driver that
// explorer's `RailHeader` in the `identity` slot with the VAULTS tab lit, and
// the h1 goes sr-only under it the way every protocol listing's does.

import { BaseVaultPositionsListing } from "./base-vault-positions-listing";
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
  title: "Vault positions on Base",
  canonicalPath: "/base/morpho/vaults/positions",
  description:
    "Every address that holds — or has ever held — a share of a MetaMorpho vault catalogued on Base, live and closed, as position cards. Filter by vault, status and what the holding address is; shares, claim and share of the vault read from chain at one block.",
});

export default async function BaseVaultPositionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = baseVaultPositionListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, BASE_VAULT_POSITION_LIST_DEFAULTS);

  // The census header rides out of the same response as the rows, so the facet
  // universe and the block line are never sized from a page of rows. It is
  // captured here and passed down beside the SSR rows.
  let census: VaultCensusRow[] = [];
  let blockNumber: number | null = null;

  const initial = await ssrInitial<typeof filters, VaultPositionRow>({
    dims,
    defaults: BASE_VAULT_POSITION_LIST_DEFAULTS,
    filters,
    page,
    label: "Base vault positions",
    fetchPage: (baseUrl, signal, headers) =>
      fetchVaultPositions({ ...baseVaultPositionFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => {
          census = r.census;
          blockNumber = r.blockNumber;
          return { data: r.data, total: r.pagination.total };
        },
      ),
  });

  return (
    <BaseVaultPositionsListing
      {...initial}
      initialSearch={sp.toString()}
      initialCensus={census}
      initialBlockNumber={blockNumber}
    />
  );
}
