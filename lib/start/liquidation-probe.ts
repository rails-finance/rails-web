// Does an explorer's listing hold any liquidated position? /start's "Recent
// liquidations" page lists the explorers whose listing can filter to
// liquidated positions; for a young protocol that filter opens on "0 Troves"
// (Asymmetry and Basedollar on 4 Nov 2026), and a row that opens on nothing is
// left off (rails-ops ui-jobs 488).
//
// Read from the box with one limit-1 request per explorer, cached for ten
// minutes by the fetch cache, so the page stays static and a visit costs no
// api calls; a liquidation shows within ten minutes. Only the explorers whose
// box route takes a status filter are probed. An explorer with no probe, or a
// probe that fails or times out, keeps its row: unknown is not empty.

import { createAuthHeaders } from "@/lib/api/fetch-with-auth";

const PROBE_TIMEOUT_MS = 4000;
const REVALIDATE_SECONDS = 600;

const BOX_ROUTE: Record<string, string> = {
  asymmetry: "/api/asymmetry/troves",
  basedollar: "/api/basedollar/troves",
  ebisu: "/api/ebisu/troves",
};

/** The explorer ids among `ids` whose listing was read and holds no liquidated position. */
export async function withoutLiquidations(ids: string[]): Promise<Set<string>> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  const probed = ids.filter((id) => BOX_ROUTE[id]);
  if (!base || probed.length === 0) return new Set();
  const empty = await Promise.all(
    probed.map(async (id) => {
      try {
        const res = await fetch(`${base}${BOX_ROUTE[id]}?status=liquidated&limit=1`, {
          headers: createAuthHeaders(),
          next: { revalidate: REVALIDATE_SECONDS },
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: unknown[] };
        return Array.isArray(json.data) && json.data.length === 0 ? id : null;
      } catch {
        return null;
      }
    }),
  );
  return new Set(empty.filter((id): id is string => id !== null));
}
