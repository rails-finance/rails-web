/** The two adverse tones (rails-ops color-grammar.md §5): caution for a change
 *  to the owner's position the owner did not make (a redemption, a force
 *  repay, a tick rebalance), critical for a liquidation. The text takes
 *  `text-tone-caution` / `text-tone-critical`, the glyphs `var(--tone-caution)`
 *  / `var(--tone-critical)` (app/globals.css), light and dark. */
export type Tone = "caution" | "critical";
