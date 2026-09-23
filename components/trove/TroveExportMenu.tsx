"use client";

// Export control for the Liquity V2 trove detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the trove-specific Markdown serializer.
// The dropdown UX (Copy / View as Markdown / Download CSV) lives in
// components/shared/export-menu.tsx; trove serialization in
// lib/liquity/trove-to-markdown.ts.

import { ExportMenu } from "@/components/shared/export-menu";
import { troveToMarkdown, type TroveMarkdownArgs } from "@/lib/liquity/trove-to-markdown";

type Props = Omit<TroveMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
};

export function TroveExportMenu({ csvFilename, ...markdownArgs }: Props) {
  return (
    <ExportMenu
      buildMarkdown={() => troveToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      csvFilename={csvFilename}
    />
  );
}
