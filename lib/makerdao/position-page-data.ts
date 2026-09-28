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
// /api/chain/makerdao/vault/<id>: that handler runs exactly this line. The
// indexed reads do the same with the proxy routes' shaping
// (lib/makerdao/proxy-reads.ts), reading the BOX in place of each route.
//
// The [vault] param is a cdp id, or a urn ADDRESS for LockStake engine urns
// (cdp-less, decision 0013) and direct-Vat urns. The roster lookup must use the
// matching filter — a non-numeric cdpId is ignored server-side and would
// silently return some other vault's page-1 row. A direct urn's Vat read needs
// its ilk, which only the index row names, so for that one kind the read
// follows the row instead of running beside it.
//
import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readMakerOpeningBalance, readMakerTimeline, readMakerVaults } from "@/lib/makerdao/proxy-reads";
import type { MakerGroupedTimelineResult } from "@/lib/api/fetch-makerdao-timeline";
import type { MakerTimelineResult } from "@/lib/sources/api/makerdao-timeline";
import { loadMakerVaultStateFromChain } from "@/lib/sources/chain/makerdao-position";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import type { MakerVaultState } from "@/lib/sources/chain/makerdao-position";

interface MakerVaultReads {
  summary: MakerVaultSummary | null;
  chain: MakerVaultState | null;
}

/**
 * ONE timeline read, whichever shape the URL asked for — the SparkLend and
 * Aave V3 loaders' rule: the grouped answer REPLACES the flat window, and
 * `grouped` is a boolean because `cache()` keys on argument identity. It
 * defaults to FALSE for the callers that omit it, the opengraph images and the
 * event page's metadata, which name ONE event and need it findable by id; a
 * grouped answer carries only the ungrouped events. The page passes the URL's
 * answer.
 */
export const loadMakerVaultTail = cache(async (vault: string, grouped: boolean = false) => {
  const isUrnAddr = /^0x[0-9a-fA-F]{40}$/.test(vault);
  const tail = await loadPositionTail<MakerVaultReads, MakerTimelineResult | MakerGroupedTimelineResult>({
    label: "makerdao",
    readPositions: async (baseUrl, headers) => {
      const [vaults, chain] = await Promise.all([
        readMakerVaults(new URLSearchParams(isUrnAddr ? { urn: vault, limit: "1" } : { cdpId: vault, limit: "1" }), {
          baseUrl,
          headers,
        }).then((answer) => answerEnvelope<MakerVaultSummary>(answer, "readMakerVaults", 1)),
        // The Vat read is additive: the index row alone still renders a vault,
        // with the chain-derived lines absent rather than wrong. A failure here
        // must not cost the history beside it.
        loadMakerVaultStateFromChain(vault, undefined).catch((err) => {
          console.error("makerdao-position-page-data: Vat read failed", err);
          return null;
        }),
      ]);
      const summary = vaults.data[0] ?? null;
      const direct = isUrnAddr && chain == null && summary != null && summary.cdpId == null && !summary.lse;
      const directChain = direct
        ? await loadMakerVaultStateFromChain(vault, undefined, summary.ilk).catch((err) => {
            console.error("makerdao-position-page-data: Vat read failed", err);
            return null;
          })
        : null;
      return { summary, chain: chain ?? directChain };
    },
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<MakerTimelineResult | MakerGroupedTimelineResult>(
        await readMakerTimeline(
          vault,
          new URLSearchParams(grouped ? { group: "1" } : { recent: String(TIMELINE_WINDOW_EVENTS) }),
          { baseUrl, headers },
        ),
        "readMakerTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readMakerOpeningBalance(vault, new URLSearchParams({ cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readMakerOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return {
    ...tail,
    summary: tail.positions?.summary ?? null,
    chain: tail.positions?.chain ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? (tail.timeline as MakerGroupedTimelineResult) : null,
  };
});
