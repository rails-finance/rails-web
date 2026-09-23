// The Liquity-family position card's contract — one view shape every Liquity
// V2-architecture explorer (Liquity V2 itself, Asymmetry, Ebisu, Basedollar)
// adapts its own summary row into, and one normalised live-read shape the
// detail page overrides it with. The card (liquity-position-card.tsx) reads
// ONLY these; each protocol's adapter owns the mapping from its API types.
//
// Liquity V2 is the design benchmark: every slot here exists because the V2
// trove card carried it. A fork whose lane lacks a datum leaves the optional
// field unset and the card simply omits that slot — it never fakes a value.

export type LiquityFamilyId = "liquity-v2" | "asymmetry" | "ebisu" | "basedollar";

export type LiquityTroveStatus = "open" | "closed" | "liquidated";

export interface LiquityTroveBatch {
  /** The batch manager (delegate) address the trove delegates its rate to. */
  managerAddress: string | null;
  /** Roster name for the manager when the explorer knows one (V2's
   *  data/batch-managers.json); null renders as "Delegate-managed". */
  managerName: string | null;
  /** The delegate's annual management fee (percent) — V2 states it on the
   *  costs strip; the card carries it for the delegate glyph's title. */
  managementFee: number;
  /** Delegate deprecation notice (V2 roster) — the card draws its caution
   *  banner above the stats when set. */
  deprecation: { deprecatedDate: string; isPast: boolean } | null;
}

export interface LiquityTroveView {
  id: string;
  status: LiquityTroveStatus;
  /** Open trove redeemed below the branch's MIN_DEBT floor (V2 status 4) —
   *  index-derived; a live read's own status wins on the detail card. */
  isZombie: boolean;
  /** Branch display symbol exactly as the listing rows carry it (WETH |
   *  wstETH | rETH for V2; the fork's own roster otherwise). */
  collateralType: string;
  collateral: number;
  debt: number;
  /** Lifetime maxima — the terminal card's headline (a closed trove reads 0/0). */
  peakCollateral: number;
  peakDebt: number;
  /** Annual interest rate, PERCENT (e.g. 4.25). */
  interestRate: number;
  isBatched: boolean;
  /** Delegate detail when the lane carries it (V2). `isBatched` alone still
   *  draws the delegate glyph. */
  batch?: LiquityTroveBatch | null;
  /** Unix seconds of the most recent event. */
  lastActivityAt: number;
  /** The trove's OWN transactions (redemptions + liquidations excluded). */
  txCount: number;
  liquidationCount: number;
  redemptionCount: number;
  /** TroveNFT owner; `owner` is null once burned, `lastOwner` survives it. */
  owner?: string | null;
  lastOwner?: string | null;
  ownerEns?: string | null;
  /** Marketplace link for the trove NFT (OpenSea) when the explorer knows the
   *  NFT contract. Omitted → no NFT link on the card. */
  nftUrl?: string | null;
  atBlock?: number;
  /** Branch oracle price and its products, as resolved by the LISTING lane.
   *  Null = unpriced — the USD / ratio / liquidation slots are simply absent. */
  priceUsd?: number | null;
  priceStale?: boolean;
  /** True while a price is expected but has not resolved (V2's detail page
   *  before /api/oracle lands): the detail card draws skeletons in the USD,
   *  ratio and liquidation slots instead of leaving them empty. */
  pricePending?: boolean;
  collateralUsd?: number | null;
  /** Collateral ratio as a PERCENT (187.4), never a ratio. */
  collateralRatioPct?: number | null;
}

/** The detail page's live read, normalised — the card shows these ENTIRE
 *  figures in place of the indexed ones (value and receipt travel together;
 *  the protocol's face-provenance builder receives the same object). */
export interface LiquityTroveLive {
  entireColl: number;
  entireDebt: number;
  /** Percent. */
  annualInterestRatePct: number;
  /** The contract's own integers behind the three figures above, where the
   *  lane delivers them (Liquity V2's trove-state read does): what a receipt's
   *  scaling sentence is built from. Never rebuilt from the floats. */
  entireCollRaw?: string;
  entireDebtRaw?: string;
  annualInterestRateRaw?: string;
  priceUsd: number | null;
  /** The live collateral ratio as a PERCENT (the contract's own getCurrentICR
   *  × 100 on the forks; entire figures × oracle price on V2). Null when the
   *  trove has no live debt or no price. */
  icrPct: number | null;
  /** The contract's own status word when the lane has one ("active" |
   *  "zombie" | …); "zombie" overrides the view's index-derived flag. */
  status: string;
}

/** What the card hands a protocol's face-provenance builder — the displayed
 *  figures, so every receipt names the value actually on the face. */
export interface LiquityFaceProvContext {
  v: LiquityTroveView;
  /** The live override actually applied (null on the listing and on a closed trove). */
  live: LiquityTroveLive | null;
  coll: number;
  debt: number;
  /** Percent. */
  rate: number;
  priceUsd: number | null;
  collUsd: number | null;
  /** Percent. */
  crPct: number | null;
  liqPrice: number | null;
  /** Branch MCR as a percent (110), when resolvable. */
  mcrPct: number | undefined;
}
