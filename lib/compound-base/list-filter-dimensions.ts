// Compound V3 Base listing — the Ethereum Compound dimensions with the Base
// roster in the market facet, pointed at the Base route.
// ----------------------------------------------------------------------------
// Unlike the Base Aave lenders, Comet is genuinely multi-market, so the market
// facet stays — built from the five Comets governance deployed here. The slugs
// are unique within THIS roster and collide with Ethereum's (`usdc`, `weth`);
// nothing keys on them across deployments: the URL param names a Base Comet
// only because the page it is on does.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchCompoundPositionsParams } from "@/lib/api/fetch-compound-positions";
import {
  compoundListDimensions,
  compoundFiltersToFetchParams,
  COMPOUND_LIST_DEFAULTS,
  type CompoundListFilters,
} from "@/lib/compound/list-filter-dimensions";
import { COMPOUND_BASE_DEPLOYMENT } from "./asset-catalog";

export const COMPOUND_BASE_POSITIONS_ROUTE = "/api/compound-base/positions";

// This lane's own constant, NOT Ethereum's COMPOUND_SORT_OPTIONS: the two
// backends page different tables (rails-server's /api/compound-base/positions
// sortBy against the Base roster vs mig 185's debt_usd/collateral_usd on
// mv_compound_v3_positions for Ethereum), so sharing one constant would let
// this lane drift onto values its own backend cannot honor if Ethereum's list
// grows independently. Values match Liquity V2's URL grammar.
// lib/api/compound-positions-proxy.ts sets CompoundProxyTarget.supportsSort
// for this route to allowlist debt/coll through.
export const COMPOUND_BASE_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const MARKET_OPTIONS: FilterOptionDef[] = COMPOUND_BASE_DEPLOYMENT.markets.map((m) => ({
  value: m.key,
  label: m.label,
}));

export function compoundBaseListDimensions(): SerializableDimension<CompoundListFilters>[] {
  return compoundListDimensions().map((d) => (d.id === "market" ? { ...d, options: MARKET_OPTIONS } : d));
}

export const COMPOUND_BASE_LIST_DEFAULTS: CompoundListFilters = { ...COMPOUND_LIST_DEFAULTS };

export function compoundBaseFiltersToFetchParams(
  filters: CompoundListFilters,
  page: number,
): FetchCompoundPositionsParams {
  return { ...compoundFiltersToFetchParams(filters, page), route: COMPOUND_BASE_POSITIONS_ROUTE };
}
