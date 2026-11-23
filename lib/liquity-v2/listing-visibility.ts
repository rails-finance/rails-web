// Visibility resolution for the Liquity V2 listing, and for the forks' Trove listings
// (Asymmetry, Ebisu, Basedollar), which take the same rule.
//
// The resting view is the MIDDLE PATH (Miles, 2026-09-10, now the roster rule):
// the bare directory shows the troves that are still open; a search that names a
// holder (address or ENS) or a trove id shows every status. The two views answer
// different questions. Someone browsing /ethereum/liquity-v2 is looking at the
// protocol as it stands, and the closed and liquidated troves — several times
// the number still open — bury the live ones. Someone who types their own
// address is asking about positions they know about, and the closed one is
// what they came for — filtering it away answers "nothing here", which is not
// true.
//
// Status is ONE CHOICE of three (ui-jobs 805; lib/shared/status-choice.ts): Open,
// Closed or All, one `status` URL value.
//   - Open takes in Dormant: a trove redeemed below the minimum debt, still open
//     and still the holder's. The Dormant switch (`open=dormant`) narrows Open to
//     those troves.
//   - Closed takes in Liquidated. The "Closed by liquidation" switch
//     (`ended=liquidated`) narrows Closed to the liquidated troves.
// The troves route takes active, zombie, open (active + zombie), closed,
// liquidated and all; All sends no status.
//
// `status=active` is a link-only value (the branches page's redemption-queue
// link): Open with Dormant left out. It sends `active`, its chip reads "Status
// Open", the panel offers no segment for it, and picking any Status choice
// drops it.
//
// `status` on the filter object carries RAW user intent: [] is "no opinion" and
// resolves here at read time, one value is an explicit choice. The default is
// never written into the filter object, so an identity search relaxes the view
// without the reader touching Status, and the bare directory URL stays clean.
//
// Relative imports of modules with no imports of their own, so the unit test
// reads this file (scripts/test/liquity-v2-status-choice.test.mjs).

import { namesIdentity } from "./search";
import {
  ENDED_BY_LIQUIDATION,
  readStatusParam,
  setStatusChoice,
  statusBuckets,
  statusNoun,
  type StatusChoice,
} from "../shared/status-choice";

/** The Dormant switch's one value, in the filters and in the URL (`?open=dormant`). */
export const DORMANT = "dormant";
/** The Dormant switch's URL param. */
export const DORMANT_PARAM = "open";

/** The link-only `status` value: Open with Dormant left out. */
export const OPEN_ACTIVE = "active";

/** A trove's place in the lifecycle, as the listings bucket it. */
export type TroveLifecycle = "open" | "zombie" | "closed" | "liquidated";

/** Just the filter fields visibility depends on — structural, so each listing's
 *  filters satisfy it without an import cycle. */
export interface TroveVisibilityInput {
  status?: string[];
  dormant?: string[];
  ended?: string[];
  q?: string;
}

export interface TroveStatusRead {
  choice: StatusChoice | null;
  endedByLiquidation: boolean;
  dormantOnly: boolean;
  /** `status=active` alone: Open with Dormant left out. */
  activeOnly: boolean;
}

/** A `status` param's values as the choice and the two switches. The three
 *  choice values read as themselves, and `active` alone is the link-only Open
 *  without Dormant. An old list of buckets maps as follows: any open bucket
 *  (active, zombie, open) with any closed one (closed, liquidated) is All;
 *  zombie alone is Open with Dormant; any other open list (open, active +
 *  zombie) is Open; liquidated alone is Closed with the switch; closed is
 *  Closed. */
export function readTroveStatusParam(values: string[]): TroveStatusRead {
  const v = new Set(values.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const openSide = v.has("active") || v.has("zombie") || v.has("open");
  const dormantOnly = v.has("zombie") && !v.has("active") && !v.has("open");
  const activeOnly = v.size === 1 && v.has(OPEN_ACTIVE);
  const closedSide = v.has("closed") || v.has("liquidated");
  const none = { endedByLiquidation: false, dormantOnly: false, activeOnly: false };
  if (v.has("all") || (openSide && closedSide)) return { ...none, choice: "all" };
  if (openSide) return { ...none, choice: "open", dormantOnly, activeOnly };
  return { ...none, ...readStatusParam([...v]) };
}

/** The contextual default: the open troves while the search box names no
 *  identity, every status once it does. */
export function defaultStatusChoice(f: TroveVisibilityInput): StatusChoice {
  return namesIdentity(f.q) ? "all" : "open";
}

/** The choice in effect: an explicit one wins; none resolves to the contextual default. */
export function statusChoice(f: TroveVisibilityInput): StatusChoice {
  return readTroveStatusParam(f.status ?? []).choice ?? defaultStatusChoice(f);
}

/** The link-only `status=active`: Open with Dormant left out. */
export function activeOnly(f: TroveVisibilityInput): boolean {
  return readTroveStatusParam(f.status ?? []).activeOnly;
}

/** The Status dimension's value: the choice, or the link-only `active`. */
export function troveStatusValue(f: TroveVisibilityInput): string {
  return activeOnly(f) ? OPEN_ACTIVE : statusChoice(f);
}

/** The Dormant switch, which narrows Open alone. */
export function dormantOnly(f: TroveVisibilityInput): boolean {
  return statusChoice(f) === "open" && !activeOnly(f) && (f.dormant ?? []).includes(DORMANT);
}

/** The "Closed by liquidation" switch, which narrows Closed alone. */
export function endedByLiquidation(f: TroveVisibilityInput): boolean {
  return statusChoice(f) === "closed" && (f.ended ?? []).includes(ENDED_BY_LIQUIDATION);
}

/** The filter fields a Status edit writes: the choice (none where it is the
 *  default; the link-only `active` as itself) and the two switches, each kept
 *  only beside its own choice. Any choice drops `active`. */
export function setTroveStatus<F extends TroveVisibilityInput>(f: F, values: string[]): F {
  const read = readTroveStatusParam(values);
  const resting = defaultStatusChoice(f);
  const { status, ended } = setStatusChoice(
    { choice: read.choice, switchOn: read.endedByLiquidation },
    resting,
    f.ended ?? [],
  );
  const dormant = setStatusChoice({ choice: read.choice, switchOn: read.dormantOnly }, resting, f.dormant ?? [], {
    value: DORMANT,
    narrows: "open",
  }).ended;
  if (read.activeOnly) return { ...f, status: [OPEN_ACTIVE], dormant: [], ended };
  return { ...f, status, dormant, ended };
}

/** The filter fields the Dormant switch writes. Turning it on drops the
 *  link-only `active`, which leaves Dormant out. */
export function setTroveDormant<F extends TroveVisibilityInput>(f: F, values: string[]): F {
  if (values.length === 0 || !activeOnly(f)) return { ...f, dormant: values };
  return { ...f, status: defaultStatusChoice(f) === "open" ? [] : ["open"], dormant: values };
}

/** The buckets the troves route is asked for; undefined for no status filter. */
export function troveStatusBuckets(f: TroveVisibilityInput): string[] | undefined {
  const choice = statusChoice(f);
  if (choice === "open") return dormantOnly(f) ? ["zombie"] : activeOnly(f) ? [OPEN_ACTIVE] : ["open"];
  return statusBuckets(choice, endedByLiquidation(f));
}

/** Whether a trove at `lifecycle` passes one of the three dimensions (`status`,
 *  `dormant`, `ended`) at its values: the in-memory counterpart of
 *  troveStatusBuckets, for the forks' listings. A switch's values are empty
 *  away from its choice, so the listing skips it there. */
export function troveDimensionAdmits(id: string, values: string[], lifecycle: TroveLifecycle): boolean {
  if (id === "dormant") return lifecycle === "zombie";
  if (id === "ended") return lifecycle === "liquidated";
  if (values[0] === OPEN_ACTIVE) return lifecycle === "open";
  if (values[0] === "open") return lifecycle === "open" || lifecycle === "zombie";
  if (values[0] === "closed") return lifecycle === "closed" || lifecycle === "liquidated";
  return true;
}

/** The count line's noun names what is shown ("open Troves", "closed Troves",
 *  "Troves" for All). */
export function troveCountLine(f: TroveVisibilityInput, noun = "Troves"): { noun: string } {
  return { noun: statusNoun(statusChoice(f), noun) };
}
