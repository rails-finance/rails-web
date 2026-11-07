// Alchemix V2: the backend reads.
// ----------------------------------------------------------------------------
// The listing and the one-account read, forwarded in the shape rails-server
// states them (`routes/alchemix-v2.ts`). Nothing reshapes a figure: every
// figure on that wire carries the frozen block it was read at.
//
// The key is (lineKey, account). V2 is wallet-keyed, so the account is the
// position, and an account on one line says nothing about the other.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixV2PositionResponse, AlchemixV2PositionsResponse } from "@/types/api/alchemix";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixRead } from "@/lib/sources/api/alchemix-position-backend";
import { alchemixV2Query, type FetchAlchemixV2PositionsParams } from "@/lib/sources/api/alchemix-v2-query";

export type AlchemixV2PositionFullResponse = AlchemixV2PositionResponse<BaseActivityEvent>;

export {
  ALCHEMIX_V2_ACCOUNT,
  parseAlchemixV2Query,
  type AlchemixV2Sort,
  type FetchAlchemixV2PositionsParams,
} from "@/lib/sources/api/alchemix-v2-query";

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

export function readAlchemixV2Positions(
  p: FetchAlchemixV2PositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixV2PositionsResponse>> {
  return read<AlchemixV2PositionsResponse>(
    `/api/alchemix/v2/positions?${alchemixV2Query(p).toString()}`,
    readerIp,
    signal,
  );
}

export function readAlchemixV2Position(
  lineKey: string,
  account: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixV2PositionFullResponse>> {
  return read<AlchemixV2PositionFullResponse>(
    `/api/alchemix/v2/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(account.toLowerCase())}`,
    readerIp,
    signal,
  );
}
