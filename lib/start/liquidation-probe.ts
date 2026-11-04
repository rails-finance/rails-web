// Does an explorer's listing hold any liquidated position? /start's "Recent
// liquidations" page lists the explorers whose listing can filter to
// liquidated positions; for a young protocol that filter opens on "0 Troves"
// (Asymmetry and Basedollar on 4 Nov 2026), and a row that opens on nothing is
// left off (rails-ops ui-jobs 488).
//
// Probed only where the listing's own fetcher takes a status filter and a
// limit. An explorer with no probe, or a probe that fails or times out, keeps
// its row: unknown is not empty.

import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { ssrHop } from "@/lib/shared/listing-ssr";

const PROBE_TIMEOUT_MS = 4000;

type Fetcher = (p: {
  status: ["liquidated"];
  limit: number;
  baseUrl: string;
  headers: HeadersInit;
  signal: AbortSignal;
}) => Promise<{ data: unknown[] }>;

const PROBES: Record<string, Fetcher> = {
  asymmetry: fetchAsymmetryTroves,
  basedollar: fetchBasedollarTroves,
  ebisu: fetchEbisuTroves,
};

/** The explorer ids among `ids` whose listing was read and holds no liquidated position. */
export async function withoutLiquidations(ids: string[]): Promise<Set<string>> {
  const probed = ids.filter((id) => PROBES[id]);
  if (probed.length === 0) return new Set();
  const hop = await ssrHop();
  if (!hop) return new Set();
  const empty = await Promise.all(
    probed.map(async (id) => {
      try {
        const r = await PROBES[id]({
          status: ["liquidated"],
          limit: 1,
          baseUrl: hop.baseUrl,
          headers: hop.headers,
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return r.data.length === 0 ? id : null;
      } catch {
        return null;
      }
    }),
  );
  return new Set(empty.filter((id): id is string => id !== null));
}
