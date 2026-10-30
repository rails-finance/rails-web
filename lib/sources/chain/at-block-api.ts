// One read from rails-server's at-block store (`/api/at-block/…`): a contract
// read or a transaction fact at a past block, kept once the block is final
// (server migs 412, 413, 417; rails-ops decisions/0056). The event-card readers
// in this directory ask it in place of a chain call. SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

/** The store answered with an error status (or the backend is not configured). */
export class AtBlockApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`the at-block store answered ${status} on ${path}`);
  }
}

export async function atBlockGet<T>(path: string, qs: URLSearchParams, readerIp?: string): Promise<T> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new AtBlockApiError(500, path);
  const res = await fetch(`${base}/api/at-block/${path}?${qs.toString()}`, createAuthFetchOptions(undefined, readerIp));
  if (!res.ok) throw new AtBlockApiError(res.status, path);
  return (await res.json()) as T;
}
