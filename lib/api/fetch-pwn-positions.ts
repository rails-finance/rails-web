// ============================================================================
// FETCH PWN POSITIONS
// ============================================================================
//
// Discovery list for the /pwn page. A PWN position is a discrete fixed-term loan,
// so the grain is one row per loan_id. The only arm is "api" — the LIVE rails-
// server index (structural filter/sort/paginate over mv_pwn_positions, symbols
// resolved + amounts scaled in the proxy). A wallet filter matches EITHER party;
// `role` narrows it to lender or borrower. Returns the { data, pagination } shape.

import type { PwnPositionSummary, PwnPositionStatus, PwnPositionSort } from "@/lib/sources/api/pwn-positions";

export interface FetchPwnPositionsParams {
  /** wallet address — restrict to loans this wallet is a party to. */
  wallet?: string;
  /** narrow a wallet match to one side of the loan. */
  role?: "lender" | "borrower";
  status?: PwnPositionStatus[];
  sortBy?: PwnPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface PwnPositionsResult {
  data: PwnPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchPwnPositions(p: FetchPwnPositionsParams): Promise<PwnPositionsResult> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.role) qs.set("role", p.role);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/pwn/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchPwnPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: PwnPositionSummary[];
    pagination?: PwnPositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}

/** The rails route caps `limit` at 100 whatever is asked for, and answers a
 *  capped request the same way it answers a complete one — a page slice with no
 *  signal that anything was withheld. A caller that wants the WHOLE book (the
 *  listing's in-memory strategy; the loan book's reduction) therefore has to walk
 *  the pages, or it silently starts serving the first 100 loans as if they were
 *  all of them the day the book passes 100. */
const WHOLE_BOOK_PAGE = 100;
/** A stop, not an expected bound: 20,000 loans. Guards against a route that keeps
 *  answering rather than ever reporting the end. */
const WHOLE_BOOK_MAX_PAGES = 200;

export async function fetchAllPwnPositions(
  p: Omit<FetchPwnPositionsParams, "limit" | "offset"> = {},
): Promise<PwnPositionSummary[]> {
  const out: PwnPositionSummary[] = [];
  for (let i = 0; i < WHOLE_BOOK_MAX_PAGES; i++) {
    const { data, pagination } = await fetchPwnPositions({ ...p, limit: WHOLE_BOOK_PAGE, offset: i * WHOLE_BOOK_PAGE });
    out.push(...data);
    if (data.length < WHOLE_BOOK_PAGE || out.length >= pagination.total) break;
  }
  return out;
}
