// Home-page value loader — the dollars held in open positions, beside the count.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Fetches the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle) — imported only from the
// home page server component. Carries `next.revalidate`, so the page stays
// static (ISR) and the figure refreshes in the background hourly.
//
// One request: `GET /api/stats/value-held` answers a row per explorer (counted
// or not, with its reason). The settle rule — an explorer adds only when its row
// is counted with a finite figure, every launched explorer must have an answer,
// the total is recomputed here — is `settleValueHeld` in value-held.ts. Any
// failure returns null and the band states the position count alone.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { fetchWithRetry } from "@/lib/api/resilient-fetch";
import { CHAINS } from "@/lib/shared/chains";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";
import { settleValueHeld, type ValueHeld, type ValueHeldData } from "./value-held";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** Matches the route-segment `revalidate` on app/(site)/page.tsx. */
const REVALIDATE_SECONDS = 3600;

type ValueHeldEnvelope = { success?: boolean; data?: ValueHeldData };

const ROSTER = LAUNCHED_PROTOCOLS.map((p) => ({
  id: p.id,
  slug: p.slug,
  protocolKey: p.protocolKey,
  chainId: p.chainId,
  label: p.label,
  chainName: CHAINS[p.chainId].name,
}));

export async function getValueHeld(): Promise<ValueHeld | null> {
  if (!RAILS_API_URL) {
    console.error("value-held: RAILS_API_URL is not set");
    return null;
  }

  try {
    // The route prices every open position across the roster in one pass, so
    // like /api/stats/overview it is slow when healthy; the per-attempt budget
    // is stated (90 s) rather than left to the helper's default.
    const res = await fetchWithRetry(
      `${RAILS_API_URL}/api/stats/value-held`,
      createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
      { attemptTimeoutMs: 90_000 },
    );
    if (!res.ok) {
      console.error(`value-held: /api/stats/value-held -> ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as ValueHeldEnvelope;
    if (json.success === false) {
      console.error("value-held: /api/stats/value-held -> success=false");
      return null;
    }
    return settleValueHeld(json.data, ROSTER);
  } catch (err) {
    console.error("value-held: /api/stats/value-held failed", err);
    return null;
  }
}
