// The Transmuter listing, as both the browser and the SSR first paint read it:
// through this deployment's own /api/alchemix proxy. A refusal envelope is
// thrown rather than served as an empty page, for the reason the Alchemist
// fetcher gives: an empty list and a failed read are different statements.

import {
  alchemixTransmuterQuery,
  type FetchAlchemixTransmuterPositionsParams,
} from "@/lib/sources/api/alchemix-transmuter-backend";
import type { AlchemixTransmuterPositionsResponse } from "@/types/api/alchemix";

export async function fetchAlchemixTransmuterPositions(
  p: FetchAlchemixTransmuterPositionsParams,
): Promise<AlchemixTransmuterPositionsResponse> {
  const url = `${p.baseUrl ?? ""}/api/alchemix/transmuter/positions?${alchemixTransmuterQuery(p).toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchAlchemixTransmuterPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as AlchemixTransmuterPositionsResponse | { success: false; error?: string };
  if (!json.success) throw new Error(json.error ?? "fetchAlchemixTransmuterPositions: the read was refused");
  return json;
}
