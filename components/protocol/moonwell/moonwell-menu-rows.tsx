"use client";

// The account's rows at the head of the Moonwell position card's ⋮ menu
// (rails-ops TO-DO-position-card 322): the wallet address with a copy, and a
// link to this position's page.

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";

export function MoonwellMenuRows({ wallet, pagePath }: { wallet: string; pagePath: string }) {
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
        icon={<Icon name={copied === "id" ? "check" : "trove-id"} size={16} />}
        title={`Account ${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
        subtitle={copied === "id" ? "Copied" : "Copy the wallet address"}
        onClick={() => copy("id", wallet)}
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
