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

/** The three segments, in the order the panel draws them. */
export const STATUS_CHOICE_OPTIONS: { value: StatusChoice; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
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
