"use client";

import {
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GroupHideContext } from "@/components/shared/event-card-menu";
import { TIMELINE_PAGE_ROWS } from "@/lib/shared/timeline-opening-balance";

// A group on the timeline (rails-ops TO-DO-ui-jobs 250 points 3 and 4, 240,
// 331 point 4): a closed group is a row on the spine, its legs summed as
// nodes, and its ⋮ offering "Show 48 grouped events", the one way to open it.
// Open, the members draw as rows and each member's ⋮ offers "Group 48 events", the one
// way to close it. A bracket frame marks the group closed and open and
// carries the range: the newest member's number at its top end, the oldest at
// its tail. The tone sits on the nodes, the T1 word and the dotted segment.

/** Members an open group draws at first, and adds each time the end of what
 *  it drew nears the viewport: a page of rows (rails-ops decision 0039, rule
 *  5: a large group opens as all its rows, windowed). */
export const GROUP_MEMBER_BATCH = TIMELINE_PAGE_ROWS;

/** The event a landing is bringing into view: an open group holding it draws
 *  its members down to it. Provided by the timeline; the id is the member
 *  row's React key (`renderEventRow` keys each row by its event's id). */
export const MemberRevealContext = createContext<string | null>(null);

/** An open group's members as one list: arrays and unkeyed fragments
 *  flattened, each member keeping its key. */
export function flatMembers(node: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (Array.isArray(node)) for (const n of node) flatMembers(n, out);
  else if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment && node.key == null)
    flatMembers(node.props.children, out);
  else if (node != null && node !== false && node !== true) out.push(node);
  return out;
}

/** How many of `total` members an open group draws: `shown`, raised to the
 *  batch holding the member at `revealAt`. */
export function membersDrawn(total: number, shown: number, revealAt: number): number {
  const reveal = revealAt >= 0 ? Math.ceil((revealAt + 1) / GROUP_MEMBER_BATCH) * GROUP_MEMBER_BATCH : 0;
  return Math.min(total, Math.max(shown, reveal));
}

/**
 * An open group's members, drawn a batch at a time: the first
 * `GROUP_MEMBER_BATCH`, then the next as the sentinel below them comes within
 * 600px of the viewport, or on its button. A prefix of the list, so each
 * member keeps its number and its place, and keyboard and reading order stay
 * the document's. The page's row window works the same way
 * (`chain-truth-timeline.tsx`, WINDOWING). Closing the group unmounts this, so
 * a reopen starts at one batch.
 */
function WindowedMembers({ id, members, lead }: { id?: string; members: ReactNode; lead?: ReactNode }) {
  const list = flatMembers(members);
  const [shown, setShown] = useState(GROUP_MEMBER_BATCH);
  const revealId = useContext(MemberRevealContext);
  const revealAt = revealId == null ? -1 : list.findIndex((m) => isValidElement(m) && m.key === revealId);
  const drawn = membersDrawn(list.length, shown, revealAt);
  // A landing's reveal stays drawn once the landing is done.
  useEffect(() => {
    if (drawn > shown) setShown(drawn);
  }, [drawn, shown]);
  const hasMore = drawn < list.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((s) => s + GROUP_MEMBER_BATCH);
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, drawn]);
  const next = Math.min(GROUP_MEMBER_BATCH, list.length - drawn);
  return (
    <div id={id} className="flex flex-col gap-2" data-group-members={list.length} data-group-members-drawn={drawn}>
      {lead}
      {hasMore ? list.slice(0, drawn) : list}
      {hasMore && (
        <div ref={sentinelRef} data-group-more="" className="flex justify-center pl-5">
          <button
            type="button"
            onClick={() => setShown(drawn + GROUP_MEMBER_BATCH)}
            className="rounded-md border border-teal-600/40 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-600/10 dark:border-teal-400/40 dark:text-teal-400 dark:hover:bg-teal-400/10"
          >
            {`Show the next ${next.toLocaleString("en-US")} grouped ${next === 1 ? "event" : "events"}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** The event numbers a client-grouped folder holds, lowest and highest, for
 *  its node (`renderRunFolders` provides it). */
export const GroupNumbersContext = createContext<[number, number] | null>(null);

/** "#139–147", or "#139" for one. */
export function groupRangeText(range: [number, number] | null): string | null {
  if (!range) return null;
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return lo === hi ? `#${lo}` : `#${lo}–${hi}`;
}

/** The menu rows that open and close a group: the closed row's ⋮ shows it
 *  ("Show 16 grouped events"), every member's ⋮ groups it again ("Group 16
 *  events"), one handler behind both. */
export function groupMenuWords(count: number, range: string | null) {
  const c = count.toLocaleString("en-US");
  const noun = count === 1 ? "event" : "events";
  return {
    show: { title: `Show ${c} grouped ${noun}`, subtitle: range ? `Expand the group, ${range}` : "Expand the group" },
    hide: { title: `Group ${c} ${noun}`, subtitle: range ? `Back to one row, ${range}` : "Back to one row" },
  };
}

/** The bracket frame around a group: a left border with bracket ends, in the
 *  muted border colour (`border-rb-300`, `dark:border-rb-500`). Closed it
 *  holds the group's row and its ⋮ offering "Show"; open, the members alone,
 *  the first on the row the summed nodes held, every member's ⋮ offering
 *  "Group 48 events". A `group-open` event on the frame opens it (the timeline's rewind).
 *
 *  Closed, the ends carry the range (ui-jobs 331 point 4): the highest
 *  number centred on the bracket's top edge, the lowest on its bottom edge,
 *  in the row number's style (`num-pill`) at the number column's x
 *  (`.group-range`). A group of one draws the top number alone. The top edge
 *  stands at the number column's height (`.group-bracket`) in both states,
 *  so on opening the first member's number takes the high number's place and
 *  the corner stays put; open, the members' numbers say the range and the
 *  ends draw none. The ends are drawing only: no `data-event-number` (the
 *  verifiers read that as a row), `aria-hidden` (the group's name and the ⋮
 *  words carry the range), no pointer. */
export function GroupFrame({
  open,
  show,
  hide,
  closed,
  members,
  membersLead,
  membersId,
  range,
}: {
  open: boolean;
  /** The group's event numbers, lowest and highest (either order). */
  range?: [number, number] | null;
  show: () => void;
  /** The members' ⋮ entry: the group's collapse. */
  hide: { title: string; subtitle: string; hide: () => void };
  closed: ReactNode;
  members: ReactNode;
  /** A line above the members that is not one of them (a served folder's
   *  stale line): drawn whatever the window holds. */
  membersLead?: ReactNode;
  membersId?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onOpen = () => showRef.current();
    frame.addEventListener("group-open", onOpen);
    return () => frame.removeEventListener("group-open", onOpen);
  }, []);
  const ends = range ? (range[0] <= range[1] ? range : [range[1], range[0]]) : null;
  return (
    <div
      ref={frameRef}
      data-group-frame={open ? "open" : "closed"}
      className="group-frame relative flex flex-col gap-2 rounded-xl"
    >
      <div
        aria-hidden
        data-group-bracket=""
        className="group-bracket pointer-events-none absolute bottom-0 left-[5px] z-20 w-3 rounded-l-xl border-y border-l border-rb-300 dark:border-rb-500"
      />
      {ends && !open && (
        <>
          <span aria-hidden data-group-range="hi" data-prov-exempt="" className="group-range group-range-hi">
            <span className="num-pill">{ends[1]}</span>
          </span>
          {ends[0] !== ends[1] && (
            <span aria-hidden data-group-range="lo" data-prov-exempt="" className="group-range group-range-lo">
              <span className="num-pill">{ends[0]}</span>
            </span>
          )}
        </>
      )}
      {open ? (
        <GroupHideContext.Provider value={hide}>
          <WindowedMembers id={membersId} members={members} lead={membersLead} />
        </GroupHideContext.Provider>
      ) : (
        // The dotted stretch below the group's node runs on through the
        // frame's foot to the next row's node (spine-line.tsx).
        <div className="pb-6">{closed}</div>
      )}
    </div>
  );
}
