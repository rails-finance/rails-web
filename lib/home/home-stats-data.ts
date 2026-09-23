// Home-page overview stats loader — the earliest-transaction + wallet-count
// line under CoveredStats.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Fetches the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle) — imported only from the
// home page server component. Carries `next.revalidate`, so the page stays
// static (ISR) and the figures refresh in the background hourly.
//
// Unlike covered-positions-data.ts, this is a single request: the backend's
// `/api/stats/overview` route (rails-server-onboarding) does its own
// roster-wide aggregation server-side (a UNION over every explorer's own
// events/position surface), so there is no per-protocol fan-out to do here.
//
// Still all-or-nothing in spirit — a response missing either figure is treated
// as a failure and the whole stat line is omitted, rather than rendering one
// figure without the other or falling back to a zero.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { fetchWithRetry } from "@/lib/api/resilient-fetch";
import type { HomeStats } from "./home-stats";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** Matches the route-segment `revalidate` on app/(site)/page.tsx. */
const REVALIDATE_SECONDS = 3600;

type StatsOverviewEnvelope = {
  success?: boolean;
  data?: {
    earliestTransactionAt?: string | null;
    walletCount?: number | null;
    walletCountProtocols?: number | null;
  };
};

export async function getHomeStats(): Promise<HomeStats | null> {
  if (!RAILS_API_URL) {
    console.error("home-stats: RAILS_API_URL is not set");
    return null;
  }

  try {
    // Same retry as the covered-positions legs: this single request gates the
    // whole stat line, and a transient failure would hide it for an ISR cycle.
    // The overview aggregate UNIONs every explorer's events server-side and
    // takes ~32s when HEALTHY (measured 2026-09-02) — the helper's default
    // per-attempt timeout would abort it every time, so the budget is stated.
    const res = await fetchWithRetry(
      `${RAILS_API_URL}/api/stats/overview`,
      createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }),
      { attemptTimeoutMs: 90_000 },
    );
    if (!res.ok) {
      console.error(`home-stats: /api/stats/overview -> ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as StatsOverviewEnvelope;
    const { earliestTransactionAt, walletCount, walletCountProtocols } = json.data ?? {};
    if (!earliestTransactionAt || typeof walletCount !== "number" || typeof walletCountProtocols !== "number") {
      console.error("home-stats: /api/stats/overview -> incomplete data");
      return null;
    }

    return { earliestTransactionAt, walletCount, walletCountProtocols };
  } catch (err) {
    console.error("home-stats: /api/stats/overview failed", err);
    return null;
  }
}
