// The Sky Savings listing (SERVER-DRIVEN): the filter registry, the fetch the
// SSR half and the client driver share, and the wallet search. rails-server
// sorts and pages the holders; the dimensions here carry a URL param and no
// in-memory predicate.
//
// Facets: Status (Open / Closed / All, ui-jobs 805; lib/sky-savings/listing-visibility.ts)
// and Transactions (the holder's distinct transactions, sent as minTx / maxTx). Sorts: value (the default),
// interest earned, last activity, events. Search: an address, or an ENS name
// resolved through this deployment's resolver.

import { resolveEnsViaApi } from "@/lib/shared/listing-search";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import { RECENT_ACTIVITY_LABEL } from "@/components/shared/filter-bar/sort-control";
import type { BaseListFilters, SerializableDimension } from "@/lib/shared/list-filter";
import type { SkyAsOf, SkyPosition, SkyPositionsPage } from "@/lib/sky-savings/types";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { setStatusChoice, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
import { defaultStatusChoice, parseSkySearch, statusChoice } from "@/lib/sky-savings/listing-visibility";

export { parseSkySearch };

/** The Transactions slider's top. The busiest holder is a router with 164,075
 *  transactions and the 99th percentile is 279 (21 Oct 2026), so a top at the
 *  busiest would leave every ordinary holder in the slider's first pixel. The
 *  slider tops at 1,000 and a typed Max above it is honoured. */
const SKY_TX_TOP = 1000;

/** What the listing states about its counts: the last check and the
 *  contracts left out of the list. */
export interface SkyListCounts {
  block: number;
  gateBlock: number;
  holdersEver: number;
  holdersOpen: number;
  /** The contracts left out of the list, in words ("Morpho Blue and 3 Sky
   *  bridge escrows"), and how many. */
  excluded: number;
  excludedWords: string;
}

function excludedWords(ex: { label: string; kind: string }[]): string {
  const escrows = ex.filter((e) => e.kind === "bridge_escrow").length;
  const parts = [
    ...ex.filter((e) => e.kind !== "bridge_escrow").map((e) => e.label),
    ...(escrows > 0 ? [`${escrows} Sky bridge escrow${escrows === 1 ? "" : "s"}`] : []),
  ];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
}

/** A listing row with the sealed block its figures are stated at. */
export type SkyListRow = SkyPosition & { asOf: SkyAsOf; counts?: SkyListCounts };

export const SKY_ITEMS_PER_PAGE = 20;

export interface SkyListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

export const SKY_LIST_DEFAULTS: SkyListFilters = { q: "", sortBy: "value", sortOrder: "desc", status: [], tx: [] };

export const skySortOptions: SortOption[] = [
  { value: "value", label: "Value" },
  { value: "earned", label: "Interest earned" },
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "events", label: "Events" },
];

export function skyListDimensions(): SerializableDimension<SkyListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "single",
      param: "status",
      options: STATUS_CHOICE_OPTIONS,
      segmented: true,
      get: (f) => [statusChoice(f)],
      defaultValues: (f) => [defaultStatusChoice(f)],
      // Takes the choice, or an old link's list of statuses (ui-jobs 805).
      set: (f, v) => ({ ...f, status: setStatusChoice(v, defaultStatusChoice(f), []).status }),
    },
    transactionsDimension<SkyListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: SKY_TX_TOP,
    }),
  ];
}

/** The listing refuses to state figures when the gate has not passed. */
export class SkyGateError extends Error {
  constructor(readonly reason: "failed" | "missing") {
    super(reason === "failed" ? "The Sky Savings check did not pass" : "The Sky Savings check has not run");
  }
}

/** One page and the index's total for the selection. Throws SkyGateError when
 *  the answer's gate is not ok, so the driver draws the refusal and no row.
 *  `limit` is the page size; a draft's count asks for one row. */
export async function fetchSkyListingPage(
  filters: SkyListFilters,
  page: number,
  baseUrl?: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
  limit: number = SKY_ITEMS_PER_PAGE,
): Promise<{ data: SkyListRow[]; total: number }> {
  const qs = new URLSearchParams();
  // The route takes open, closed or all, and rests an absent one on open.
  qs.set("status", statusChoice(filters));
  const sortBy = skySortOptions.some((o) => o.value === filters.sortBy) ? filters.sortBy : "value";
  qs.set("sortBy", sortBy);
  qs.set("sortOrder", filters.sortOrder);
  qs.set("limit", String(limit));
  qs.set("offset", String((page - 1) * limit));
  const { minTx, maxTx } = transactionBounds(filters.tx);
  if (minTx != null) qs.set("minTx", String(minTx));
  if (maxTx != null) qs.set("maxTx", String(maxTx));
  const search = parseSkySearch(filters.q);
  if (search.ens) {
    const address = await resolveEnsViaApi(search.ens, baseUrl, signal);
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
  const counts: SkyListCounts = {
    block: json.asOf.block,
    gateBlock: json.gate.block,
    holdersEver: json.coverage.holdersEver,
    holdersOpen: json.coverage.holdersOpen,
    excluded: json.excluded?.length ?? 0,
    excludedWords: excludedWords(json.excluded ?? []),
  };
  return {
    data: (json.data ?? []).map((p) => ({ ...p, asOf: json.asOf, counts })),
    total: json.pagination?.total ?? 0,
  };
}
