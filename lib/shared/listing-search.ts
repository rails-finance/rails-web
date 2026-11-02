// The search box of a server-driven listing (ui-jobs 217). It takes a full
// holder address, an ENS name (resolved forward through this deployment's
// /api/ens/resolve), or, where the listing has one, a position id. Anything else names nothing the API filters
// by, and the page answers with no rows and a line saying what the box takes,
// rather than the whole listing as though the query had matched it.

export type ListingSearch =
  | { kind: "none" }
  | { kind: "address"; address: string }
  | { kind: "ens"; name: string }
  | { kind: "id"; id: string }
  | { kind: "unread" };

export function parseListingSearch(q: string, takesId: boolean): ListingSearch {
  const v = q.trim();
  if (!v) return { kind: "none" };
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { kind: "address", address: v.toLowerCase() };
  if (v.toLowerCase().endsWith(".eth") && v.length > 4) return { kind: "ens", name: v };
  if (takesId && /^\d+$/.test(v)) return { kind: "id", id: v };
  return { kind: "unread" };
}

/** The line under an empty page when the query is one the box cannot read. */
export function listingSearchNote(q: string, takesId: boolean): string | null {
  if (parseListingSearch(q, takesId).kind !== "unread") return null;
  return takesId
    ? "Search takes a full address, an ENS name or a position id."
    : "Search takes a full address or an ENS name.";
}

/** Forward-resolve an ENS name through this deployment's own resolver route.
 *  Best-effort: an unreachable resolver reads as "no address", which the caller
 *  turns into an empty page. */
export async function resolveEnsViaApi(name: string, baseUrl?: string, signal?: AbortSignal): Promise<string | null> {
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

/** One page for a search. The fetch params already carry an address or id the
 *  query names; an ENS name is resolved here and goes out as the owner, and a
 *  name that resolves to nothing, or a query the box cannot read, answers an
 *  empty page without a request. */
export async function searchedListingPage<P extends { owner?: string }, T>(
  q: string,
  takesId: boolean,
  params: P,
  run: (params: P) => Promise<{ data: T[]; total: number }>,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<{ data: T[]; total: number }> {
  const s = parseListingSearch(q, takesId);
  if (s.kind === "unread") return { data: [], total: 0 };
  if (s.kind === "ens") {
    const address = await resolveEnsViaApi(s.name, baseUrl, signal);
    if (!address) return { data: [], total: 0 };
    return run({ ...params, owner: address.toLowerCase() });
  }
  return run(params);
}
