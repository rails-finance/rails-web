"use client";

// Export control for the Aave V4 spoke detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the spoke-specific Markdown serializer,
// mirroring components/trove/TroveExportMenu.tsx. The wrapper exists so the
// page can lazy-load the whole export path (dropdown UX + serializer + CSV
// builder) as one chunk off the initial bundle.

import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import { spokeToMarkdown, type AaveV4SpokeMarkdownArgs } from "@/lib/aave-v4/spoke-to-markdown";

type Props = Omit<AaveV4SpokeMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** The page's whole-history read for the CSV, since the page itself now draws
   *  a window (rails-ops decisions/0019). Omitted on a position whose window
   *  held its whole life, where `events` already is the download. */
  fetchAllEvents?: () => Promise<WholeHistoryFetch>;
};

export function AaveV4ExportMenu({ csvFilename, fetchAllEvents, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => spokeToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      fetchAllEvents={fetchAllEvents}
      csvFilename={csvFilename}
    />
  );
}
