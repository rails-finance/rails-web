"use client";

// Export control for the Aave V4 spoke detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the spoke-specific Markdown serializer,
// mirroring components/trove/TroveExportMenu.tsx. The wrapper exists so the
// page can lazy-load the whole export path (dropdown UX + serializer + CSV
// builder) as one chunk off the initial bundle.

import { ExportMenu } from "@/components/shared/export-menu";
import { spokeToMarkdown, type AaveV4SpokeMarkdownArgs } from "@/lib/aave-v4/spoke-to-markdown";

type Props = Omit<AaveV4SpokeMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
};

export function AaveV4ExportMenu({ csvFilename, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => spokeToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      csvFilename={csvFilename}
    />
  );
}
