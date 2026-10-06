"use client";

// The event card's ⋮ (rails-ops TO-DO-ui-jobs 281): at the right end of T2's
// price row where the family draws one (`EventMenuSlot`), else in T6 before
// the "?", on the timeline card and the event page. The position card's menu
// (C17, `ToolsMenu` variant `card`) with the event's rows: open the event page
// (not on that page), open the explorer, copy the page's link, then the
// family's rows (`extra`, Liquity V2's Copy for LLM). A copy row shows a tick
// and "Copied" for a moment, as C17's rows do.

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ExplorerMark } from "@/components/shared/explorer-mark";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";

/** The menu's words. A family's strings file can replace them (Liquity V2:
 *  `copy_words` in content/liquity-v2/event-prose.yaml); `view_explorer`
 *  unset reads "View on {the chain's explorer}". */
export interface EventMenuWords {
  menu: string;
  heading: string;
  view_page: string;
  view_page_hint: string;
  view_explorer?: string;
  view_explorer_hint: string;
  copy_link: string;
  copy_link_hint: string;
  copied: string;
}

export const EVENT_MENU_WORDS: EventMenuWords = {
  menu: "Event menu",
  heading: "Event",
  view_page: "View event page",
  view_page_hint: "Open this event's page",
  view_explorer_hint: "Open the transaction's logs",
  copy_link: "Copy link to event page",
  copy_link_hint: "Copy the page's address",
  copied: "Copied",
};

/** The event menu, handed to a family's T2 that draws a price row: the row
 *  places it at its right end (`EventCard`'s `menuInDetail`). Null elsewhere. */
export const EventMenuSlot = createContext<ReactNode>(null);

export function useEventMenuSlot(): ReactNode {
  return useContext(EventMenuSlot);
}

/** A copy row's moment of confirmation, keyed by row. */
export function useMenuCopied(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      },
      (err) => console.error("Failed to copy:", err),
    );
  };
  return [copied, copy];
}

export function EventCardMenu({
  txHash,
  shareHref,
  words = EVENT_MENU_WORDS,
  extra,
}: {
  txHash: string;
  /** The event page's path (`useEventShareHref`); null outside a timeline,
   *  where the page rows are left out. */
  shareHref: string | null;
  words?: EventMenuWords;
  /** The family's rows, after the page link. */
  extra?: ReactNode;
}) {
  const chainId = useChainId();
  const pathname = usePathname();
  const [copied, copy] = useMenuCopied();
  const pagePath = shareHref?.split("?")[0] ?? null;
  const onEventPage = pagePath != null && pathname === pagePath;
  const explorerTitle = words.view_explorer ?? `View on ${chainMeta(chainId).explorerName}`;
  const tick = <Icon name="check" size={16} />;

  return (
    <ToolsMenu variant="event" label={words.menu} heading={words.heading}>
      {(close) => (
        <>
          {shareHref && !onEventPage && (
            <ToolsMenuItem
              item="view-page"
              icon={<ArrowUpRight size={16} />}
              title={words.view_page}
              subtitle={words.view_page_hint}
              href={shareHref}
              onClick={close}
            />
          )}
          <ToolsMenuItem
            item="view-explorer"
            icon={<ExplorerMark chainId={chainId} />}
            title={explorerTitle}
            subtitle={words.view_explorer_hint}
            href={explorerUrl(chainId, "tx-logs", txHash)}
            external
            onClick={close}
          />
          {shareHref && (
            <ToolsMenuItem
              item="copy-link"
              icon={copied === "link" ? tick : <Link2 size={16} className="-rotate-45" />}
              title={words.copy_link}
              subtitle={copied === "link" ? words.copied : words.copy_link_hint}
              copied={copied === "link"}
              onClick={() => copy("link", `${window.location.origin}${shareHref}`)}
            />
          )}
          {extra}
        </>
      )}
    </ToolsMenu>
  );
}
