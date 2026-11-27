// A provider refusing a log range is an answer, not a throttle.
// ----------------------------------------------------------------------------
// Dwellir answers an over-range `eth_getLogs` with HTTP 200 and JSON-RPC code
// -32005 ("eth_getLogs range of 501 blocks exceeds the 500-block limit…", or
// "…violated the log range policy"). viem maps -32005 to LimitExceededRpcError,
// which its http transport retries like a throttle: three more identical
// requests over about a second, each refused the same way.
//
// `rangeRefusalsFailAtOnce` wraps an `http` transport built with
// `retryCount: 0` and retries as viem would (the rule and schedule below are
// viem 2.33's `shouldRetry` and delay in utils/buildRequest.ts), except that a
// range refusal throws on the first answer. A -32005 without that message is
// still retried. Imports nothing through `@/` and is not server-only, so the
// Basename resolver's client can use it and a test loads it directly.

import type { Transport } from "viem";

const RANGE_REFUSAL = /exceeds the [\d,]+-block limit|violated the log range policy/i;

/** Is this error a provider refusing the block range of a log query, read
 *  from the message on the error or any error in its `cause` chain. */
export function isRangeRefusal(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; e && typeof e === "object" && depth < 6; depth++) {
    const o = e as { message?: unknown; details?: unknown; cause?: unknown };
    if (typeof o.message === "string" && RANGE_REFUSAL.test(o.message)) return true;
    if (typeof o.details === "string" && RANGE_REFUSAL.test(o.details)) return true;
    e = o.cause;
  }
  return false;
}

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 150;
const RETRIED_CODES = new Set([-1, -32005, -32603]);
const RETRIED_STATUSES = new Set([403, 408, 413, 429, 500, 502, 503, 504]);

/** viem's rule for a retry: an unknown, limit-exceeded or internal RPC error,
 *  one of the HTTP statuses above, or an error carrying neither. */
function viemWouldRetry(error: unknown): boolean {
  const o = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof o.code === "number") return RETRIED_CODES.has(o.code);
  if (typeof o.status === "number") return RETRIED_STATUSES.has(o.status);
  return true;
}

/** viem's wait before retry `count`: a numeric Retry-After header, else
 *  150 ms doubled per attempt. */
function retryWait(error: unknown, count: number): number {
  const headers = (error as { headers?: { get?: (k: string) => string | null } } | null)?.headers;
  const retryAfter = typeof headers?.get === "function" ? headers.get("Retry-After") : null;
  if (retryAfter && /\d/.test(retryAfter)) return Number.parseInt(retryAfter) * 1000;
  return (1 << count) * RETRY_DELAY_MS;
}

export function rangeRefusalsFailAtOnce(inner: Transport): Transport {
  return (params) => {
    const transport = inner(params);
    const request = (async (args: Parameters<typeof transport.request>[0], options?: unknown) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await transport.request(args, options as never);
        } catch (error) {
          if (attempt >= RETRY_COUNT || isRangeRefusal(error) || !viemWouldRetry(error)) throw error;
          await new Promise((r) => setTimeout(r, retryWait(error, attempt)));
        }
      }
    }) as typeof transport.request;
    return { ...transport, request };
  };
}
