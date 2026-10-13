// The export shapes for an Ebisu, Asymmetry or Basedollar Trove on the
// position card's ⋮ (Copy Position, View as Markdown, Download CSV): the
// shared card draws them with `ExportMenu`; the Markdown is the
// Liquity-fork serializer, shared by the three forks.

import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  liquityForkTroveToMarkdown,
  type LiquityForkTroveMarkdownArgs,
} from "@/lib/shared/liquity-fork-position-markdown";

export function liquityForkExports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  claimRow,
  ...markdownArgs
}: Omit<LiquityForkTroveMarkdownArgs, "generatedAt"> & {
  /** Loads the Trove's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  position figures in the snapshot are whole-history either way — they are
   *  seeded from the opening balance — but the per-event rows are the window,
   *  and the menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
  /** The Trove's collateral-surplus claim, which the index does not carry
   *  (lib/shared/liquity-coll-surplus-claim.ts): a CSV row of its own. */
  claimRow?: BaseActivityEvent | null;
}): PositionCardExports {
  const withClaim = (events: BaseActivityEvent[]) =>
    claimRow && !events.some((e) => e.id === claimRow.id) ? [...events, claimRow] : events;
  return {
    buildMarkdown: () => liquityForkTroveToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
    events: withClaim(markdownArgs.events),
    fetchAllEvents:
      fetchAllEvents &&
      (async () => {
        const all = await fetchAllEvents();
        return { ...all, events: withClaim(all.events) };
      }),
    csvFilename,
    scopeNote,
  };
}
