// The Liquity V2 branch feeds, read DIRECTLY from rails-server's
// /api/oracle/liquity-v2 with the bearer token. SERVER-ONLY: called by the
// wallet share-image route, which used to hop back through this deployment's
// own /api/oracle/liquity-v2 proxy (see lib/sources/api/troves-backend.ts for
// why the hop was the wrong shape). The proxy itself is untouched — the
// browser still reads through it.
//
// Best-effort: an unanswered read is `null`, which the holder card model turns
// into the static roster card rather than a collateral figure missing a
// branch. The trove page's own tail loader (lib/liquity/trove-page-data.ts)
// makes the same read the same way; it is not shared because that loader
// resolves its reader through next/headers, which a route handler must not
// pull in.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";

export async function readLiquityV2OracleFromBackend(readerIp?: string): Promise<OraclePricesData | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/oracle/liquity-v2`, {
      ...createAuthFetchOptions(undefined, readerIp),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OraclePricesResponse;
    return json.success ? (json.data ?? null) : null;
  } catch {
    return null;
  }
}
