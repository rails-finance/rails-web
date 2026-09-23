"use client";

// Opening a served folder — the read, the session cache, and the one place a
// permalink resolves.
// ----------------------------------------------------------------------------
// A folder row carries its members' aggregate and never its members
// (decision 0019's evening amendment, rule 2), so opening one is a fetch. This
// module is the shared plumbing for it: one provider mounted by
// `ChainTruthTimeline`, one in-memory map for the session, and two entry
// points — of which only one is durable.
//
//   • `open(folder)` — the reader clicked a folder. Asks by the folder's
//     RESPONSE-SCOPED id, which is fine, because the page holding the id is
//     the page that asked for it.
//   • `resolveEventKey(eventKey)` — the permalink path. Asks by the EVENT KEY,
//     a chain coordinate, and the server names which folder of the CURRENT
//     answer holds it and returns the members in the same breath. A share
//     href, an `?at=` value and an `/event/<id>` segment carry this and never
//     a folder id (`lib/shared/timeline-folder.ts`'s header says why).
//
// NOTHING IS PERSISTED. The map lives for the session and is keyed on the
// page's own TIP as well as on the folder id: the index gap-fills backwards,
// so an event at the head or a backfill below it moves the chunk boundaries
// the ids refer to, and a cached member list would then belong to a grouping
// the server would no longer compute. A tip change drops the map whole. There
// is no localStorage — a reload refetches, which is the correct cost for a
// coordinate that can rot.
//
// A COLLAPSE MID-FLIGHT DOES NOT ABORT. The read completes into the map and
// the next open is instant; a slow read that lands into the cache is the point
// of the design, not an accident of it. Nothing here imposes a timeout of its
// own either — folders are computed on demand and never materialised, so a
// first open on a cold position pays for the grouping pass and is expected to.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { FolderResponseId, ServedFolder } from "@/lib/shared/timeline-folder";
import { FolderRefusal, type FolderMembersResult } from "@/lib/api/fetch-timeline-folder";

/** One family's own read. The provider stays family-agnostic; each page passes
 *  this from the same module its `readTimeline` lives in. */
export type FolderMembersReader = (ask: { event?: string; folder?: string }) => Promise<FolderMembersResult>;

/** What the page knows about one folder's members. `pending` and `error` are
 *  states a card must draw, not defensive decoration: the read is genuinely
 *  slow on a cold position and the route genuinely refuses a key it cannot
 *  resolve. */
export interface FolderMembersState {
  status: "pending" | "ready" | "error";
  events?: BaseActivityEvent[];
  /** The folder as the ANSWER states it — not necessarily the one the page is
   *  holding. A tip change re-groups the position, so the count and the
   *  ordinals can differ, and that difference is what `stale` reports. */
  folder?: ServedFolder;
  /** True when the answer's folder is not the folder the page drew — the
   *  members are still true rows and are still shown, with one line above
   *  them saying the position has moved. */
  stale?: boolean;
  /** The route's own sentence for a refusal, or a plain transport failure. */
  error?: string;
}

interface FolderMembersApi {
  /** The state of one folder, by the id the page is holding. */
  stateOf: (id: FolderResponseId) => FolderMembersState | undefined;
  /** Open a folder the reader clicked. Idempotent — a second call while the
   *  first is in flight, or after it landed, does nothing. */
  open: (folder: ServedFolder) => void;
  /** The permalink path: resolve an event key to the folder of the CURRENT
   *  answer that holds it, and fetch its members. Resolves to the folder's own
   *  response-scoped id once the members are in hand, or to null when the
   *  route refused (the event is served as its own row, sits below the window,
   *  or the position holds nothing). */
  resolveEventKey: (eventKey: string) => Promise<FolderResponseId | null>;
  /** True on a page that reads folders off the wire at all. */
  enabled: boolean;
}

const NO_FOLDERS: FolderMembersApi = {
  stateOf: () => undefined,
  open: () => {},
  resolveEventKey: async () => null,
  enabled: false,
};

const FolderMembersContext = createContext<FolderMembersApi>(NO_FOLDERS);

export function useFolderMembers(): FolderMembersApi {
  return useContext(FolderMembersContext);
}

/** Did the answer's folder come from the same grouping the page drew? Compared
 *  on the three facts a re-grouping moves — the id, the member count and the
 *  first ordinal — rather than on a tip token, which this contract does not
 *  carry on the members route. */
function sameGrouping(drawn: ServedFolder, answered: ServedFolder): boolean {
  return (
    drawn.responseId === answered.responseId &&
    drawn.count === answered.count &&
    drawn.ordinalFirst === answered.ordinalFirst
  );
}

export function FolderMembersProvider({
  readMembers,
  tip,
  children,
}: {
  /** The family's own read, or undefined on a page that serves no folders. */
  readMembers?: FolderMembersReader;
  /** The page's own answer identity. Any change drops the whole map — see the
   *  header on why a cached member list cannot outlive the grouping it came
   *  from. */
  tip: string;
  children: ReactNode;
}) {
  // The map is a REF so an in-flight read is never restarted by an unrelated
  // render; `version` is what tells consumers the map moved.
  const [version, bump] = useState(0);
  const byId = useRef(new Map<string, FolderMembersState>());
  const tipRef = useRef(tip);
  if (tipRef.current !== tip) {
    tipRef.current = tip;
    byId.current = new Map();
  }

  const set = useCallback((id: string, state: FolderMembersState) => {
    byId.current.set(id, state);
    bump((v) => v + 1);
  }, []);

  // ONE READ AT A TIME, and the reason is not politeness.
  //
  // A date filter opens every folder it leaves standing at once, and a reader
  // can open several in quick succession. Folders are computed on demand and
  // cached on the position's tip, so the FIRST read pays for the grouping
  // pass and the rest are map lookups on the server — but only if the rest
  // arrive after it. Simultaneous cold requests would each start their own
  // pass instead, and on the deepest position that pass reads 25,000 events.
  // So the reads queue: the first pays, the queue behind it is answered from
  // the cache it filled. Nothing opens every folder in view (decision 0021).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(work, work);
    // The chain must never reject, or every read behind a failure is skipped.
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const run = useCallback(
    async (id: string, drawn: ServedFolder | null, ask: { event?: string; folder?: string }) => {
      if (!readMembers) return null;
      set(id, { status: "pending" });
      try {
        const answer = await enqueue(() => readMembers(ask));
        set(id, {
          status: "ready",
          events: answer.events,
          folder: answer.folder,
          stale: drawn ? !sameGrouping(drawn, answer.folder) : false,
        });
        return answer;
      } catch (err) {
        // A refusal carries the route's own sentence; anything else is a
        // transport failure and gets one of ours. Either way the card states
        // it — never an empty expanded area.
        const message =
          err instanceof FolderRefusal
            ? err.message
            : "Rails could not read this folder's events just now. Reloading the page will ask again.";
        set(id, { status: "error", error: message });
        return null;
      }
    },
    [readMembers, set, enqueue],
  );

  const api = useMemo<FolderMembersApi>(() => {
    if (!readMembers) return NO_FOLDERS;
    return {
      enabled: true,
      stateOf: (id) => byId.current.get(id),
      open: (folder) => {
        if (byId.current.has(folder.responseId)) return;
        void run(folder.responseId, folder, { folder: folder.responseId });
      },
      resolveEventKey: async (eventKey) => {
        // Keyed on the EVENT while the answer is out, because the folder it
        // belongs to is precisely what is not known yet; re-keyed onto the
        // folder's own id once it is, so a later click on that folder reads
        // the same cached answer.
        const answer = await run(`event:${eventKey}`, null, { event: eventKey });
        if (!answer) return null;
        byId.current.delete(`event:${eventKey}`);
        set(answer.folder.responseId, {
          status: "ready",
          events: answer.events,
          folder: answer.folder,
          stale: false,
        });
        return answer.folder.responseId;
      },
    };
    // `version` is in the deps deliberately: a new api identity is what makes
    // an open folder redraw when its members land.
  }, [readMembers, run, set, tip, version]);

  return <FolderMembersContext.Provider value={api}>{children}</FolderMembersContext.Provider>;
}
