// Server-only helpers for the chain-state listing SSR first paint. A listing's
// server page.tsx decodes the URL, fetches the first view server-side, and hands
// the rows to its client component (which seeds the shared driver instead of
// showing a skeleton + refetching). Both the server tier (page slice) and the
// memory tier (full set) use these — the memory tier ignores `initialKey` (the
// driver skips its mount fetch whenever it was seeded at all).
//
// The SSR fetch reuses the same client fetch function the browser uses, pointed at
// this deployment's own origin (so it flows through the /api/<proto> proxy with its
// auth + symbol resolution — one code path, server or client). Using headers()
// opts the route into dynamic rendering, which these listings already are.
//
// That hop reaches the proxy from the function's own egress address, so it
// carries the reader's IP in signed headers (`ssrHop()`; see
// lib/api/reader-ip.ts) and the box budgets the read as the reader, not as the
// deployment. Pages, loaders and share images that read through their own proxy
// take the hop from `ssrHop()`, never a bare `ssrOrigin()`; a route handler
// takes it from `routeHop(request)`, never a bare `request.nextUrl.origin`.

import { headers } from "next/headers";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { createAuthHeaders } from "@/lib/api/fetch-with-auth";
import type { NextRequest } from "next/server";
import { readerHopHeaders, readerIpFromRequest } from "@/lib/api/reader-ip";
import { decodeListFilters, listKey, type BaseListFilters, type SerializableDimension } from "@/lib/shared/list-filter";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Flatten Next's awaited searchParams object into a URLSearchParams. */
export function toURLSearchParams(obj: RawSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    p.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  return p;
}

/** Decode SSR searchParams → { filters, page } for a listing registry. */
export function ssrDecode<F extends BaseListFilters>(
  dims: SerializableDimension<F>[],
  sp: URLSearchParams,
  defaults: F,
) {
  const filters = decodeListFilters(dims, sp, defaults);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  return { filters, page };
}

/** This deployment's own origin (for the self-directed SSR fetch), or null when
 *  the host header is absent (then SSR is skipped and the client fetches). */
export async function ssrOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Where a server render reads this deployment's own /api proxy from, and the
 *  headers that name the reader to it. */
export interface SsrHop {
  baseUrl: string;
  /** The signed reader headers — empty when the request names no reader. */
  headers: Record<string, string>;
}

/** The self-hop for a read made on the current reader's behalf, or null when
 *  the host header is absent (then SSR is skipped and the client fetches). */
export async function ssrHop(): Promise<SsrHop | null> {
  const baseUrl = await ssrOrigin();
  if (!baseUrl) return null;
  return { baseUrl, headers: readerHopHeaders(await readerIpFromHeaders()) };
}

/** The hop for a server read whose own `/api/<proto>` proxy only forwards —
 *  same path, same query, the backend's JSON unchanged. Reading the box
 *  directly then costs one function invocation less per read, and the box
 *  budgets the reader the same way, because the bearer token plus
 *  `X-Rails-Reader-IP` is what the proxy would have sent on its behalf.
 *
 *  Only for a proxy that forwards. A route that shapes the backend's rows into
 *  what the page renders is not a hop to skip — read what it does first.
 *
 *  Falls back to `ssrHop()` when `RAILS_API_URL` is absent, so a deployment
 *  without it degrades to the self-hop rather than to no read at all. */
export async function boxHop(): Promise<SsrHop | null> {
  const baseUrl = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!baseUrl) return ssrHop();
  return { baseUrl, headers: createAuthHeaders(await readerIpFromHeaders()) };
}

/** The self-hop for a route handler: its own origin, and the reader of the
 *  request it is answering, signed. `ssrHop()` reads the reader through
 *  `next/headers`; a route handler has the request in hand. */
export function routeHop(request: Pick<NextRequest, "nextUrl" | "headers">): SsrHop {
  return { baseUrl: request.nextUrl.origin, headers: readerHopHeaders(readerIpFromRequest(request)) };
}

export interface SsrInitial<T> {
  initialItems?: T[];
  initialTotal?: number;
  initialKey?: string;
}

// Bound the SSR fetch. A force-dynamic listing whose server fetch runs long would
// otherwise hold the Server Component render until the platform kills it at the
// function limit. On timeout the fetch is aborted and the page falls back to
// empty, so the client fetches under the route's loading skeleton.
//
// The abort cancels this function's request to its own /api/<proto> proxy; it
// does not reach the backend query, which the proxy does not cancel.
//
// 8 s, not lower: cold renders of the Base lending listings measured 3–4 s on
// the preview site (2026-09-21), and a fallback re-issues the same query from
// the browser, so a ceiling inside the normal range doubles the load it exists
// to shed. Every listing page pins `maxDuration = 30` (s) above this.
const SSR_FETCH_TIMEOUT_MS = 8000;

/** Settle with `p`, or reject when `signal` aborts — whichever comes first. A
 *  fetchPage that drops the signal still has its wait bounded. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Best-effort SSR fetch of the first view. On any failure (or no host) returns an
 *  empty result so the client falls back to its own fetch — the page still works,
 *  just without the first-paint win for that request. */
export async function ssrInitial<F extends BaseListFilters, T>(opts: {
  dims: SerializableDimension<F>[];
  defaults: F;
  filters: F;
  page: number;
  label: string;
  /** Pass `signal` to every fetch it makes, so the timeout cancels them, and
   *  `headers`, so the proxy reads the backend as the reader. */
  fetchPage: (
    baseUrl: string,
    signal: AbortSignal,
    headers: Record<string, string>,
  ) => Promise<{ data: T[]; total: number }>;
}): Promise<SsrInitial<T>> {
  try {
    const hop = await ssrHop();
    if (!hop) return {};
    const signal = AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS);
    const r = await untilAborted(opts.fetchPage(hop.baseUrl, signal, hop.headers), signal);
    return {
      initialItems: r.data,
      initialTotal: r.total,
      initialKey: listKey(opts.dims, opts.filters, opts.defaults, opts.page),
    };
  } catch (err) {
    console.error(`${opts.label} listing SSR fetch failed; client will fetch:`, err);
    return {};
  }
}
