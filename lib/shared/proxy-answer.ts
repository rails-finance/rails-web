// A proxy route's answer, computed where a page loader can reach it too.
// ----------------------------------------------------------------------------
// SERVER-ONLY. An `/api/<proto>` route that shapes the box's raw rows (a
// `build*` transform, `toTimelineWire`, `resolveOpeningAssetKeys`) keeps that
// work in a function of the proxy's query and a hop to the box. The route
// answers the request with it; a position page's loader calls the same
// function in the render instead of fetching the route over HTTP. One build,
// two callers, and the page's server half costs one function invocation
// instead of one per read (rails-ops architecture/head-tail-serving-
// architecture.md §9, "Direct call or self-hop").
//
// The loader takes the body through a JSON round trip (`answerBody`), so what
// it seeds is what the client's fetcher would have parsed off the route's
// response, key for key.

import { NextResponse } from "next/server";
import { createAuthHeaders } from "@/lib/api/fetch-with-auth";
import type { SsrHop } from "@/lib/shared/listing-ssr";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

/** The route's answer before it is a Response: a body, and the status or the
 *  success headers (the Cache-Control the route sends) that go with it. */
export type ProxyAnswer<T> =
  | { ok: true; body: T; headers: Record<string, string> | undefined }
  | { ok: false; status: number; body: Record<string, unknown> };

export function proxyOk<T>(body: T, headers?: Record<string, string>): ProxyAnswer<T> {
  return { ok: true, body, headers };
}

export function proxyFail(status: number, body: Record<string, unknown>): ProxyAnswer<never> {
  return { ok: false, status, body };
}

/** The hop a route handler reads the box through: `RAILS_API_URL`, the bearer
 *  token, and the reader it is answering. */
export function routeBoxHop(baseUrl: string, readerIp: string | undefined): SsrHop {
  return { baseUrl, headers: createAuthHeaders(readerIp) };
}

/** The route's Response. An error carries no Cache-Control, as before. */
export function respondWith<T>(answer: ProxyAnswer<T>): NextResponse {
  if (!answer.ok) return NextResponse.json(answer.body, { status: answer.status });
  return NextResponse.json(answer.body, answer.headers ? { headers: answer.headers } : undefined);
}

/** What a loader reads off the answer: the body as JSON would carry it, or a
 *  throw naming the status, the way the client's fetcher throws on a non-2xx. */
export function answerBody<T>(answer: ProxyAnswer<T>, what: string): T {
  if (!answer.ok) throw new Error(`${what} failed: ${answer.status}`);
  return JSON.parse(JSON.stringify(answer.body)) as T;
}

/** A timeline route's answer as its `fetch*Timeline` client reads it. */
export function answerTimeline<T extends { events: BaseActivityEvent[] }>(
  answer: ProxyAnswer<unknown>,
  what: string,
): T {
  return fromTimelineWire<T>(answerBody(answer, what) as WireTimeline<T>);
}

/** A `{ success, data, pagination }` listing answer as its `fetch*Positions`
 *  client reads it, for a read of `limit` rows from the start. */
export function answerEnvelope<Row>(
  answer: ProxyAnswer<unknown>,
  what: string,
  limit: number,
): { data: Row[]; pagination: { total: number; limit: number; offset: number } } {
  const json = answerBody(answer, what) as {
    data?: Row[];
    pagination?: { total: number; limit: number; offset: number };
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit, offset: 0 },
  };
}
