// The then/today press's logic and words (ui-jobs 761), for
// components/shared/price-basis.tsx. Dependency-free apart from type imports,
// so the unit test loads it.
import type { Provenance } from "../../components/shared/provenance";

export type PriceBasis = "event" | "today";

/** A chip's flip, as the press takes it: the symbol, and whether its figure
 *  is in another unit than the page's Prices chip. */
export interface Flippable {
  symbol: string;
  noToday?: boolean;
}

/** Whether any of a row's chips can stand at the latest block's price: a
 *  dollar chip whose symbol the page prices today. */
export function anyFlips(chips: Flippable[], prices: Record<string, unknown> | undefined): boolean {
  return !!prices && chips.some((c) => !c.noToday && prices[c.symbol.toLowerCase()] != null);
}

/** The press's name and tip, and whether it reads as pressed, at a basis. */
export function pressState(basis: PriceBasis): { label: string; pressed: boolean } {
  return basis === "today"
    ? { label: "Prices at the latest block. Press for the prices at this event.", pressed: true }
    : { label: "Prices at this event. Press for the prices at the latest block.", pressed: false };
}

/** A flipped chip's tip. */
export function todayChipTitle(symbol: string): string {
  return `${symbol} price at the latest block`;
}

/** A flipped chip's receipt: the read the page made, where it publishes one;
 *  otherwise the oracle's price at the latest block. */
export function todayChipProv(symbol: string, info: Provenance | undefined): Provenance {
  return info ?? { kind: "chain-derived", summary: `${symbol} price at the latest block, from its oracle.` };
}
