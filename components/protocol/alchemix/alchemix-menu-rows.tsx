"use client";

// The Alchemix position's rows at the head of the position card's ⋮ menu
// (ui-jobs 270, 246): its ID with a copy, an outside link where the position
// has one (the line's Transmuter), and a link to its page. One builder for the
// three kinds: an Alchemist position and a Transmuter position are NFTs with
// an ID, a V2 position is an account.

import { useState } from "react";
import { ExternalLink, Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";

export function AlchemixMenuRows({
  idTitle,
  idValue,
  idSubtitle,
  outside,
  pagePath,
}: {
  /** "Position #1221", "Account 0xb6af…3887". */
  idTitle: string;
  /** What the copy row copies. */
  idValue: string;
  /** The copy row's line before it is pressed. */
  idSubtitle: string;
  /** A page off the site the position belongs to. */
  outside?: { title: string; subtitle: string; url: string } | null;
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
        title={idTitle}
        subtitle={copied === "id" ? "Copied" : idSubtitle}
        onClick={() => copy("id", idValue)}
      />
      {outside ? (
        <ToolsMenuItem
          icon={<ExternalLink size={16} />}
          title={outside.title}
          subtitle={outside.subtitle}
          onClick={() => window.open(outside.url, "_blank", "noopener,noreferrer")}
        />
      ) : null}
      <ToolsMenuItem
        icon={copied === "link" ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}
