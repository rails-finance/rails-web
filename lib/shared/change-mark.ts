// A configuration change's mark on the timeline's node (anatomy M3.6): the
// family's glyph, the direction the setting moved and the warning tone, from
// the same generator as the change's words (lib/aave-v4/config-explain.ts,
// lib/shared/aave-reserve-config-explain.ts), drawn by the protocol-change node
// (components/shared/spine-column.tsx, `changeGlyph`). Types only.

/** The families: caps `gauge`; rates and fees the % mark (`rate`); collateral
 *  terms `shield`; liquidation settings `shield-alert`; freeze and pause
 *  `snowflake`, `pause` and `play`; switches `plug` and `unplug`; the price
 *  source `radio-tower`; a listing `list-plus`; eMode membership `layers`;
 *  anything else, and a row that only restates, `sliders`. */
export type ChangeGlyph =
  | "sliders"
  | "gauge"
  | "rate"
  | "shield"
  | "shield-alert"
  | "snowflake"
  | "pause"
  | "play"
  | "plug"
  | "unplug"
  | "radio-tower"
  | "list-plus"
  | "layers";

export interface ChangeMark {
  glyph: ChangeGlyph;
  /** Which way a cap, a rate or fee, or every moved collateral term went. */
  direction?: "up" | "down";
  /** A freeze, a pause, a line off or halted, borrowing off. */
  tone?: "caution";
}
