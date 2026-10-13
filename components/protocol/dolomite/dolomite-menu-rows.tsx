"use client";

// The Dolomite account's rows at the head of the position card's ⋮ menu
// (ui-jobs 270, 246): its account number with a copy, and a link to its page.

import { useState } from "react";
import { Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { shortAccountNumber } from "@/lib/dolomite/asset-catalog";

export function DolomiteMenuRows({
  accountNumber,
  pagePath,
}: {
  /** The account number, canonical decimal. */
  accountNumber: string;
  /** The account page's path, copied as a full link. */
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
        title={`Account ${shortAccountNumber(accountNumber)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the account number"}
        onClick={() => copy("id", accountNumber)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this account"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}
