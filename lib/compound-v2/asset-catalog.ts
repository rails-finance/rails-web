/**
 * Compound V2 (Ethereum L1) — the market catalog.
 *
 * Compound V2's roster is fixed: the Comptroller has listed 20 markets and
 * governance is winding the protocol down rather than adding to it. The roster
 * is still read from `getAllMarkets()` at head (the Comptroller is the
 * authority on what is listed, not this file) — what lives here is the identity
 * a cToken cannot state about itself.
 *
 * ⚠️ THE ONE RULE: KEY ON THE cTOKEN ADDRESS, NEVER ON `symbol()`.
 * 20 markets carry only 18 distinct symbols, and the collisions are not
 * cosmetic — they are two different assets wearing one name:
 *
 *   • `cDAI` names TWO markets. 0x5d3a536E is the real DAI market. 0xF5DCe572
 *     is the LEGACY SAI market — its underlying is SAI (Single-Collateral Dai,
 *     0x89d24A6b), and BOTH the cToken and the SAI token itself report the
 *     string "DAI". There is no string at any level that separates them, so a
 *     symbol key silently labels ~$2.3M of SAI as DAI.
 *   • `cWBTC` names TWO markets. 0xC11b1268 (legacy) and 0xccF4429D (WBTC2)
 *     are both real, both live, and both on the SAME underlying WBTC. Two
 *     markets, one asset — neither is a duplicate to be reduced away.
 *
 * Underlying identity is hand-resolved here for the three tokens that cannot
 * answer for themselves, each verified on chain by
 * scripts/verify-compound-v2-chain.mjs:
 *
 *   • cETH's `underlying()` REVERTS — the market is native ETH, and there is no
 *     ERC-20 behind it to ask (the same class as Fluid's ETH sentinel).
 *   • SAI and MKR are pre-standard tokens: `symbol()` and `name()` return
 *     bytes32, not string, so the shared ERC-20 resolver's string decode fails
 *     on both and they would fall back to a truncated address. Their symbols
 *     are stated here rather than taught to lib/sources/chain/erc20-meta.ts,
 *     which every other protocol depends on — the same treatment Fluid's ETH
 *     sentinel gets in lib/fluid/asset-catalog.ts.
 */

export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** The Comptroller — the authority on which markets are listed, and the
 *  contract whose oracle prices them. */
export const COMPOUND_V2_ADDRESSES = {
  COMPTROLLER: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B",
} as const;

/** Every cToken is 8 dp, regardless of its underlying's decimals. */
export const CTOKEN_DECIMALS = 8;

/** Compound V2's native-ETH market. `underlying()` reverts on it — there is no
 *  token contract to read, so its identity is stated rather than resolved. */
export const CETH_ADDRESS = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";

export function isCEth(cToken: string): boolean {
  return cToken.toLowerCase() === CETH_ADDRESS;
}

/**
 * Underlying tokens whose `symbol()` does not return a string, keyed by the
 * lowercased token address. Both are pre-ERC-20-standard: they encode symbol
 * and name as bytes32, so a string decode reverts and the shared resolver
 * falls back to a truncated address.
 *
 * The bytes32 values decode to exactly these strings on chain — SAI's really
 * does decode to "DAI", which is the deepest layer of the collision above.
 * "SAI" is this catalog's own label, chosen so the two markets are separable
 * on screen; the receipt names the token address, which is the actual claim.
 */
export const BYTES32_SYMBOL_TOKENS: Record<string, { symbol: string; note: string }> = {
  "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359": {
    symbol: "SAI",
    note: 'Single-Collateral Dai. Its bytes32 symbol() decodes to "DAI" — the same string the real DAI token reports — so this label is the catalog\'s, chosen to keep the two markets apart on screen.',
  },
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": {
    symbol: "MKR",
    note: "Maker. Pre-standard bytes32 symbol()/name(), so the shared ERC-20 resolver cannot name it.",
  },
};

/** Identity for a market's underlying, for the tokens that can't state it.
 *  Returns null when the token answers for itself — the caller should use the
 *  shared ERC-20 resolver then. */
export function handResolvedUnderlying(token: string): { symbol: string; note: string } | null {
  return BYTES32_SYMBOL_TOKENS[token.toLowerCase()] ?? null;
}

// ── Market catalog (the position explorer's roster) ──────────────────────────
// One row per listed market, keyed by the BACKEND's market_key (the same
// compound_v2_markets table the index reads — seeded from the Comptroller's own
// getAllMarkets() at block 25,540,906). The protocol view above reads the
// roster live and stays authoritative on WHAT is listed; this catalog carries
// the identity the position surfaces need without a per-request chain read:
// address ↔ key ↔ symbol, decimals, and the display labels for the two
// collisions (`cSAI`, `cWBTC2`) that the chain's own symbol() cannot separate.

export interface CompoundV2Market {
  /** The backend market key ('dai' | 'sai' | 'wbtc' | 'wbtc2' | …). */
  key: string;
  /** Underlying display symbol. SAI's is the catalog's own label (its bytes32
   *  symbol decodes to "DAI"); everything else matches the token's answer. */
  symbol: string;
  /** cToken display label. The catalog's own for the two collisions: the SAI
   *  market's cToken calls itself "cDAI" (labeled cSAI here) and the second
   *  WBTC market calls itself "cWBTC" (labeled cWBTC2 here). */
  cSymbol: string;
  /** cToken contract address (lowercased) — THE market identity on chain. */
  ctoken: string;
  /** Underlying token address (lowercased); null for cETH (native ETH — no
   *  token contract behind it, `underlying()` reverts). */
  underlying: string | null;
  /** Underlying decimals. */
  decimals: number;
}

export const COMPOUND_V2_MARKETS: CompoundV2Market[] = [
  {
    key: "zrx",
    symbol: "ZRX",
    cSymbol: "cZRX",
    ctoken: "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407",
    underlying: "0xe41d2489571d322189246dafa5ebde1f4699f498",
    decimals: 18,
  },
  {
    key: "bat",
    symbol: "BAT",
    cSymbol: "cBAT",
    ctoken: "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
    underlying: "0x0d8775f648430679a709e98d2b0cb6250d2887ef",
    decimals: 18,
  },
  {
    key: "sai",
    symbol: "SAI",
    cSymbol: "cSAI",
    ctoken: "0xf5dce57282a584d2746faf1593d3121fcac444dc",
    underlying: "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359",
    decimals: 18,
  },
  {
    key: "rep",
    symbol: "REP",
    cSymbol: "cREP",
    ctoken: "0x158079ee67fce2f58472a96584a73c7ab9ac95c1",
    underlying: "0x1985365e9f78359a9b6ad760e32412f4a445e862",
    decimals: 18,
  },
  {
    key: "eth",
    symbol: "ETH",
    cSymbol: "cETH",
    ctoken: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
    underlying: null,
    decimals: 18,
  },
  {
    key: "usdc",
    symbol: "USDC",
    cSymbol: "cUSDC",
    ctoken: "0x39aa39c021dfbae8fac545936693ac917d5e7563",
    underlying: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
  },
  {
    key: "wbtc",
    symbol: "WBTC",
    cSymbol: "cWBTC",
    ctoken: "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4",
    underlying: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    decimals: 8,
  },
  {
    key: "dai",
    symbol: "DAI",
    cSymbol: "cDAI",
    ctoken: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
    underlying: "0x6b175474e89094c44da98b954eedeac495271d0f",
    decimals: 18,
  },
  {
    key: "usdt",
    symbol: "USDT",
    cSymbol: "cUSDT",
    ctoken: "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
    underlying: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
  },
  {
    key: "uni",
    symbol: "UNI",
    cSymbol: "cUNI",
    ctoken: "0x35a18000230da775cac24873d00ff85bccded550",
    underlying: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    decimals: 18,
  },
  {
    key: "comp",
    symbol: "COMP",
    cSymbol: "cCOMP",
    ctoken: "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4",
    underlying: "0xc00e94cb662c3520282e6f5717214004a7f26888",
    decimals: 18,
  },
  {
    key: "tusd",
    symbol: "TUSD",
    cSymbol: "cTUSD",
    ctoken: "0x12392f67bdf24fae0af363c24ac620a2f67dad86",
    underlying: "0x0000000000085d4780b73119b644ae5ecd22b376",
    decimals: 18,
  },
  {
    key: "wbtc2",
    symbol: "WBTC",
    cSymbol: "cWBTC2",
    ctoken: "0xccf4429db6322d5c611ee964527d42e5d685dd6a",
    underlying: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    decimals: 8,
  },
  {
    key: "link",
    symbol: "LINK",
    cSymbol: "cLINK",
    ctoken: "0xface851a4921ce59e912d19329929ce6da6eb0c7",
    underlying: "0x514910771af9ca656af840dff83e8264ecf986ca",
    decimals: 18,
  },
  {
    key: "mkr",
    symbol: "MKR",
    cSymbol: "cMKR",
    ctoken: "0x95b4ef2869ebd94beb4eee400a99824bf5dc325b",
    underlying: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
    decimals: 18,
  },
  {
    key: "sushi",
    symbol: "SUSHI",
    cSymbol: "cSUSHI",
    ctoken: "0x4b0181102a0112a2ef11abee5563bb4a3176c9d7",
    underlying: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
    decimals: 18,
  },
  {
    key: "aave",
    symbol: "AAVE",
    cSymbol: "cAAVE",
    ctoken: "0xe65cdb6479bac1e22340e4e755fae7e509ecd06c",
    underlying: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    decimals: 18,
  },
  {
    key: "yfi",
    symbol: "YFI",
    cSymbol: "cYFI",
    ctoken: "0x80a2ae356fc9ef4305676f7a3e2ed04e12c33946",
    underlying: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e",
    decimals: 18,
  },
  {
    key: "fei",
    symbol: "FEI",
    cSymbol: "cFEI",
    ctoken: "0x7713dd9ca933848f6819f38b8352d9a15ea73f67",
    underlying: "0x956f47f50a910163d8bf957cf5846d573e7f87ca",
    decimals: 18,
  },
  {
    key: "usdp",
    symbol: "USDP",
    cSymbol: "cUSDP",
    ctoken: "0x041171993284df560249b57358f931d9eb7b925d",
    underlying: "0x8e870d67f660d95d5be530380d0ec0bd388289e1",
    decimals: 18,
  },
];

/** Market key → catalog entry. */
export const COMPOUND_V2_MARKET_BY_KEY: Record<string, CompoundV2Market> = Object.fromEntries(
  COMPOUND_V2_MARKETS.map((m) => [m.key, m]),
);

/** Underlying display symbol → ALL matching market keys. One-to-many on
 *  purpose: WBTC names TWO markets (wbtc, wbtc2) — a symbol chip must reach
 *  both, which is exactly why nothing else keys on symbol. */
export const COMPOUND_V2_KEYS_BY_SYMBOL: Record<string, string[]> = COMPOUND_V2_MARKETS.reduce(
  (acc, m) => {
    (acc[m.symbol] ??= []).push(m.key);
    return acc;
  },
  {} as Record<string, string[]>,
);

/** The distinct underlying symbols, in roster order (filter chips — 19 of 20
 *  markets survive the dedupe; the two WBTC markets share one chip). */
export const COMPOUND_V2_FILTER_SYMBOLS: string[] = [...new Set(COMPOUND_V2_MARKETS.map((m) => m.symbol))];
