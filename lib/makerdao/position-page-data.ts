// MakerDAO's vault tail, read server-side. SERVER-ONLY — imported only from the
// vault page's server component. The shape and the failure rules live in
// lib/shared/position-tail-page-data.ts.
//
// THREE reads, not two, and the chain one belongs here rather than in a second
// wave. The page's view is `mergeView(chain, summary)`: the Vat's own urn slots
// (ink, art) and the per-ilk rate carry the face figures, the index row carries
// the rest. Seeding the summary alone would render a merge missing its primary
// half and then let the chain read change the numbers under the reader — the
// provisional-becomes-stated-fact hazard. Measured against the live deployment
// the Vat read answers in 80-230ms, so there is no reason to split it out.
//
// It calls the chain loader directly rather than this deployment's own
// /api/chain/makerdao/vault/<id>: that handler runs exactly this line.
//
// The [vault] param is a cdp id, or a urn ADDRESS for LockStake engine urns
// (cdp-less, decision 0013). The roster lookup must use the matching filter — a
// non-numeric cdpId is ignored server-side and would silently return some other
// vault's page-1 row.
//
import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMakerVaults } from "@/lib/api/fetch-makerdao-vaults";
import { fetchMakerTimeline } from "@/lib/api/fetch-makerdao-timeline";
import { loadMakerVaultStateFromChain } from "@/lib/sources/chain/makerdao-position";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import type { MakerVaultState } from "@/lib/sources/chain/makerdao-position";

interface MakerVaultReads {
  summary: MakerVaultSummary | null;
  chain: MakerVaultState | null;
}

export const loadMakerVaultTail = cache(async (vault: string) => {
  const isUrnAddr = /^0x[0-9a-fA-F]{40}$/.test(vault);
  const tail = await loadPositionTail<MakerVaultReads>({
    label: "makerdao",
    readPositions: async (baseUrl, headers) => {
      const [vaults, chain] = await Promise.all([
        fetchMakerVaults(
          isUrnAddr ? { urn: vault, limit: 1, baseUrl, headers } : { cdpId: vault, limit: 1, baseUrl, headers },
        ),
        // The Vat read is additive: the index row alone still renders a vault,
        // with the chain-derived lines absent rather than wrong. A failure here
        // must not cost the history beside it.
        loadMakerVaultStateFromChain(vault, undefined).catch((err) => {
          console.error("makerdao-position-page-data: Vat read failed", err);
          return null;
        }),
      ]);
      return { summary: vaults.data[0] ?? null, chain: chain ?? null };
    },
    readTimeline: (baseUrl, headers) => fetchMakerTimeline(vault, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: `/api/makerdao/vault/${encodeURIComponent(vault)}/timeline/summary`,
        params: {},
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, summary: tail.positions?.summary ?? null, chain: tail.positions?.chain ?? null };
});
