// The "Read on visit" tier's words (rails-ops decision 0061): its name, its
// line, and what waits on indexing. An explorer joins with `readTier: "visit"`
// on its roster entry (lib/shared/protocols.ts); `ReadTierTag` draws the name.

export const READ_TIER = {
  name: "Read on visit",
  line: "Figures are read from the chain when you open the page.",
  waits: "History, listings and holder counts arrive when Rails indexes this protocol.",
} as const;
