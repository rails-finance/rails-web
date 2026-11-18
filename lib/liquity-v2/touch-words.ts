// The read-more on the word "touch" (rails-ops standards/lexicon.md, "Touch"),
// worded for a Stability Pool deposit. One string, so the deposit page, its
// event page and any Trove page that wants it say the same thing.

export const DEPOSIT_TOUCH_TIP =
  "A touch is any transaction that writes the deposit on chain: a deposit, top-up, withdrawal or claim by the depositor. A liquidation changes every deposit's value without writing it, so figures read as of the last touch.";
