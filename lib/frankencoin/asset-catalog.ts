/**
 * Frankencoin (Ethereum L1) — addresses, scales and the position-grain vocabulary.
 *
 * The position grain is the POSITION CONTRACT ITSELF: every borrower owns a
 * `Position` minimal-proxy clone, so the address IS the identity — the page key,
 * the API key, the chain-overlay key. Positions are enumerated from
 * `PositionOpened` on the two MintingHubs (never off the factory), and a
 * position's owner is a mutable fact (`OwnershipTransferred`), not its name.
 *
 * ⚠️ There is deliberately NO collateral roster in this file. Anyone can open a
 * position on any ERC-20, so collateral identity (symbol / decimals) resolves
 * from the token contract or arrives on the API row — never hardcoded. The
 * decimals spread is real: 8 of 26 observed collateral tokens are not 18
 * decimals, four are decimals=0, and one answers symbol() in bytes32.
 *
 * UNITS ARE NATIVE. ZCHF is the debt unit everywhere; the collateral unit is
 * the position's own token. Frankencoin is oracle-free — no USD ever renders.
 */

/** The two MintingHubs — `PositionOpened` / challenge auctions live here.
 *  V1 (2023) and V2 (2024, Leadrate-based interest + ForcedSale) run side by
 *  side; V1 positions are all closed at head but their history stands. */
export const FRANKENCOIN_ADDRESSES = {
  HUB_V1: "0x7546762fdb1a6d9146b33960545C3f6394265219",
  HUB_V2: "0xDe12B620A8a714476A97EfD14E6F7180Ca653557",
  /** The Frankencoin (ZCHF) token — 18 decimals. */
  ZCHF: "0xB58E61C3098d85632Df34EecfB899A1Ed80921cB",
} as const;

export type FrankencoinHubVersion = "v1" | "v2";

export const hubAddress = (v: FrankencoinHubVersion): string =>
  v === "v1" ? FRANKENCOIN_ADDRESSES.HUB_V1 : FRANKENCOIN_ADDRESSES.HUB_V2;

/** Rates and the reserve contribution are parts-per-million on chain.
 *  ppm ÷ 10,000 = percent (200,000 ppm = 20%). */
export const ppmToPct = (ppm: number): number => ppm / 10_000;

/** V2 positions whose expiration has passed can be cleared by anyone via the
 *  hub's ForcedSale — the expiry is a hard lifecycle edge, not a display nicety. */
export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Canonical lowercase position address, or null when not an address. */
export function normalizePositionAddress(raw: string): string | null {
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

/** cooldown is a unix timestamp EXCEPT for its two marker uses: deny() sets it
 *  to the expiration (minting disabled forever), and V1's close sets it to
 *  uint256-max. Anything beyond this bound is a marker, not a clock. */
export const COOLDOWN_CLOCK_BOUND = 4_102_444_800; // 2100-01-01 — far past any real cooldown
