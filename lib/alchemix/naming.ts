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
// Titles and share cards compose `<market> <noun> <id>` through the house
// helpers, which capitalise the noun; `alchemixMarketWord` is the market
// segment those take, so the two forms can never disagree about the words.

export type AlchemixPositionKind = "alchemist" | "transmuter";

/** The market segment of a composed title: the symbol, and the type word for
 *  a Transmuter position. */
export function alchemixMarketWord(syntheticSymbol: string, kind: AlchemixPositionKind = "alchemist"): string {
  return kind === "transmuter" ? `${syntheticSymbol} Transmuter` : syntheticSymbol;
}

/** "alUSD position 1221", "alUSD Transmuter position 12". */
export function alchemixPositionName(
  syntheticSymbol: string,
  id: string,
  kind: AlchemixPositionKind = "alchemist",
): string {
  return `${alchemixMarketWord(syntheticSymbol, kind)} position ${id}`;
}
