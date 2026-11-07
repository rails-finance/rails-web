// Alchemix V3 position listing — the backend read.
// ----------------------------------------------------------------------------
// rails-server does all the structural work: filter, sort and paginate over the
// reduced per-position state at the (lineKey, tokenId) grain, join the head
// chain reading, and grade the figures. It answers with the finished shape,
// down to the sentence that states the grade in words, so nothing here reshapes
// a figure — this module validates the query and forwards it.
//
// THAT IS DELIBERATE, NOT LAZINESS. Every figure on that wire is paired with
// the block it is true at. A transform here that dropped a block, defaulted one,
// or moved an amount between figures would produce a number that still looked
// stated. The earmarked figure is the sharp case: it accrues every block, so it
// is only ever true at its own `asOfBlock` — a reshaper that carried it forward
// or summed it into debt would be inventing a reading. Forwarding the shape
// whole is what makes that impossible.
//
// PAGINATION IS `limit`/`offset`, the listing idiom. The route caps `offset` at
// 10,000 and asks for filters instead of deep paging, so a page past that
// returns the backend's own refusal rather than an empty list.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixPositionsResponse } from "@/types/api/alchemix";

export type AlchemixPositionsRead =
  | { ok: true; result: AlchemixPositionsResponse; upstream: Response }
  | { ok: false; status: number; statusText: string };

import { alchemixPositionsQuery, type FetchAlchemixPositionsParams } from "@/lib/sources/api/alchemix-positions-query";
export {
  parseAlchemixPositionsQuery,
  type FetchAlchemixPositionsParams,
} from "@/lib/sources/api/alchemix-positions-query";

export async function readAlchemixPositionsFromBackend(
  p: FetchAlchemixPositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixPositionsRead> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");

  const response = await fetch(`${base}/api/alchemix/positions?${alchemixPositionsQuery(p).toString()}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  return { ok: true, upstream: response, result: (await response.json()) as AlchemixPositionsResponse };
}
