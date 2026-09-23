// Where the debt stands against a capacity line, as the Compound-family risk
// strips and Explanations state it: "61.2% of the liquidation line".
//
// A share is a sentence only while it reads as one. When the collateral left
// is dust against the debt — a position liquidated down to a few cents of
// capacity with millions still owed — the same division prints
// "19070621780048.1%", fourteen digits that say nothing a reader can hold.
// Past a ceiling the figure becomes a stated floor instead: "over 1,000× the
// liquidation line". Same two chain-read values, same division, same receipt;
// only the rendering changes, and the sentence switches from a share ("of
// the …") to a multiple ("… the …"). The ceiling is where a percentage stops
// reading as one, not a risk threshold — a debt at 999× its line is no safer.

export const CAPACITY_SHARE_CEILING = 1_000;

export interface CapacityShare {
  /** "61.2%" below the ceiling; "over 1,000×" past it. */
  text: string;
  /** True past the ceiling — the sentence takes "the line", not "of the line". */
  beyond: boolean;
  /** The connective the sentence needs after the figure. */
  ofThe: "of the" | "the";
}

export function capacityShare(debt: number, capacity: number): CapacityShare {
  const ratio = debt / capacity;
  if (ratio > CAPACITY_SHARE_CEILING) {
    return { text: `over ${CAPACITY_SHARE_CEILING.toLocaleString("en-US")}×`, beyond: true, ofThe: "the" };
  }
  return { text: `${(ratio * 100).toFixed(1)}%`, beyond: false, ofThe: "of the" };
}
