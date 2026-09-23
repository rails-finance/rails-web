// MakerDAO vault listing — the filter registry (SERVER-DRIVEN, roster-backed).
// ----------------------------------------------------------------------------
// Until 2026-08-28 this listing was the in-memory tier: it fetched 500 of the
// index's 31,750 vaults, ordered by collateral USD, derived the Collateral type
// options from the rows that came back, and filtered them in the browser. Every
// facet and the search box therefore ran over 1.6% of the data, and the ilk menu
// could only offer collateral types that happened to hold a large vault — 13 of
// the 42 the index carries. Nothing on the page said either number was partial.
//
// Now it pages against rails-server, and the ilk options come from the ROSTER
// (lib/api/fetch-makerdao-ilk-roster) — every collateral type the index holds,
// with its vault count, fetched once and independent of any filter. The registry
// is a FUNCTION of that roster, consumed through the shared driver's dynamic-
// dimensions seam (decision 0009), the same shape Morpho and Aave V4 use.
//
// How a selection reaches the backend:
//   • Status              → `status` (CSV, OR within).
//   • Collateral type     → `ilks` (CSV of ilk names, as the chain writes them).
//   • Free text           → matched against the roster's ilk names and their
//                           display symbols, then sent as that same `ilks` CSV.
//   • A wallet address    → `owner`, with a `urn` retry — see list-fetch.ts.
//   • Digits              → `cdpId`.
//
// Every one of those params predates this change: rails-server has always taken
// them, and the roster route is the only new backend surface. So the degraded
// state is narrow — without a roster the listing still pages, still filters by
// status, still resolves a wallet or a vault number, and still honours ilk chips
// carried in a shared URL. What it cannot do is OFFER those chips, or turn a
// typed name into one.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { MakerVaultSort } from "@/lib/sources/api/makerdao-vaults";
import type { FetchMakerVaultsParams } from "@/lib/api/fetch-makerdao-vaults";
import type { MakerIlkRosterResponse } from "@/lib/api/fetch-makerdao-ilk-roster";
import { ilkToCollateralSymbol } from "@/lib/makerdao/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/makerdao/listing-visibility";

/** The backend caps `limit` at 500; 20 is the page size the whole tier uses. */
export const MAKER_ITEMS_PER_PAGE = 20;

export interface MakerListFilters extends BaseListFilters {
  status: string[];
  ilks: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open vaults on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const MAKER_LIST_DEFAULTS: MakerListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  ilks: [],
};

// Every ordering here is one rails-server applies over the whole index — the
// same three the in-memory tier offered, now meaning the index rather than the
// 500 rows that had been fetched.
export const MAKER_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral (USD)" },
  // Plain "Debt": DAI on CdpManager vaults, USDS on LockStake urns — both the
  // same Vat unit, so the cross-ilk sort stays meaningful.
  { value: "debt", label: "Debt" },
];

/** Sort value → the backend column that serves it. "collateral" resolves to the
 *  USD column, not the token count: raw ink is only proportional within an ilk,
 *  and billion-SKY LockStake urns would out-rank every ETH whale. "debt" is the
 *  DAI owed (art x the ilk's live rate), not the raw normalized art. */
const SORT_TO_BACKEND: Record<string, MakerVaultSort> = {
  recent: "lastActivity",
  collateral: "collateralUsd",
  debt: "debtDai",
};

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

/** What the driver hands the registry: the roster once it has settled, and
 *  whether it ever will. `loading` and `unavailable` are kept apart because they
 *  call for opposite things — never prune a URL-provided selection while the
 *  answer is still in flight. */
export interface MakerRosterState {
  status: "loading" | "ready" | "unavailable";
  roster: MakerIlkRosterResponse | null;
}

export const MAKER_ROSTER_LOADING: MakerRosterState = { status: "loading", roster: null };

/** Options standing in for a selection made before the roster landed (or made
 *  against a deployment that has none). Without them an active chip would have
 *  no row to un-tick, which strands the reader with a filter they cannot clear. */
function selectionOptions(values: string[]): FilterOptionDef[] {
  return values.map((ilk) => ({
    value: ilk,
    label: ilk,
    icon: <TokenChipIcon symbol={ilkToCollateralSymbol(ilk)} size={16} filterable={false} />,
  }));
}

/**
 * The registry as a function of the roster. Both dimensions are returned
 * whatever the roster's state — the codec must not depend on whether it landed,
 * or a shared URL's `ilk` param would decode on one render and not the next.
 * What the roster changes is the OPTIONS, and whether the group is offered.
 */
export function makerListDimensions(
  filters: MakerListFilters,
  state: MakerRosterState | undefined,
): SerializableDimension<MakerListFilters>[] {
  const roster = state?.status === "ready" ? state.roster : null;
  const offered = roster != null;

  const ilkOptions: FilterOptionDef[] = (roster?.ilks ?? []).map((e) => ({
    value: e.ilk,
    label: e.ilk,
    icon: <TokenChipIcon symbol={ilkToCollateralSymbol(e.ilk)} size={16} filterable={false} />,
    // Panel-only trailing figure: how many vaults the ilk holds, of any status.
    // Not part of the chip text and not matched by the type-to-filter box.
    meta: e.positions.toLocaleString("en-US"),
  }));

  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
    },
    {
      id: "ilks",
      label: "Collateral type",
      group: "Collateral",
      cardinality: "multi",
      param: "ilk",
      options: offered ? ilkOptions : selectionOptions(filters.ilks),
      get: (f) => f.ilks,
      set: (f, v) => ({ ...f, ilks: v }),
      available: (f) => offered || f.ilks.length > 0,
    },
  ];
}

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const CDP_RE = /^\d+$/;

export interface MakerSearchTarget {
  /** An exact 20-byte address — an owner, or a urn addressed directly. */
  address?: string;
  /** A CdpManager vault number. */
  cdpId?: string;
  /** Anything else typed — matched against the roster's collateral types. */
  text?: string;
}

/** What the search box is asking for: an address, a vault number, or a name. */
export function makerSearchTarget(q: string): MakerSearchTarget {
  const s = q.trim().toLowerCase();
  if (!s) return {};
  if (ADDRESS_RE.test(s)) return { address: s };
  if (CDP_RE.test(s)) return { cdpId: s };
  return { text: s };
}

/** True when a selection can only be expressed with the roster in hand. Only a
 *  typed name qualifies: an ilk CHIP already carries the chain's own ilk string,
 *  which is exactly what the backend's `ilks` param takes.
 *
 *  The SSR half asks this before deciding whether it may render a first paint at
 *  all — one drawn from a roster the browser then disagrees with would seed the
 *  driver with rows for a different question, and the key match would stop it
 *  fetching the right ones. */
export function makerSelectionNeedsRoster(filters: MakerListFilters): boolean {
  return makerSearchTarget(filters.q).text != null;
}

/** The collateral types a typed name reaches. Matched against the ilk as the
 *  chain writes it AND against its display symbol, because a row shows both:
 *  "wsteth" finds WSTETH-A and WSTETH-B by name, and "pol" finds MATIC-A by the
 *  symbol its card face actually carries. */
function ilksMatchingText(roster: MakerIlkRosterResponse, text: string): string[] {
  return roster.ilks
    .filter((e) => e.ilk.toLowerCase().includes(text) || ilkToCollateralSymbol(e.ilk).toLowerCase().includes(text))
    .map((e) => e.ilk);
}

/**
 * Map the decoded selection + page onto the fetch params — the server-driven
 * counterpart of the retired in-memory ApplyConfig.
 *
 * Returns null when the selection can match nothing, which is a different thing
 * from an unconstrained fetch: rails-server IGNORES a param it does not
 * understand, so a request built from a question it cannot answer comes back as
 * the whole 31,750-row index — a search for a collateral type that does not
 * exist answered with everything. Null means the caller skips the request and
 * renders the empty state, which is the truthful answer.
 *
 * The address case returns `owner`; see fetchMakerVaultPage for the urn retry
 * that a params object alone cannot express (the route ANDs its conditions, so
 * "owner OR urn" is two requests, not one).
 */
export function makerFiltersToFetchParams(
  filters: MakerListFilters,
  page: number,
  state: MakerRosterState | undefined,
): FetchMakerVaultsParams | null {
  const roster = state?.status === "ready" ? state.roster : null;
  const target = makerSearchTarget(filters.q);

  const base: FetchMakerVaultsParams = {
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    sortBy: SORT_TO_BACKEND[filters.sortBy] ?? SORT_TO_BACKEND.recent,
    sortOrder: filters.sortOrder === "asc" ? "asc" : "desc",
    limit: MAKER_ITEMS_PER_PAGE,
    offset: (page - 1) * MAKER_ITEMS_PER_PAGE,
  };

  // Ilk chips need no roster — a chip's value IS the backend's ilk string.
  let ilks: string[] | null = filters.ilks.length > 0 ? filters.ilks : null;

  if (target.text) {
    // A typed name is only answerable against the roster. Without one, an empty
    // result is the truthful answer and the listing states why.
    if (!roster) return null;
    const matched = ilksMatchingText(roster, target.text);
    if (matched.length === 0) return null;
    // Chips and search stack, as they do everywhere else.
    ilks = ilks ? ilks.filter((i) => matched.includes(i)) : matched;
    if (ilks.length === 0) return null;
  }

  return {
    ...base,
    ilks: ilks ?? undefined,
    // An address and a vault number are alternative identities, never both.
    owner: target.address,
    cdpId: target.cdpId,
  };
}

/** Drop any ilk the loaded roster does not offer — else it would sit in the URL
 *  as an invisible predicate no chip can clear. Only ever runs against a READY
 *  roster: pruning while the fetch is in flight, or because it failed, would
 *  wipe a selection a shared link legitimately carried. */
export function reconcileMakerIlks(
  filters: MakerListFilters,
  state: MakerRosterState | undefined,
): MakerListFilters | null {
  if (state?.status !== "ready" || !state.roster) return null;
  const known = new Set(state.roster.ilks.map((e) => e.ilk));
  const ilks = filters.ilks.filter((i) => known.has(i));
  return ilks.length === filters.ilks.length ? null : { ...filters, ilks };
}
