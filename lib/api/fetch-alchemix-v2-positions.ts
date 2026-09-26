// The V2 listing, as both the browser and the SSR first paint read it: through
// this deployment's own /api/alchemix/v2 proxy. A refusal envelope is thrown
// rather than served as an empty page: an empty list and a failed read are
// different statements.

import { alchemixV2Query, type FetchAlchemixV2PositionsParams } from "@/lib/sources/api/alchemix-v2-backend";
import type { AlchemixV2PositionsResponse } from "@/types/api/alchemix";

export async function fetchAlchemixV2Positions(
  p: FetchAlchemixV2PositionsParams,
): Promise<AlchemixV2PositionsResponse> {
  const url = `${p.baseUrl ?? ""}/api/alchemix/v2/positions?${alchemixV2Query(p).toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchAlchemixV2Positions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as AlchemixV2PositionsResponse | { success: false; error?: string };
  if (!json.success) throw new Error(json.error ?? "fetchAlchemixV2Positions: the read was refused");
  return json;
}
