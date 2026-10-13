"use client";

// The LlamaLend position's rows at the head of the position card's ⋮ menu
// (rails-ops TO-DO-position-card 322): its market's Controller with a copy, and
// a link to its page. The grain is the (controller, user) pair, so the
// Controller is the position's ID beside the borrower the page's wallet row
// already shows.

import { useState } from "react";
import { Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { shortAddr } from "@/lib/shared/format-event";

export function LlamalendMenuRows({
  controller,
  pagePath,
}: {
  /** The market's Controller address. */
  controller: string;
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
        title={`Market ${shortAddr(controller)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the Controller address"}
        onClick={() => copy("id", controller)}
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
