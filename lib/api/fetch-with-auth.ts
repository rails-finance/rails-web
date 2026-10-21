import { readerHopHeaders } from "@/lib/api/reader-ip";

const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;

/** How a call reaches the box. `render`: a server render's read, which also
 *  sends the signed hop pair (`readerHopHeaders`) so the box budgets it on
 *  the render bucket; a route handler serving a browser or a script leaves it
 *  unset and sends the reader header alone. */
export interface AuthCallOptions {
  render?: boolean;
}

/**
 * Creates fetch options with Authorization header for Rails API requests.
 *
 * `readerIp`, when given, is sent as X-Rails-Reader-IP: every request from
 * this deployment reaches the box from Vercel's shared egress IPs, so the box
 * cannot budget its per-minute rate limit by connecting IP the way it would
 * for a direct caller. It keys that budget on this header instead — but only
 * once the bearer token above has validated the caller, so an unauthenticated
 * request can't claim an arbitrary reader. See lib/api/reader-ip.ts /
 * reader-ip-server.ts for how callers resolve the value.
 *
 * With `call.render`, the same reader is also named in the signed pair
 * `x-rails-ssr-reader-ip` / `x-rails-ssr-reader-sig`, the HMAC under the
 * bearer token that lib/api/reader-ip.ts `readerHopHeaders` produces.
 */
export function createAuthHeaders(readerIp?: string, call?: AuthCallOptions): Record<string, string> {
  if (!API_BEARER_TOKEN) {
    console.warn("API_BEARER_TOKEN environment variable is not set");
    return {};
  }

  return {
    Authorization: `Bearer ${API_BEARER_TOKEN}`,
    ...(readerIp ? { "X-Rails-Reader-IP": readerIp } : {}),
    ...(call?.render ? readerHopHeaders(readerIp) : {}),
  };
}

/**
 * Creates fetch options with Authorization header and optional additional
 * options. See createAuthHeaders for what `readerIp` and `call` do.
 */
export function createAuthFetchOptions(
  additionalOptions?: RequestInit,
  readerIp?: string,
  call?: AuthCallOptions,
): RequestInit {
  return {
    ...additionalOptions,
    headers: {
      ...createAuthHeaders(readerIp, call),
      ...additionalOptions?.headers,
    },
  };
}
