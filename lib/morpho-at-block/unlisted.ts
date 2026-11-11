// Which Morpho Blue markets read on visit (Arc, Optimism) the markets list leaves out (the
// manager's ruling, 11 Nov 2026): those rails-server marks `unlisted`, a test token or no supply
// ever (api/src/services/morpho-at-block.ts unlistedReason). Each keeps its page; an idle market
// stays listed. Pure, with no `@/` import: scripts/test/morpho-at-block.test.mjs loads it.

import type { MorphoAtBlockMarket, MorphoAtBlockMarketsRead } from "./types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** The markets the list shows. */
export const listedMarkets = <M extends Pick<MorphoAtBlockMarket, "unlisted">>(ms: readonly M[]): M[] =>
  ms.filter((m) => !m.unlisted);

/** How many markets the list leaves out, by reason, and the idle market where there is one. */
export function atBlockUnlisted(r: Pick<MorphoAtBlockMarketsRead, "markets">): {
  test: number;
  never: number;
  idle: MorphoAtBlockMarket | null;
} {
  return {
    test: r.markets.filter((m) => m.unlisted === "test-token").length,
    never: r.markets.filter((m) => m.unlisted === "never-funded").length,
    idle: r.markets.find((m) => m.collateralToken === ZERO && m.oracle === ZERO && m.irm === ZERO) ?? null,
  };
}
