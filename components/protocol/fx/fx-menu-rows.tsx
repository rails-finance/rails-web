"use client";

// The f(x) position's rows at the head of the position card's ⋮ menu (ui-jobs
// 270, 246): its ID with a copy, its NFT, and a link to its page.

import { useState } from "react";
import { Hash, Image as ImageIcon, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";

export function FxMenuRows({
  positionId,
  nftUrl,
  pagePath,
}: {
  /** The position's ERC721 id in its pool. */
  positionId: string;
  /** The position NFT's marketplace page. */
  nftUrl: string;
  /** The position page's path, copied as a full link. */
  pagePath: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Icon name="check" size={16} /> : <Hash size={16} />}
        title={`Position #${positionId}`}
        subtitle={copied === "id" ? "Copied" : "Copy the position ID"}
        onClick={() => copy("id", positionId)}
      />
      <ToolsMenuItem
        icon={<ImageIcon size={16} />}
        title="Position NFT"
        subtitle="Open it on OpenSea"
        onClick={() => window.open(nftUrl, "_blank", "noopener,noreferrer")}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}
