"use client";

// The event card's ⋮ (rails-ops TO-DO-ui-jobs 281, 308), at the header's
// right end before the number pill (ui-jobs 295), the same on every family:
// Open event page, and inside a group Hide or Show {n} grouped events. The
// explorer link is the row's hash under Display's Transaction hashes (ui-jobs
// 294); copy link and Show provenance are on the event page's actions row
// (`components/shared/event-page-aside.tsx`), which reuses `useMenuCopied` and
// `eventMarkdownHref` from here.

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";

/** The menu's words. */
const WORDS = {
  menu: "Event menu",
  heading: "Event",
  view_page: "Open event page",
  view_page_hint: "Open this event's page",
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

/** Whether the ⋮ has a row: the event page from anywhere but that page,
 *  or a group's show or hide. */
export function useEventMenuRows(shareHref: string | null, groupShow: boolean): boolean {
  const pathname = usePathname();
  const group = useContext(GroupHideContext);
  const pagePath = shareHref?.split("?")[0] ?? null;
  return groupShow || group != null || (pagePath != null && pathname !== pagePath);
}

export function EventCardMenu({
  shareHref,
  groupShow,
}: {
  /** A closed group's row: its one item, "Show 48 grouped events", the only
   *  way to open the group (ui-jobs 250, third revision). */
  groupShow?: { title: string; subtitle: string; show: () => void };
  /** The event page's path (`useEventShareHref`); null outside a timeline,
   *  where the page row is left out. */
  shareHref: string | null;
}) {
  const pathname = usePathname();
  const group = useContext(GroupHideContext);
  const pagePath = shareHref?.split("?")[0] ?? null;
  const onEventPage = pagePath != null && pathname === pagePath;

  return (
    <ToolsMenu variant="event" label={WORDS.menu} heading={WORDS.heading}>
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
          </>
        )
      }
    </ToolsMenu>
  );
}
