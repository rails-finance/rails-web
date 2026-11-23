// Status as one choice of three (ui-jobs 805): Open, Closed or All, resting on
// Open. A listing's Status dimension is single-choice over these values and
// draws no pill; "Closed" takes in every way a position ended, and "ended by
// liquidation" is a switch beside "Liquidated before".
//
// The URL carries one value (`?status=closed`, `?status=all`; Open while the
// listing rests on it writes none). Links and saved listings written before
// 805 carry the old list (`?status=open,closed,liquidated`), which
// `readStatusParam` maps onto the choice and the switch.
//
// Pure, with no imports, so the unit tests read it
// (scripts/test/status-choice.test.mjs).

export type StatusChoice = "open" | "closed" | "all";

/** The three segments, in the order the panel draws them. All is marked
 *  `every`: a listing resting on it draws no Status pill. */
export const STATUS_CHOICE_OPTIONS: { value: StatusChoice; label: string; every?: boolean }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All", every: true },
];

/** The switch's one value, in the filters and in the URL (`?ended=liquidated`). */
export const ENDED_BY_LIQUIDATION = "liquidated";

export interface StatusRead {
  /** Null where the param names no status: the listing's resting choice. */
  choice: StatusChoice | null;
  /** The old list named liquidated positions alone. */
  endedByLiquidation: boolean;
}

/** A `status` param's values as the choice. One of the three values is that
 *  choice. An old list of lifecycle buckets (open, closed, liquidated) maps to
 *  the choice that shows at least what it showed: both sides of the lifecycle
 *  are All, the closed side is Closed, and liquidated alone is Closed with the
 *  switch on. A token that is none of these is ignored. */
export function readStatusParam(values: string[]): StatusRead {
  const v = new Set(values.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (v.has("all")) return { choice: "all", endedByLiquidation: false };
  const open = v.has("open");
  const closed = v.has("closed");
  const liquidated = v.has("liquidated");
  if (open && (closed || liquidated)) return { choice: "all", endedByLiquidation: false };
  if (open) return { choice: "open", endedByLiquidation: false };
  if (closed) return { choice: "closed", endedByLiquidation: false };
  if (liquidated) return { choice: "closed", endedByLiquidation: true };
  return { choice: null, endedByLiquidation: false };
}

/** A switch that narrows one choice: "Closed by liquidation" narrows Closed. */
export interface StatusSwitch {
  /** The switch's one value in the filters. */
  value: string;
  /** The choice it narrows; away from it the switch is off. */
  narrows: StatusChoice;
}

/** The switch most families carry beside Status. */
export const CLOSED_BY_LIQUIDATION: StatusSwitch = { value: ENDED_BY_LIQUIDATION, narrows: "closed" };

/** A family's own reading of a `status` param: the choice, and whether an old
 *  list turned the switch on. */
export interface StatusIntent {
  choice: StatusChoice | null;
  switchOn: boolean;
}

export interface StatusSet {
  /** The choice as stored: [] where it is the listing's resting choice. */
  status: StatusChoice[];
  /** The switch's values: kept only with the choice it narrows. */
  ended: string[];
}

/** A Status dimension's `set` (ui-jobs 805): the new choice, or an old link's
 *  list, written back as the stored choice and the switch. `values` is read by
 *  `readStatusParam` unless the family passes its own reading. `resting` is the
 *  listing's resting choice and `ended` the switch's values as they stand. An
 *  old list that turns the switch on sets it; otherwise it keeps its values
 *  with the choice it narrows and clears away from it. */
export function setStatusChoice(
  values: string[] | StatusIntent,
  resting: StatusChoice,
  ended: string[],
  sw: StatusSwitch = CLOSED_BY_LIQUIDATION,
): StatusSet {
  const read = Array.isArray(values) ? readStatusParam(values) : null;
  const intent = read ? { choice: read.choice, switchOn: read.endedByLiquidation } : (values as StatusIntent);
  const choice = intent.choice ?? resting;
  return {
    status: choice === resting ? [] : [choice],
    ended: choice !== sw.narrows ? [] : intent.switchOn ? [sw.value] : ended,
  };
}

/** The lifecycle buckets an API whose rows carry one of open, closed or
 *  liquidated is asked for; undefined for no status filter. */
export function statusBuckets(choice: StatusChoice, endedByLiquidation: boolean): string[] | undefined {
  if (choice === "all") return undefined;
  if (choice === "open") return ["open"];
  return endedByLiquidation ? ["liquidated"] : ["closed", "liquidated"];
}

/** The `status` value a link writes to list every status: "all" where the
 *  listing's Status is the choice of three, else the old list of its options. */
export function everyStatusParam(optionValues: string[]): string {
  return optionValues.includes("all") ? "all" : optionValues.join(",");
}

/** The count line's noun for a choice: "open positions", "closed positions",
 *  and the plain noun for All. */
export function statusNoun(choice: StatusChoice, noun: string): string {
  return choice === "all" ? noun : `${choice} ${noun}`;
}
