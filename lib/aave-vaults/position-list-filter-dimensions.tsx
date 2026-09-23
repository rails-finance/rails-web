// The vault-position listing's filter registry — SERVER-DRIVEN.
// ----------------------------------------------------------------------------
// The census holds every participant of every catalogued vault, live and
// closed, so the listing pages against the store exactly as Liquity V2 pages
// against rails-server: the URL-backed selection maps onto the
// /api/vaults/positions fetch params and the backend filters, sorts and pages.
// Dimensions carry a `param` (the shareable URL) and no in-memory `matches`.
//
// THE OPTION UNIVERSE COMES FROM THE CENSUS HEADER, NEVER FROM A PAGE OF ROWS
// (memory `listing-truncation-and-timeline-axes`). Every response carries one
// census row per vault on the chain, so the `vault` menu is the whole
// catalogue — including the five vaults no address has ever held, which are
// stated as such rather than missing. A menu sized from twenty rows would name
// whichever three vaults the first page happened to hold.
//
// FIVE FACETS: vault, family, status, shape, size. `status` rests on BOTH
// (decision D3) — no chip at rest, the way Liquity V2's status facet rests on
// everything. `shape` is a MECHANISM facet: what the holding address's own code
// IS, from the census's classification. It is not an app facet and never
// becomes one. `size` is a VALUE facet over the census-block USD figure (mig
// 206, plan `listing-size-floor`): four whole-dollar lower bounds and the
// unpriced set, so the dust tail — the median wallet in a retail vault holds
// under a millionth of a share — is something a reader opts INTO. The resting
// view has no size chip; it rests on the value SORT instead, so page one is the
// largest positions and every existing URL keeps its meaning.
//
// THE VAULT CHIP'S COUNT FOLLOWS THE WHERE. Under Open the count beside each
// vault is its live positions, under Closed its closed ones, and otherwise
// every participant — all three are in the census header, so the option
// universe is still never sized from a page of rows.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { joinOptionLabels } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { AAVE_VAULT_FAMILY_ORDER } from "@/lib/aave-vaults/vault-catalog";
import { AAVE_FAMILY_LABEL } from "@/components/vaults/aave-vault-format";
import { VAULT_POSITION_SHAPES, VAULT_SHAPE_FACET_LABEL, type VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import type { FetchVaultPositionsParams } from "@/lib/api/fetch-vault-positions";

/** The backend caps `limit` at 100; 20 keeps the page light, matches the other
 *  listings, and keeps the live overlay's batch at ≤ 40 + 18 calls. */
export const VAULT_POSITION_ITEMS_PER_PAGE = 20;

export interface VaultPositionListFilters extends BaseListFilters {
  /** A single vault address, lowercased. */
  vault?: string;
  family?: string;
  /** "live" | "closed". Undefined = both, the resting view. */
  status?: string;
  shape?: string;
  /** A `Size` bracket's wire value — a whole-dollar lower bound, or "unpriced".
   *  Undefined = every row, the resting view. */
  size?: string;
}

/** Resting view: every participant of every vault, live and closed, LARGEST
 *  VALUE FIRST (decision D2 of the size-floor plan) — so page one is the part
 *  of a vault worth browsing and the dust surfaces only when sorted for.
 *  `status` and `size` stay out of the object so a cleared selection resolves
 *  back to "show everything" and writes no chip. */
export const VAULT_POSITION_LIST_DEFAULTS: VaultPositionListFilters = {
  q: "",
  sortBy: "value",
  sortOrder: "desc",
};

/** The `Size` facet's brackets, in whole dollars — lower bounds only (decision
 *  D4). Labels and wire values both come from this one array. */
export const VAULT_SIZE_BRACKETS = [1000, 10000, 100000, 1000000] as const;
/** The wire value that selects exactly the rows the census's oracle could not
 *  price — offered as its own option so an unpriced vault's holders are one
 *  click away rather than invisible under every bracket. */
export const VAULT_SIZE_UNPRICED = "unpriced";

export const VAULT_SIZE_OPTIONS: FilterOptionDef[] = [
  ...VAULT_SIZE_BRACKETS.map((b) => ({ value: String(b), label: `$${b.toLocaleString("en-US")} or more` })),
  { value: VAULT_SIZE_UNPRICED, label: "Unpriced" },
];

/** The `Size` facet — shared by both chains' listings, because the value it
 *  brackets is the same census-block figure on both. */
export function vaultSizeDimension<F extends { size?: string }>(): SerializableDimension<F> {
  return {
    id: "size",
    label: "Size",
    group: "Size",
    cardinality: "single",
    param: "size",
    options: VAULT_SIZE_OPTIONS,
    get: (f) => (f.size ? [f.size] : []),
    set: (f, values) => ({ ...f, size: values[0] || undefined }),
    chipLabel: (vals, opts) => `Size: ${joinOptionLabels(vals, opts)}`,
  };
}

// The wire values are the backend's own sort fields. "Value" orders on the
// census-block USD figure (mig 206) — the one unit that compares across vaults
// whose shares are USDC, WETH and cbBTC — with unpriced rows last. "Share of
// the vault" orders each row's balance over its own vault's supply, the
// cross-vault ORDER the raw shares sort was never able to be. "Shares held"
// still sorts on the RAW balance, which is a different unit per vault (6-, 8-
// and 18-decimal share tokens all sit in this list) — the label says so, and
// the page's intro drawer says it again in full.
export const VAULT_POSITION_SORT_OPTIONS: SortOption[] = [
  { value: "value", label: "Value · USD at census" },
  { value: "share", label: "Share of the vault" },
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "firstSeen", label: "First Seen" },
  { value: "shares", label: "Shares (raw units)" },
  { value: "transfers", label: "Transfers" },
];

/** The count a vault option wears, following the applied Status filter: live
 *  positions under Open, closed ones under Closed, every participant otherwise.
 *  All three are in the census header. */
export function vaultOptionCount(c: Pick<VaultCensusRow, "participants" | "liveCount">, status?: string): number {
  if (status === "live") return c.liveCount;
  if (status === "closed") return c.participants - c.liveCount;
  return c.participants;
}

/** The `vault` facet's options: one per census row, labelled with the share
 *  token's symbol as the census read it and the count the applied Status
 *  filter matches, grouped by family in the menu. A vault no address has ever
 *  held keeps its option and says so — a zero is a reading, and dropping the
 *  row would state nothing at all; under a Status filter a vault with none of
 *  that status says that in words too. */
export function vaultOptionsFromCensus(census: readonly VaultCensusRow[], status?: string): FilterOptionDef[] {
  const order = new Map(AAVE_VAULT_FAMILY_ORDER.map((f, i) => [f, i]));
  return [...census]
    .sort((a, b) => {
      // A family word this chain's own order does not carry sorts last; on
      // chain 1 there is none, and the map is keyed by that chain's three.
      const fa = order.get(a.family as (typeof AAVE_VAULT_FAMILY_ORDER)[number]) ?? 99;
      const fb = order.get(b.family as (typeof AAVE_VAULT_FAMILY_ORDER)[number]) ?? 99;
      if (fa !== fb) return fa - fb;
      const ca = vaultOptionCount(a, status);
      const cb = vaultOptionCount(b, status);
      if (cb !== ca) return cb - ca;
      return (a.symbol ?? a.vault).localeCompare(b.symbol ?? b.vault, "en-US");
    })
    .map((c) => {
      const name = c.symbol ?? c.vault.slice(0, 10);
      const count = vaultOptionCount(c, status);
      const none = status === "live" ? "none open" : status === "closed" ? "none closed" : "no holder yet";
      return {
        value: c.vault,
        label: count === 0 ? `${name} · ${none}` : `${name} · ${count.toLocaleString("en-US")}`,
      };
    });
}

/**
 * The listing's dimensions. `census` is passed on the client so the vault menu
 * carries the catalogue and its counts; the SSR decode path calls this bare
 * (options change the toolbar's chrome, never the URL codec or the listKey), so
 * both halves derive an identical key.
 */
export function vaultPositionListDimensions(
  census: readonly VaultCensusRow[] = [],
  status?: string,
): SerializableDimension<VaultPositionListFilters>[] {
  const vault: SerializableDimension<VaultPositionListFilters> = {
    id: "vault",
    label: "Vault",
    group: "Vault",
    cardinality: "single",
    param: "vault",
    options: vaultOptionsFromCensus(census, status),
    get: (f) => (f.vault ? [f.vault] : []),
    set: (f, values) => ({ ...f, vault: values[0] ? values[0].toLowerCase() : undefined }),
    chipLabel: (vals, opts) => `Vault: ${joinOptionLabels(vals, opts)}`,
  };

  const family: SerializableDimension<VaultPositionListFilters> = {
    id: "family",
    label: "Family",
    group: "Family",
    cardinality: "single",
    param: "family",
    options: AAVE_VAULT_FAMILY_ORDER.map((f) => ({ value: f, label: AAVE_FAMILY_LABEL[f] })),
    get: (f) => (f.family ? [f.family] : []),
    set: (f, values) => ({ ...f, family: values[0] || undefined }),
    chipLabel: (vals, opts) => `Family: ${joinOptionLabels(vals, opts)}`,
  };

  // Two states, and the resting view is both — so an empty selection writes no
  // param and no chip. "Open" is the shared pill word (decision D4): a vault
  // position that holds shares is open, and this listing does not invent a
  // vault-only vocabulary for the one axis every listing already has.
  const statusDim: SerializableDimension<VaultPositionListFilters> = {
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

  const shape: SerializableDimension<VaultPositionListFilters> = {
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

  return [vault, family, statusDim, shape, vaultSizeDimension<VaultPositionListFilters>()];
}

/** The search: an address, or a fragment of one. The backend matches it against
 *  the holder as a substring, so a partial address narrows and a whole one
 *  picks the holder's positions out of every vault. Anything that is not hex is
 *  no filter at all — the proxy refuses it rather than forwarding a guess. */
export function parseVaultPositionSearch(q: string): { q?: string } {
  const v = q.trim().toLowerCase();
  if (!v) return {};
  if (!/^0x?[0-9a-f]{0,40}$/.test(v)) return {};
  if (v === "0x" || v === "0") return {};
  return { q: v };
}

/** Map the decoded selection + page onto the /api/vaults/positions params. */
export function vaultPositionFiltersToFetchParams(
  filters: VaultPositionListFilters,
  page: number,
): FetchVaultPositionsParams {
  return {
    chainId: 1,
    ...parseVaultPositionSearch(filters.q),
    vault: filters.vault,
    family: filters.family,
    status: filters.status,
    shape: filters.shape,
    size: filters.size,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: VAULT_POSITION_ITEMS_PER_PAGE,
    offset: (page - 1) * VAULT_POSITION_ITEMS_PER_PAGE,
  };
}
