// Alchemix V3 Transmuter positions — the backend reads.
// ----------------------------------------------------------------------------
// The listing and the one-position read, forwarded in the shape rails-server
// states them (`shapeTransmuter` in api/src/routes/alchemix.ts). The rule the
// Alchemist readers next door keep holds here too: nothing reshapes a figure.
//
// The key is (lineKey, nftId). A Transmuter id is an NFT id inside its line's
// own Transmuter, so the same number is a different position on every other
// line, and a different position again from the Alchemist position of that id.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixTransmuterPositionResponse, AlchemixTransmuterPositionsResponse } from "@/types/api/alchemix";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixRead } from "@/lib/sources/api/alchemix-position-backend";
import {
  alchemixTransmuterQuery,
  type FetchAlchemixTransmuterPositionsParams,
} from "@/lib/sources/api/alchemix-transmuter-query";

export type AlchemixTransmuterPositionFullResponse = AlchemixTransmuterPositionResponse<BaseActivityEvent>;

export {
  parseAlchemixTransmuterQuery,
  type AlchemixTransmuterSort,
  type FetchAlchemixTransmuterPositionsParams,
} from "@/lib/sources/api/alchemix-transmuter-query";

async function read<T>(path: string, readerIp?: string, signal?: AbortSignal): Promise<AlchemixRead<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const response = await fetch(`${base}${path}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  return { ok: true, upstream: response, result: (await response.json()) as T };
}

export function readAlchemixTransmuterPositions(
  p: FetchAlchemixTransmuterPositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixTransmuterPositionsResponse>> {
  return read<AlchemixTransmuterPositionsResponse>(
    `/api/alchemix/transmuter/positions?${alchemixTransmuterQuery(p).toString()}`,
    readerIp,
    signal,
  );
}

export function readAlchemixTransmuterPosition(
  lineKey: string,
  nftId: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixTransmuterPositionFullResponse>> {
  return read<AlchemixTransmuterPositionFullResponse>(
    `/api/alchemix/transmuter/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(nftId)}`,
    readerIp,
    signal,
  );
}
