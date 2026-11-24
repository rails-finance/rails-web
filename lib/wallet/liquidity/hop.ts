import "server-only";

// The one way the wallet page's Liquidity section (W9) reaches rails-server: each of its eleven
// owner routes goes through `liquidityHop`, each with a wait, in a slot of the cap every
// wallet-page request to the api host shares (lib/wallet/api-hop.ts `apiHop`, ui-jobs 814).
// No chain read stands behind these routes, so a reset connection is tried once more.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { isReadCeiling } from "@/lib/shared/read-ceiling";
import { apiHop } from "@/lib/wallet/api-hop";

/** An answer; the daily read ceiling's 503; a Balancer index refusal (503 `index_unavailable`
 *  or `index_behind`); or no answer (any other status, a reset, the wait run out). */
export type HopAnswer<T> =
  | { kind: "ok"; data: T }
  | { kind: "ceiling" }
  | { kind: "refused"; code: string }
  | { kind: "failed"; error: string };

const REFUSALS = new Set(["index_unavailable", "index_behind"]);

/** `waitMs`: the request's wait, cut to what is left before `deadline` (epoch ms) when its slot
 *  is granted. */
export async function liquidityHop<T>(
  path: string,
  opts: { readerIp?: string; waitMs: number; deadline: number },
): Promise<HopAnswer<T>> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) return { kind: "failed", error: "RAILS_API_URL is not set" };
  try {
    return await apiHop(async (): Promise<HopAnswer<T>> => {
      const wait = Math.min(opts.waitMs, opts.deadline - Date.now());
      if (wait < 500) return { kind: "failed", error: "no time left in the read's budget" };
      // Kept a minute, as the explorers' clients keep it.
      const res = await fetch(
        `${base}${path}`,
        createAuthFetchOptions({ next: { revalidate: 60 }, signal: AbortSignal.timeout(wait) }, opts.readerIp),
      );
      if (res.ok) return { kind: "ok", data: (await res.json()) as T };
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 503 && body?.error && REFUSALS.has(body.error)) return { kind: "refused", code: body.error };
      if (isReadCeiling(res.status, body)) return { kind: "ceiling" };
      return { kind: "failed", error: `answered ${res.status}` };
    });
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
