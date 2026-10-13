"use client";

// The rows at the head of the Maple cards' ⋮ menu (rails-ops TO-DO-position-card
// 322): the wallet or contract address with a copy, and a link to the page.

import { useState } from "react";
import { Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { shortAddr } from "@/lib/shared/format-event";

export function MapleMenuRows({
  address,
  pagePath,
  noun,
  idLabel,
}: {
  /** The lender wallet, or the custody contract. */
  address: string;
  /** The page's path, copied as a full link. */
  pagePath: string;
  /** What the link is to: "position" on a lender's card, "address" on a custody card. */
  noun: "position" | "address";
  /** The id row's title before the address: "Wallet" or "Contract". */
  idLabel: "Wallet" | "Contract";
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
        title={`${idLabel} ${shortAddr(address)}`}
        subtitle={copied === "id" ? "Copied" : `Copy the ${idLabel.toLowerCase()} address`}
        onClick={() => copy("id", address)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title={`Link to this ${noun}`}
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}
