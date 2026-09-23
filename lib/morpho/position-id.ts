// A Morpho position is keyed by (market, user), and the URL carries both in one
// segment: `<marketId>-<user>`. Split on the FIRST hyphen — a market id is a
// 32-byte hash and carries none, so everything after it is the account.
//
// Its own module, not the page-data one: the server loader and the client view
// both split, and the loader is SERVER-ONLY (it reads request headers). A shared
// pure helper must not drag that into the browser bundle.

export function splitMorphoPositionId(positionId: string): { market: string; user: string } {
  const i = positionId.indexOf("-");
  return i >= 0 ? { market: positionId.slice(0, i), user: positionId.slice(i + 1) } : { market: positionId, user: "" };
}
