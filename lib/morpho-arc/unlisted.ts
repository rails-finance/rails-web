// Which of Arc's Morpho Blue markets the markets list leaves out (the manager's ruling, 11 Nov
// 2026): those rails-server marks `unlisted`, a test token or no supply ever
// (api/src/services/morpho-arc-at-block.ts unlistedReason). Each keeps its page; the idle market
// stays listed. Pure, with no `@/` import: scripts/test/morpho-arc.test.mjs loads it.

import type { ArcMorphoMarket, ArcMorphoMarketsRead } from "./types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** The markets the list shows. */
export const listedMarkets = <M extends Pick<ArcMorphoMarket, "unlisted">>(ms: readonly M[]): M[] =>
  ms.filter((m) => !m.unlisted);

/** How many markets the list leaves out, by reason, and the idle market where there is one. */
export function arcUnlisted(r: Pick<ArcMorphoMarketsRead, "markets">): {
  test: number;
  never: number;
  idle: ArcMorphoMarket | null;
} {
  return {
    test: r.markets.filter((m) => m.unlisted === "test-token").length,
    never: r.markets.filter((m) => m.unlisted === "never-funded").length,
    idle: r.markets.find((m) => m.collateralToken === ZERO && m.oracle === ZERO && m.irm === ZERO) ?? null,
  };
}
