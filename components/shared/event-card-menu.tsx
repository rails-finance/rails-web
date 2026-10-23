"use client";

// The event card's ⋮ (rails-ops TO-DO-ui-jobs 281, 308), at the T1 row's
// right end (ui-jobs 295), the same on every family: Open event page, inside
// a group Show {n} grouped events or Group {n} events, and on a timeline Hide the row's
// type of event, the Types of event filter's untick, and where the row's head
// names a party (a via, to/from or venue chip) Trace that chip, which opens its
// receipt at the chip (`headChip`, ui-jobs 433). On the event page it holds
// the event's Inspect provenance (`provScope`). The explorer link is the row's
// hash under Display's Transaction hashes (ui-jobs 294); copy link is on the
// event page's actions row (`components/shared/event-page-aside.tsx`), which
// reuses `useMenuCopied` and `eventMarkdownHref` from here.

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronUp, Crosshair, EyeOff } from "lucide-react";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";

/** The menu's words. */
const WORDS = {
  menu: "Event menu",
  heading: "Event",
  view_page: "Open event page",
  view_page_hint: "Open this event's page",
  hide_type_hint: "Tick it in Types of event to bring them back",
  trace_chip_hint: "Open its receipt in the row",
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
 *  ("Group 48 events"). The same handler as the group's pill. */
export const GroupHideContext = createContext<{ title: string; subtitle: string; hide: () => void } | null>(null);

/** A timeline row's type, for its ⋮ ("Hide “Redeemed” events"): the same
 *  as unticking the type in the Types of event filter (the timeline
 *  provides it per row; a group's row takes its members' type). */
export const EventTypeHideContext = createContext<{ title: ReactNode; subtitle: string; hide: () => void } | null>(
  null,
);

/** The type row's words: the filter's own label for the type, and its mark
 *  where the filter draws one (Liquity V2's delegate-set "Interest rate"). */
export function hideTypeWords(label: string, suffix?: ReactNode): { title: ReactNode; subtitle: string } {
  return {
    title: (
      <>
        Hide “{label}
        {suffix && <span className="ml-1 inline-flex align-middle">{suffix}</span>}” events
      </>
    ),
    subtitle: WORDS.hide_type_hint,
  };
}

/** Whether the ⋮ has a row: the event page from anywhere but that page,
 *  a group's show or hide, the row's type to hide, or a head chip to trace. */
export function useEventMenuRows(shareHref: string | null, groupShow: boolean, headChip = false): boolean {
  const pathname = usePathname();
  const group = useContext(GroupHideContext);
  const hideType = useContext(EventTypeHideContext);
  const pagePath = shareHref?.split("?")[0] ?? null;
  return groupShow || headChip || group != null || hideType != null || (pagePath != null && pathname !== pagePath);
}

export function EventCardMenu({
  shareHref,
  groupShow,
  provScope,
  headChip,
}: {
  /** A closed group's row: its one item, "Show 48 grouped events", the only
   *  way to open the group (ui-jobs 250, third revision). */
  groupShow?: { title: string; subtitle: string; show: () => void };
  /** The event page's path (`useEventShareHref`); null outside a timeline,
   *  where the page row is left out. */
  shareHref: string | null;
  /** The event page's row: Inspect provenance, armed on this event. */
  provScope?: { id: string; hint: string };
  /** The row's head chip ("via WETH gateway", "to Balancer V3", "via CoW
   *  Protocol"): its words, and the open that arms the row and pins the
   *  chip's receipt. One mechanism for every PartyChip (HeadChipContext). */
  headChip?: { words: string; open: () => void };
}) {
  const pathname = usePathname();
  const group = useContext(GroupHideContext);
  const hideType = useContext(EventTypeHideContext);
  const pagePath = shareHref?.split("?")[0] ?? null;
  const onEventPage = pagePath != null && pathname === pagePath;
  const hideTypeRow = (close: () => void) =>
    hideType && (
      <ToolsMenuItem
        item="hide-type"
        icon={<EyeOff size={16} />}
        title={hideType.title}
        subtitle={hideType.subtitle}
        onClick={() => {
          close();
          hideType.hide();
        }}
      />
    );

  return (
    <ToolsMenu variant="event" label={WORDS.menu} heading={WORDS.heading} provScope={provScope}>
      {(close) =>
        groupShow ? (
          <>
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
            {hideTypeRow(close)}
          </>
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
            {headChip && (
              <ToolsMenuItem
                item="trace-chip"
                icon={<Crosshair size={16} />}
                title={<>Trace “{headChip.words}”</>}
                subtitle={WORDS.trace_chip_hint}
                onClick={() => {
                  close();
                  headChip.open();
                }}
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
            {hideTypeRow(close)}
          </>
        )
      }
    </ToolsMenu>
  );
}
