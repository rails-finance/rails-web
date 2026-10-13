// The Liquity V1 Trove's export shapes (Copy Position, View as Markdown,
// Download CSV) for the position card's ⋮ menu and, on the event route that
// draws no card, the wallet row's Tools: the shared `ExportMenu`'s props with
// the V1 Markdown serializer and the Trove's collateral-surplus claim row.

import type { PositionCardExports } from "@/components/shared/position-card";
import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { liquityV1PositionToMarkdown, type LiquityV1PositionMarkdownArgs } from "@/lib/liquity-v1/position-to-markdown";

type Args = Omit<LiquityV1PositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported event list covers, when the page drew a window. The
   *  Trove figures in the snapshot are whole-life either way; the per-event
   *  rows are the window, and the menu says so. */
  scopeNote?: string;
  /** The Trove's collateral-surplus claim, which the index does not carry
   *  (lib/shared/liquity-coll-surplus-claim.ts): a CSV row of its own. */
  claimRow?: BaseActivityEvent | null;
};

export function liquityV1Exports({
  csvFilename,
  scopeNote,
  fetchAllEvents,
  claimRow,
  ...markdownArgs
}: Args): PositionCardExports {
  const withClaim = (events: BaseActivityEvent[]) =>
    claimRow && !events.some((e) => e.id === claimRow.id) ? [...events, claimRow] : events;
  return {
    buildMarkdown: () => liquityV1PositionToMarkdown({ ...markdownArgs, generatedAt: new Date() }),
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
