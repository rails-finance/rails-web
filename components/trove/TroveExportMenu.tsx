"use client";

// Export control for the Liquity V2 trove detail page — a thin wrapper over the
// shared <ExportMenu> that supplies the trove-specific Markdown serializer.
// The dropdown UX (Copy / View as Markdown / Download CSV) lives in
// components/shared/export-menu.tsx; trove serialization in
// lib/liquity/trove-to-markdown.ts.

import { ExportMenu } from "@/components/shared/export-menu";
import { troveToMarkdown, type TroveMarkdownArgs } from "@/lib/liquity/trove-to-markdown";
import { TroveMenuRows } from "@/components/protocol/liquity-family/trove-menu-rows";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";

type Props = Omit<TroveMarkdownArgs, "generatedAt"> & {
  /** Output file name for the CSV download, including the `.csv` extension. */
  csvFilename: string;
  /** Ride the position card's ⋮ menu (ui-jobs 270), led by the Trove's ID,
   *  its NFT and its page link. */
  variant?: "tools" | "card";
};

export function TroveExportMenu({ csvFilename, variant, ...markdownArgs }: Props) {
  const t = markdownArgs.trove;
  return (
    <ExportMenu
      buildMarkdown={() => troveToMarkdown({ ...markdownArgs, generatedAt: new Date() })}
      events={markdownArgs.events}
      csvFilename={csvFilename}
      ariaLabel="Export this Trove"
      variant={variant}
      leading={
        variant === "card"
          ? () => (
              <TroveMenuRows
                troveId={t.id}
                nftUrl={getTroveNftUrl(t.collateralType, t.id)}
                pagePath={`/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`}
              />
            )
          : undefined
      }
    />
  );
}
