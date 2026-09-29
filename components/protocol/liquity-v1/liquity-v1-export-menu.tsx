"use client";

// Export control for the Liquity V1 Trove detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the V1 Markdown serializer, mirroring
// components/protocol/spark/spark-export-menu.tsx. The wrapper exists so the
// page can lazy-load the whole export path (dropdown UX + serializer + CSV
// builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { liquityV1PositionToMarkdown, type LiquityV1PositionMarkdownArgs } from "@/lib/liquity-v1/position-to-markdown";

type Props = Omit<LiquityV1PositionMarkdownArgs, "generatedAt"> & {
  /** Loads the position's whole history for the CSV, on a page that drew a
   *  window. Absent where the page already holds every event. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** What the exported EVENT LIST covers, when the page drew a window. The
   *  Trove figures in the snapshot are whole-life either way — they are seeded
   *  from the opening balance — but the per-event rows are the window, and the
   *  menu says so rather than handing over a short spreadsheet. */
  scopeNote?: string;
  /** The Trove's collateral-surplus claim, which the index does not carry
   *  (lib/shared/liquity-coll-surplus-claim.ts): a CSV row of its own. */
  claimRow?: BaseActivityEvent | null;
};

export function LiquityV1ExportMenu({ csvFilename, scopeNote, fetchAllEvents, claimRow, ...markdownArgs }: Props) {
  const withClaim = (events: BaseActivityEvent[]) =>
    claimRow && !events.some((e) => e.id === claimRow.id) ? [...events, claimRow] : events;
  return (
    <ExportMenu
      buildMarkdown={() => liquityV1PositionToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={withClaim(markdownArgs.events)}
      fetchAllEvents={
        fetchAllEvents &&
        (async () => {
          const all = await fetchAllEvents();
          return { ...all, events: withClaim(all.events) };
        })
      }
      csvFilename={csvFilename}
      scopeNote={scopeNote}
    />
  );
}
