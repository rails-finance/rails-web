// The Pendle rings scripts/test/kind-rings.test.mjs renders, whose markup was
// captured from origin/preview before ui-jobs 871 added the Polaris kinds
// (scripts/fixtures/kind-rings/expected.json): the market token icon at each
// size either side of the 20px rule, a Pendle PT through the shared token
// chip, and a spine row wearing each ring.
const SUSDE = { symbol: "sUSDe", address: "0x9d39a5de30e57443bff2a8307a4256c8797a3497" };

export const PENDLE_ICONS = Object.fromEntries(
  ["pt", "yt", "lp", "sy"].flatMap((kind) =>
    [16, 20, 28, 32].map((size) => [`pendle-${kind}-${size}`, { kind, tokens: { yieldToken: SUSDE }, size }]),
  ),
);

export const PT_CHIPS = Object.fromEntries(
  [16, 20, 28].map((size) => [
    `pt-chip-${size}`,
    {
      symbol: "PT-syrupUSDC-28MAY2026",
      address: "0x00026e3311937bad48d9ab894c42134306e1698d",
      size,
      filterable: false,
    },
  ]),
);

export const SPINES = {
  "spine-pt": {
    isLast: false,
    tokens: [{ symbol: "PT-sUSDE-27MAR2025", iconSymbol: "sUSDe", direction: "right", value: 1200, ring: "pt" }],
  },
  "spine-yt": {
    isLast: true,
    tokens: [{ symbol: "YT-sUSDE-27MAR2025", iconSymbol: "sUSDe", direction: "left", value: 300, ring: "yt" }],
  },
};
