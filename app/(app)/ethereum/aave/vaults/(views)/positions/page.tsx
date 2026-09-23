// Every Aave vault position on Ethereum — /ethereum/aave/vaults/positions.
// ----------------------------------------------------------------------------
// Every position in Aave's vault layer as a card, live and closed, on the same
// shared listing driver every explorer's positions ride (memory
// `chain-truth-listing-driver-ssr`: ONE driver for ALL listings) — the Liquity
// V2 grammar.
//
// WHERE THE OTHER SURFACES ARE. The VAULTS tab lands on the roster,
// /ethereum/aave/vaults, read from chain at one block it names; this listing
// sits one segment under it, because a listing is a way of reaching a vault
// page and never a second home for it (rails-ops decision 0028 point 8). How
// the vault layer is built, in words, is at /ethereum/aave/vaults/info. A
// position has a path of its own, /ethereum/aave/vaults/<vault>/<holder>.
//
// A POSITION IS `(vault, holder)`. A holder of three vaults is three positions,
// the way a trove is `(branch, id)`.
//
// MEMBERSHIP IS THE CENSUS AND ONLY THE CENSUS. The set of participants comes
// from a daily whole-`Transfer` sweep per vault, proven complete by
// Σ `balanceOf` == `totalSupply()` wei-exact. It is never assembled from what
// visitors searched: that would be a public record of who looked at what, and
// it could never state "N holders" or "the largest holder" truthfully. A search
// for an address the census does not know answers zero rows and inserts nothing.
//
// This half decodes the URL, fetches the first page through this deployment's
// own /api/vaults/positions proxy (which adds the live overlay), and hands the
// rows plus the census header to the client half as SSR first-paint data.
//
// THE SECTION'S OWN RAIL HEADER, NOT A PROTOCOL'S. A vault is not an explorer
// (rails-ops decisions 0014, 0017), so `protocolForHref` finds no roster entry
// for this path; the client half hands the driver the section's own rail
// (components/vaults/vaults-rail-header.tsx) in the `identity` slot instead,
// and the h1 goes sr-only under it the way every protocol listing's does.

import { VaultPositionsListing } from "./vault-positions-listing";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import {
  vaultPositionListDimensions,
  vaultPositionFiltersToFetchParams,
  VAULT_POSITION_LIST_DEFAULTS,
} from "@/lib/aave-vaults/position-list-filter-dimensions";
import { toURLSearchParams, ssrDecode, ssrInitial, type RawSearchParams } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { VaultCensusRow, VaultPositionRow } from "@/lib/aave-vaults/vault-position";

export const dynamic = "force-dynamic";
// The function limit the listing SSR bound sits under (lib/shared/listing-ssr.ts).
export const maxDuration = 30;

export const metadata = listingMetadata({
  title: "Vault positions on Ethereum",
  canonicalPath: "/ethereum/aave/vaults/positions",
  description:
    "Every address that holds — or has ever held — a share of one of Aave's own ERC-4626 vaults on Ethereum, live and closed, as position cards. Filter by vault, family, status and what the holding address is; shares, claim and share of the vault read from chain at one block.",
});

export default async function VaultPositionsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dims = vaultPositionListDimensions();
  const sp = toURLSearchParams(await searchParams);
  const { filters, page } = ssrDecode(dims, sp, VAULT_POSITION_LIST_DEFAULTS);

  // The census header rides out of the same response as the rows, so the facet
  // universe and the block line are never sized from a page of rows. It is
  // captured here and passed down beside the SSR rows.
  let census: VaultCensusRow[] = [];
  let blockNumber: number | null = null;

  const initial = await ssrInitial<typeof filters, VaultPositionRow>({
    dims,
    defaults: VAULT_POSITION_LIST_DEFAULTS,
    filters,
    page,
    label: "Ethereum vault positions",
    fetchPage: (baseUrl, signal, headers) =>
      fetchVaultPositions({ ...vaultPositionFiltersToFetchParams(filters, page), baseUrl, signal, headers }).then(
        (r) => {
          census = r.census;
          blockNumber = r.blockNumber;
          return { data: r.data, total: r.pagination.total };
        },
      ),
  });

  return (
    <VaultPositionsListing
      {...initial}
      initialSearch={sp.toString()}
      initialCensus={census}
      initialBlockNumber={blockNumber}
    />
  );
}
