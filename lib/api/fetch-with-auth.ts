const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;

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
 */
export function createAuthHeaders(readerIp?: string): HeadersInit {
  if (!API_BEARER_TOKEN) {
    console.warn("API_BEARER_TOKEN environment variable is not set");
    return {};
  }

  return {
    Authorization: `Bearer ${API_BEARER_TOKEN}`,
    ...(readerIp ? { "X-Rails-Reader-IP": readerIp } : {}),
  };
}

/**
 * Creates fetch options with Authorization header and optional additional
 * options. See createAuthHeaders for what `readerIp` does.
 */
export function createAuthFetchOptions(additionalOptions?: RequestInit, readerIp?: string): RequestInit {
  return {
    ...additionalOptions,
    headers: {
      ...createAuthHeaders(readerIp),
      ...additionalOptions?.headers,
    },
  };
}
