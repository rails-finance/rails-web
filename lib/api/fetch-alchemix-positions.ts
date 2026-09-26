// The Alchemix position listing, as both the browser and the SSR first paint
// read it: through this deployment's own /api/alchemix proxy, never the box
// directly, so one code path carries the auth and the reader's IP.
//
// Pagination is `limit`/`offset` — the listing idiom, and what the backend
// route takes. There is no `?recent=` here: that is a different shape for a
// different kind of feed, and the Alchemix listing pages.
//
// The refusal envelope is honoured rather than flattened. `{ success: false }`
// carries no `data`, so an answer that says it failed is thrown, not served as
// an empty page — an empty list and a failed read are different statements and
// the listing must not make them look alike.

import {
  alchemixPositionsQuery,
  type FetchAlchemixPositionsParams,
} from "@/lib/sources/api/alchemix-positions-backend";
import type { AlchemixPositionsResponse } from "@/types/api/alchemix";

export type { FetchAlchemixPositionsParams };

export async function fetchAlchemixPositions(p: FetchAlchemixPositionsParams): Promise<AlchemixPositionsResponse> {
  const url = `${p.baseUrl ?? ""}/api/alchemix/positions?${alchemixPositionsQuery(p).toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchAlchemixPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as AlchemixPositionsResponse | { success: false; error?: string };
  if (!json.success) throw new Error(json.error ?? "fetchAlchemixPositions: the read was refused");
  return json;
}
