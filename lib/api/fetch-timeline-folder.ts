// ============================================================================
// FETCH ONE TIMELINE FOLDER'S MEMBERS
// ============================================================================
//
// The read behind opening a folder on a grouped timeline
// (`/api/<family>/timeline?group=1`). Family-agnostic: every family that
// serves folders answers on the same two keys at `<path>`, and returns its
// members in its own event shape, so this fetcher takes the path and hands
// back whatever the family's own proxy transformed.
//
// TWO ENTRY POINTS, AND ONLY ONE OF THEM IS DURABLE.
//   • `folder` — the response-scoped id, for the folder a reader just clicked.
//     Fine, because the page holding the id is the page that asked for it.
//   • `event` — an event KEY, a chain coordinate. This is the permalink path:
//     the server names which folder of the CURRENT answer holds that event and
//     returns its members in the same breath. A share href, an `?at=` value
//     and an `/event/<id>` segment carry this and never a folder id.
// See lib/shared/timeline-folder.ts's header for why the id cannot be durable.
//
// A REFUSAL IS A STATED FACT. The route answers a key it cannot resolve with a
// code and a sentence, never an empty list — an empty list would read as "this
// folder holds nothing", which is never true. The four codes are three
// different situations plus a position with no events at all, and the caller
// draws the sentence the route wrote rather than inventing one.
//
// THE READ MAY BE GENUINELY SLOW, by design: folders are computed on demand
// and cached on the position's tip, never materialised (decision 0019's
// evening amendment, rule 3), so a first open on a cold position pays for the
// grouping pass. Nothing here imposes a timeout shorter than the route's own.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

/** The four refusals rails-server names, each a different fact. */
export type FolderRefusalCode = "UNKNOWN_FOLDER" | "NOT_IN_A_FOLDER" | "BELOW_THE_WINDOW" | "NO_EVENTS";

/** Thrown for a stated refusal, so a caller can draw the route's own sentence
 *  rather than a generic failure. A transport failure is a plain Error. */
export class FolderRefusal extends Error {
  constructor(
    readonly code: FolderRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "FolderRefusal";
  }
}

export interface FolderMembersResult {
  /** The folder as the answer states it, which is not necessarily the folder
   *  the page is holding: a tip change re-groups the position, so the ordinals
   *  and the count can differ. The caller compares and says so. */
  folder: ServedFolder;
  /** The members in the family's own event shape, ascending chain order —
   *  identical to what `/timeline` would have served for the same rows, so the
   *  page's own `renderCard` draws them with no second mapping. */
  events: BaseActivityEvent[];
}

export interface FetchFolderMembersParams {
  /** The family's own proxy route, e.g. `/api/spark/timeline/folder`. */
  path: string;
  /** Everything that names the SUBJECT: the wallet, and a market where a
   *  position is per (wallet, market). */
  params: Record<string, string>;
  /** The durable form — an event key. Exactly one of this and `folder`. */
  event?: string;
  /** The response-scoped form. Exactly one of this and `event`. */
  folder?: string;
  signal?: AbortSignal;
}

export async function fetchTimelineFolderMembers(p: FetchFolderMembersParams): Promise<FolderMembersResult> {
  const qs = new URLSearchParams(p.params);
  if (p.event) qs.set("event", p.event);
  if (p.folder) qs.set("folder", p.folder);
  const res = await fetch(`${p.path}?${qs.toString()}`, { cache: "no-store", signal: p.signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: FolderRefusalCode; message?: string } | null;
    if (body?.code && body.message) throw new FolderRefusal(body.code, body.message);
    throw new Error(`fetchTimelineFolderMembers failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<{ events: BaseActivityEvent[]; folder: ServedFolder }>;
  return fromTimelineWire<{ events: BaseActivityEvent[]; folder: ServedFolder }>(json);
}
