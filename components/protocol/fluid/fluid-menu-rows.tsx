"use client";

// The position's rows at the head of the Fluid position card's ⋮ menu
// (rails-ops TO-DO-position-card 322): its NFT id with a copy, and a link to
// its page.

import { useState } from "react";
import { Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { shortPositionId } from "@/lib/shared/position-name";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { positionLink } from "@/lib/shared/position-link";

export function FluidMenuRows({ nftId, pagePath }: { nftId: string; pagePath: string }) {
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
        title={`Position ${shortPositionId(nftId)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the NFT id"}
        onClick={() => copy("id", nftId)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", positionLink(pagePath))}
      />
    </>
  );
}
