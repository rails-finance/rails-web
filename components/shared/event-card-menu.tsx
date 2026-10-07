"use client";

// The event card's ⋮ (rails-ops TO-DO-ui-jobs 281), at the header's right end
// before the number pill (ui-jobs 295). The position card's menu (C17,
// `ToolsMenu` variant `card`) with the event's rows: open the event page (not
// on that page), open the explorer, copy the page's link, then "Show
// provenance", which arms the inspector on this event alone (ui-jobs 284). A copy row shows a
// tick and "Copied" for a moment, as C17's rows do. Liquity V2 draws no menu:
// its event page's aside carries the actions (ui-jobs 291), reusing
// `useMenuCopied` and `eventMarkdownHref` from here.

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ExplorerMark } from "@/components/shared/explorer-mark";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";

/** The menu's words; the explorer row reads "View on {the chain's explorer}". */
const WORDS = {
  menu: "Event menu",
  heading: "Event",
  view_page: "Open event page",
  view_page_hint: "Open this event's page",
  view_explorer_hint: "Open the transaction's logs",
  copy_link: "Copy link to event page",
  copy_link_hint: "Copy the page's address",
  copied: "Copied",
  provenance_hint: "Click a value on this event to trace it",
};

/** The clipboard write for a text that arrives later (a fetch): a
 *  `ClipboardItem` holding the promise, created inside the click so Safari
 *  keeps the gesture; where the browser has no `ClipboardItem` or refuses it,
 *  the text is written once it lands. */
function writeLater(value: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    const blob = value.then((t) => new Blob([t], { type: "text/plain" }));
    return navigator.clipboard
      .write([new ClipboardItem({ "text/plain": blob })])
      .catch(() => value.then((t) => navigator.clipboard.writeText(t)));
  }
  return value.then((t) => navigator.clipboard.writeText(t));
}

/** A copy row's moment of confirmation, keyed by row. */
export function useMenuCopied(): [string | null, (key: string, value: string | Promise<string>) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string | Promise<string>) => {
    (typeof value === "string" ? navigator.clipboard.writeText(value) : writeLater(value)).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      },
      (err) => console.error("Failed to copy:", err),
    );
  };
  return [copied, copy];
}

/** The event's raw Markdown path: the event page's path with `.md`. */
export function eventMarkdownHref(shareHref: string): string {
  return `${shareHref.split("?")[0]}.md`;
}

/** An open group around a member row: its collapse, for the member's ⋮
 *  ("Hide 48 grouped events"). The same handler as the group's pill. */
export const GroupHideContext = createContext<{ title: string; subtitle: string; hide: () => void } | null>(null);

export function EventCardMenu({
  txHash,
  shareHref,
  scopeId,
  pageOnly,
  groupShow,
}: {
  txHash?: string;
  /** A closed group's row: its one item, "Show 48 grouped events", the only
   *  way to open the group (ui-jobs 250, third revision). */
  groupShow?: { title: string; subtitle: string; show: () => void };
  /** Liquity V2's rows: the event page alone (the page's aside carries the
   *  other actions, ui-jobs 291), and "Hide" inside an open group. */
  pageOnly?: boolean;
  /** The event card's receipts scope (the event's id), which the menu's
   *  "Show provenance" row arms. */
  scopeId: string;
  /** The event page's path (`useEventShareHref`); null outside a timeline,
   *  where the page rows are left out. */
  shareHref: string | null;
}) {
  const chainId = useChainId();
  const pathname = usePathname();
  const [copied, copy] = useMenuCopied();
  const group = useContext(GroupHideContext);
  const pagePath = shareHref?.split("?")[0] ?? null;
  const onEventPage = pagePath != null && pathname === pagePath;
  const explorerTitle = `View on ${chainMeta(chainId).explorerName}`;
  const tick = <Icon name="check" size={16} />;

  return (
    <ToolsMenu
      variant="event"
      label={WORDS.menu}
      heading={WORDS.heading}
      provScope={pageOnly || groupShow ? undefined : { id: scopeId, hint: WORDS.provenance_hint }}
    >
      {(close) =>
        groupShow ? (
          <ToolsMenuItem
            item="show-group"
            expanded={false}
            icon={<ChevronDown size={16} />}
            title={groupShow.title}
            subtitle={groupShow.subtitle}
            onClick={() => {
              close();
              groupShow.show();
            }}
          />
        ) : (
          <>
            {shareHref && !onEventPage && (
              <ToolsMenuItem
                item="view-page"
                icon={<ArrowUpRight size={16} />}
                title={WORDS.view_page}
                subtitle={WORDS.view_page_hint}
                href={shareHref}
                onClick={close}
              />
            )}
            {group && (
              <ToolsMenuItem
                item="hide-group"
                expanded
                icon={<ChevronUp size={16} />}
                title={group.title}
                subtitle={group.subtitle}
                onClick={() => {
                  close();
                  group.hide();
                }}
              />
            )}
            {!pageOnly && txHash && (
              <ToolsMenuItem
                item="view-explorer"
                icon={<ExplorerMark chainId={chainId} />}
                title={explorerTitle}
                subtitle={WORDS.view_explorer_hint}
                href={explorerUrl(chainId, "tx-logs", txHash)}
                external
                onClick={close}
              />
            )}
            {shareHref && !pageOnly && (
              <ToolsMenuItem
                item="copy-link"
                icon={copied === "link" ? tick : <Link2 size={16} className="-rotate-45" />}
                title={WORDS.copy_link}
                subtitle={copied === "link" ? WORDS.copied : WORDS.copy_link_hint}
                copied={copied === "link"}
                onClick={() => copy("link", `${window.location.origin}${shareHref}`)}
              />
            )}
          </>
        )
      }
    </ToolsMenu>
  );
}
