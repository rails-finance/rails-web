"use client";

// The Trove's own rows at the head of the position card's ⋮ menu (ui-jobs
// 270, 246): its ID with a copy, its NFT, and a link to its page. They left
// the card's header, where each was a 12px icon.

import { useState } from "react";
import { Image as ImageIcon, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";

function useCopied(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return [copied, copy];
}

export function TroveMenuRows({
  troveId,
  nftUrl,
  pagePath,
  shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`,
}: {
  troveId: string;
  /** The Trove NFT's marketplace page, when the family knows its contract. */
  nftUrl: string | null;
  /** The Trove page's path, copied as a full link. */
  pagePath: string;
  shortId?: (id: string) => string;
}) {
  const [copied, copy] = useCopied();
  return (
    <>
      <ToolsMenuItem
        icon={<Icon name={copied === "id" ? "check" : "trove-id"} size={16} />}
        title={`Trove ${shortId(troveId)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the Trove ID"}
        onClick={() => copy("id", troveId)}
      />
      {nftUrl && (
        <ToolsMenuItem
          icon={<ImageIcon size={16} />}
          title="Trove NFT"
          subtitle="Open it on OpenSea"
          onClick={() => window.open(nftUrl, "_blank", "noopener,noreferrer")}
        />
      )}
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this Trove"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}
