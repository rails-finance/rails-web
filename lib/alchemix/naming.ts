// How an Alchemix position is named, everywhere it is named.
// ----------------------------------------------------------------------------
// Settled 2026-09-26 (Miles, rails-ops TO-DO-alchemix-scoping item 4): the
// debt token's symbol, the word "position", and the token id, as in "alUSD
// position 1221". The collateral cannot name it, because mixUSDC is the vault
// share on two lines, while the synthetics are distinct; and an id runs per
// line, so the symbol is what makes a row unambiguous.
//
// A Transmuter position takes the same grammar with its type between the
// symbol and the noun, "alUSD Transmuter position 12": the stake is the same
// synthetic, and without the type word an id that exists on both contracts of
// a line would name two different positions.
//
// A V2 position carries its version between the symbol and the noun, "alUSD
// V2 position 0x8eb2…7d4c": V2 closed on 2026-04-02, its positions are wallet
// accounts rather than NFTs, and the same wallet often holds a V3 position on
// the same synthetic, so without the version the two would read as one. The
// account stands where the id stands, shortened; the page's own address pill
// carries it whole. A V3 position is named without a version: V3 is the one
// that is live, and the V2 name is the one that has to say it is not.
//
// Titles and share cards compose `<market> <noun> <id>` through the house
// helpers, which capitalise the noun; `alchemixMarketWord` is the market
// segment those take, so the two forms can never disagree about the words.

export type AlchemixPositionKind = "alchemist" | "transmuter" | "v2";

/** The market segment of a composed title: the symbol, and the type word for
 *  a Transmuter position or the version for a V2 one. */
export function alchemixMarketWord(syntheticSymbol: string, kind: AlchemixPositionKind = "alchemist"): string {
  if (kind === "transmuter") return `${syntheticSymbol} Transmuter`;
  if (kind === "v2") return `${syntheticSymbol} V2`;
  return syntheticSymbol;
}

/** A V2 account, shortened for a name: "0x8eb2…7d4c". */
export function alchemixV2AccountLabel(account: string): string {
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}

/** "alUSD V2 position 0x8eb2…7d4c". */
export function alchemixV2PositionName(syntheticSymbol: string, account: string): string {
  return alchemixPositionName(syntheticSymbol, alchemixV2AccountLabel(account), "v2");
}

/** "alUSD position 1221", "alUSD Transmuter position 12". */
export function alchemixPositionName(
  syntheticSymbol: string,
  id: string,
  kind: AlchemixPositionKind = "alchemist",
): string {
  return `${alchemixMarketWord(syntheticSymbol, kind)} position ${id}`;
}
