// One Alchemist position — the three backend reads behind its page.
// ----------------------------------------------------------------------------
// `/api/alchemix/position/:lineKey/:tokenId` and its `/timeline` and `/state`
// children form one prefix built from a single (lineKey, tokenId) pair. That
// pair is the whole key: a token id is an NFT id inside its line and the same
// number exists in every other line, so neither half travels on its own.
//
// The three answers are forwarded in the shape the backend states them, for the
// reason the listing's reader gives: every figure on that wire is paired with
// the block it is true at, and a transform here that dropped a block or
// defaulted one would produce a number that still looked stated.
//
// WHY `/state` IS A READ OF ITS OWN rather than a field on the position.
// Earmarked debt accrues inside the Alchemist on every block, so a stored
// figure is true at the block it was read at and at no other. The position row
// therefore serves history — each figure with its own block — and the current
// earmarked figure comes from this route, where debt, collateral and earmarked
// are one `getCDP` call at one block.
//
// PAGINATION IS `limit`/`offset`. The timeline route takes no `recent`, and
// asking for one would silently read as the whole history.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type {
  AlchemixPositionResponse,
  AlchemixStateResponse,
  AlchemixTimelineResponse,
} from "@/types/api/alchemix";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

export type AlchemixPositionTimelineResponse = AlchemixTimelineResponse<BaseActivityEvent>;

/** What a backend read answers with. A non-2xx is carried as a status rather
 *  than thrown: the proxy passes the box's own refusal through, so a 404 on a
 *  position that does not exist stays a 404 and never becomes an empty page. */
export type AlchemixRead<T> =
  | { ok: true; result: T; upstream: Response }
  | { ok: false; status: number; statusText: string };

/** The one path builder. `lineKey` and `tokenId` are both encoded — the line
 *  key is registry text and the token id is validated digits, and encoding both
 *  keeps a malformed parameter from reshaping the path. */
function positionPath(lineKey: string, tokenId: string, tail = ""): string {
  return `/api/alchemix/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(tokenId)}${tail}`;
}

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

/** A token id is a uint256 in decimal. Anything else is rejected before a
 *  request is made: the backend answers a malformed id with a 400, and a
 *  parameter that cannot name a position should cost zero outbound requests. */
export const ALCHEMIX_TOKEN_ID = /^\d+$/;

export function readAlchemixPosition(
  lineKey: string,
  tokenId: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixPositionResponse>> {
  return read<AlchemixPositionResponse>(positionPath(lineKey, tokenId), readerIp, signal);
}

export interface AlchemixTimelineWindow {
  limit?: number;
  offset?: number;
}

export function alchemixTimelineQuery(win: AlchemixTimelineWindow): URLSearchParams {
  const qs = new URLSearchParams();
  if (win.limit != null) qs.set("limit", String(win.limit));
  if (win.offset != null && win.offset > 0) qs.set("offset", String(win.offset));
  return qs;
}

export function readAlchemixTimeline(
  lineKey: string,
  tokenId: string,
  win: AlchemixTimelineWindow,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixPositionTimelineResponse>> {
  const qs = alchemixTimelineQuery(win).toString();
  return read<AlchemixPositionTimelineResponse>(
    positionPath(lineKey, tokenId, `/timeline${qs ? `?${qs}` : ""}`),
    readerIp,
    signal,
  );
}

export function readAlchemixState(
  lineKey: string,
  tokenId: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixStateResponse>> {
  return read<AlchemixStateResponse>(positionPath(lineKey, tokenId, "/state"), readerIp, signal);
}
