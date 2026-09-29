// Wire shapes of the two MakerDAO history reads (lib/sources/chain/makerdao-history.ts),
// kept apart from the reader so client code can import them without the
// server-only RPC module.

/** An ilk's risk state at the end of one block. */
export interface MakerIlkAt {
  block: number;
  /** The OSM price the Vat judged vaults against: Vat spot × par × Spotter mat. */
  priceUsd: number | null;
  /** The minimum collateral ratio as a multiplier (1.45 = 145%). */
  mat: number | null;
  /** The ilk's minimum debt per vault, DAI. */
  dustDai: number | null;
}

export interface MakerIlkAtResponse {
  ilk: string;
  reads: Record<string, MakerIlkAt>;
}

/** One purchase from a Clipper auction. */
export interface MakerAuctionTake {
  block: number;
  txHash: string;
  /** DAI paid for this purchase (Take.owe, rad → decimal). */
  oweDai: string;
  /** Collateral bought (lot before − lot after), decimal. */
  soldInk: string;
  /** Price per unit of collateral the buyer paid, DAI. */
  priceDai: number;
}

/** How a Clipper auction started by a Dog.bark on this vault ran. Amounts are
 *  exact decimal strings (the chain's integers scaled). */
export interface MakerAuctionOutcome {
  kind: "clipper";
  txHash: string;
  urn: string;
  auctionId: string;
  clip: string;
  /** The Bark block. */
  block: number;
  /** Collateral seized into the auction (Bark.ink). */
  lot: string;
  /** The debt the bark cleared from the vault (Bark.due). */
  dueDai: string;
  /** What the auction had to raise: debt × the penalty factor (Kick.tab). */
  tabDai: string;
  /** tab − due: the liquidation penalty, in DAI. */
  penaltyDai: string;
  /** tab ÷ due (1.13 = a 13% penalty). */
  chop: number;
  /** The minimum collateral ratio at the bark block (Spotter mat), a multiplier. */
  mat: number | null;
  takes: MakerAuctionTake[];
  /** Σ Take.owe. */
  raisedDai: string;
  /** Collateral sold across every take. */
  soldInk: string;
  /** Collateral handed back to the vault when the debt and penalty were covered
   *  (the last Take's remaining lot, sent to the urn by vat.flux). "0" when the
   *  whole lot sold. */
  leftoverInk: string;
  /** Debt left uncovered when the lot ran out first (the last Take's tab). */
  shortfallDai: string;
  /** True when a take closed the auction (tab or lot reached zero). */
  settled: boolean;
  /** The block and time of the take that closed it. */
  settledBlock: number | null;
  settledAt: number | null;
}

/** A liquidation with no Dog.Bark in its transaction: the older Cat/Flipper
 *  auctions, which this read does not cover. */
export interface MakerAuctionNotRead {
  kind: "not-read";
  txHash: string;
  urn: string;
}

export type MakerAuctionRead = MakerAuctionOutcome | MakerAuctionNotRead;
