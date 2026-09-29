// The Sky Savings listing (SERVER-DRIVEN): the filter registry, the fetch the
// SSR half and the client driver share, and the wallet search. rails-server
// sorts and pages the holders; the dimensions here carry a URL param and no
// in-memory predicate.
//
// Facets: Status (open / closed, multi). The resting default is the open
// positions while browsing and both once the search names a wallet, so a
// holder that has left still answers a lookup. Sorts: value (the default),
// interest earned, last activity, events. Search: an address, or an ENS name
// resolved through this deployment's resolver.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import { RECENT_ACTIVITY_LABEL } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import type { SkyAsOf, SkyPosition, SkyPositionsPage } from "@/lib/sky-savings/types";

/** A listing row with the sealed block its figures are stated at. */
export type SkyListRow = SkyPosition & { asOf: SkyAsOf };

export const SKY_ITEMS_PER_PAGE = 20;

export interface SkyListFilters extends BaseListFilters {
  status: string[];
}

export const SKY_LIST_DEFAULTS: SkyListFilters = { q: "", sortBy: "value", sortOrder: "desc", status: [] };

export const skySortOptions: SortOption[] = [
  { value: "value", label: "Value" },
  { value: "earned", label: "Interest earned" },
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "events", label: "Events" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];
const ALL = ["open", "closed"];

/** An address or an ENS name in the search box. Anything else filters nothing. */
export function parseSkySearch(q: string): { address?: string; ens?: string } {
  const v = q.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { address: v.toLowerCase() };
  if (v.toLowerCase().endsWith(".eth")) return { ens: v };
  return {};
}

const namesWallet = (q: string | undefined) => {
  const s = parseSkySearch(q ?? "");
  return Boolean(s.address ?? s.ens);
};

const canonical = (v: string[]) => ALL.filter((s) => v.includes(s));
const defaultStatuses = (f: SkyListFilters) => (namesWallet(f.q) ? ALL : ["open"]);
export const effectiveStatuses = (f: SkyListFilters) => {
  const sel = canonical(f.status);
  return sel.length > 0 ? sel : defaultStatuses(f);
};

export function skyListDimensions(): SerializableDimension<SkyListFilters>[] {
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
        const sel = canonical(v);
        const def = defaultStatuses(f);
        const same = sel.length === def.length && sel.every((s) => def.includes(s));
        return { ...f, status: sel.length === 0 || same ? [] : sel };
      },
    },
  ];
}

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

/** The listing refuses to state figures when the gate has not passed. */
export class SkyGateError extends Error {
  constructor(readonly reason: "failed" | "missing") {
    super(reason === "failed" ? "The Sky Savings check did not pass" : "The Sky Savings check has not run");
  }
}

/** One page and the index's total for the selection. Throws SkyGateError when
 *  the answer's gate is not ok, so the driver draws the refusal and no row. */
export async function fetchSkyListingPage(
  filters: SkyListFilters,
  page: number,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
): Promise<{ data: SkyListRow[]; total: number }> {
  const qs = new URLSearchParams();
  const statuses = effectiveStatuses(filters);
  qs.set("status", statuses.length === 2 ? "all" : statuses[0]);
  const sortBy = skySortOptions.some((o) => o.value === filters.sortBy) ? filters.sortBy : "value";
  qs.set("sortBy", sortBy);
  qs.set("sortOrder", filters.sortOrder);
  qs.set("limit", String(SKY_ITEMS_PER_PAGE));
  qs.set("offset", String((page - 1) * SKY_ITEMS_PER_PAGE));
  const search = parseSkySearch(filters.q);
  if (search.ens) {
    const address = await resolveEns(search.ens, baseUrl, signal);
    if (!address) return { data: [], total: 0 };
    qs.set("owner", address.toLowerCase());
  } else if (search.address) qs.set("owner", search.address);

  const res = await fetch(`${baseUrl ?? ""}/api/sky-savings/positions?${qs.toString()}`, {
    cache: "no-store",
    signal,
    headers,
  });
  if (!res.ok) throw new Error(`Sky Savings listing: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as SkyPositionsPage;
  if (!json.gate) throw new SkyGateError("missing");
  if (json.gate.ok !== true) throw new SkyGateError("failed");
  return { data: (json.data ?? []).map((p) => ({ ...p, asOf: json.asOf })), total: json.pagination?.total ?? 0 };
}
