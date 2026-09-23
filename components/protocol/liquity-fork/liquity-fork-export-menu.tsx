"use client";

// Export control for the Ebisu / Asymmetry trove detail pages — a thin wrapper
// over the shared <ExportMenu> that supplies the Liquity-fork Markdown
// serializer, mirroring components/protocol/compound/compound-export-menu.tsx.
// Shared by both forks (the serializer is parameterized); the wrapper exists so
// the pages can lazy-load the whole export path (dropdown UX + serializer +
// CSV builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import {
  liquityForkTroveToMarkdown,
  type LiquityForkTroveMarkdownArgs,
} from "@/lib/shared/liquity-fork-position-markdown";

type Props = Omit<LiquityForkTroveMarkdownArgs, "generatedAt"> & {
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
};

export function LiquityForkExportMenu({ csvFilename, scopeNote, fetchAllEvents, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => liquityForkTroveToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      csvFilename={csvFilename}
      scopeNote={scopeNote}
    />
  );
}
