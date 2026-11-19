// IPOR Fusion's markets, as the factsheet's "Where the assets are" names and
// decodes them (rails-ops TO-DO-ipor-scoping §6.3 phase B). A vault's balance
// is the sum over market ids (IPOR-Labs/ipor-fusion,
// contracts/libraries/IporFusionMarkets.sol); a market's substrates are the
// bytes32 grants `getMarketSubstrates(id)` answers, and each market kind packs
// them its own way (the SubstrateLib or balance fuse named on each decoder).
// No `@/` imports: scripts/test/ipor-fusion-markets.test.mjs reads it.

/** How a market's substrates are decoded and drawn. */
export type MarketKind =
  | "tokens" // asset addresses (Aave V3, SparkLend, Compound V3)
  | "held" // ERC20_VAULT_BALANCE: tokens the vault holds itself
  | "morpho" // Morpho Blue market ids
  | "child" // ERC-4626 or MetaMorpho vaults the vault holds shares of
  | "address" // one contract per substrate: a pool, a gauge, an fToken, a silo, a Pendle market
  | "liquity" // Liquity V2 branch address registries
  | "aave-v4" // AaveV4SubstrateLib reserves
  | "euler" // EulerFuseLib vaults
  | "uniswap-v4" // a pool id and its tokens
  | "midas" // MidasSubstrateLib type + address
  | "external" // ExternalStateSubstrateLib type + payload
  | "route" // a market that holds no balance: swappers, flash loans, the zero-balance market
  | "raw"; // a market with no decoder here

export interface MarketInfo {
  /** IPOR's constant in IporFusionMarkets.sol; null for an id it does not list. */
  constant: string | null;
  /** The venue as the table names it. */
  venue: string;
  kind: MarketKind;
  /** The Rails explorer that covers the market, by chain: its session key. */
  covered?: Partial<Record<number, string>>;
}

const T = (venue: string, kind: MarketKind, covered?: Partial<Record<number, string>>) => ({ venue, kind, covered });

/** The ids this page names, from IporFusionMarkets.sol. */
const MARKETS: Record<string, Omit<MarketInfo, "constant"> & { constant: string }> = {
  "1": { constant: "AAVE_V3", ...T("Aave V3", "tokens", { 1: "aave-v3" }) },
  "2": { constant: "COMPOUND_V3_USDC", ...T("Compound V3 USDC", "tokens", { 1: "compound" }) },
  "3": { constant: "GEARBOX_POOL_V3", ...T("Gearbox V3 pool", "address") },
  "4": { constant: "GEARBOX_FARM_DTOKEN_V3", ...T("Gearbox V3 farm", "address") },
  "5": { constant: "FLUID_INSTADAPP_POOL", ...T("Fluid lending", "address") },
  "6": { constant: "FLUID_INSTADAPP_STAKING", ...T("Fluid staking", "address") },
  "7": { constant: "ERC20_VAULT_BALANCE", ...T("Other tokens in the vault", "held") },
  "8": { constant: "UNISWAP_SWAP_V3_POSITIONS", ...T("Uniswap V3 positions", "raw") },
  "9": { constant: "UNISWAP_SWAP_V2", ...T("Uniswap V2 swaps", "route") },
  "10": { constant: "UNISWAP_SWAP_V3", ...T("Uniswap V3 swaps", "route") },
  "11": { constant: "EULER_V2", ...T("Euler V2", "euler") },
  "12": { constant: "UNIVERSAL_TOKEN_SWAPPER", ...T("Universal Token Swapper", "route") },
  "13": { constant: "COMPOUND_V3_USDT", ...T("Compound V3 USDT", "tokens", { 1: "compound" }) },
  "14": { constant: "MORPHO", ...T("Morpho Blue", "morpho", { 1: "morpho" }) },
  "15": { constant: "SPARK", ...T("Spark", "tokens") },
  "16": { constant: "CURVE_POOL", ...T("Curve pool", "address") },
  "17": { constant: "CURVE_LP_GAUGE", ...T("Curve gauge", "address") },
  "19": { constant: "MORPHO_FLASH_LOAN", ...T("Morpho flash loans", "route") },
  "20": { constant: "AAVE_V3_LIDO", ...T("Aave V3 Lido market", "tokens", { 1: "aave-v3" }) },
  "23": { constant: "PENDLE", ...T("Pendle", "address", { 1: "pendle" }) },
  "25": { constant: "CURVE_GAUGE_ERC4626", ...T("Curve gauge", "address") },
  "26": { constant: "COMPOUND_V3_WETH", ...T("Compound V3 WETH", "tokens", { 1: "compound" }) },
  "29": { constant: "LIQUITY_V2", ...T("Liquity V2", "liquity", { 1: "liquity-v2" }) },
  "34": { constant: "STAKE_DAO_V2", ...T("Stake DAO V2", "address") },
  "35": { constant: "SILO_V2", ...T("Silo V2", "address") },
  "38": { constant: "ENSO", ...T("Enso", "route") },
  "40": { constant: "ASYNC_ACTION", ...T("Async action", "raw") },
  "41": { constant: "MORPHO_LIQUIDITY_IN_MARKETS", ...T("Morpho Blue liquidity", "morpho", { 1: "morpho" }) },
  "42": { constant: "ODOS_SWAPPER", ...T("Odos swaps", "route") },
  "43": { constant: "VELORA_SWAPPER", ...T("Velora swaps", "route") },
  "44": { constant: "SPARK_LEND", ...T("SparkLend", "tokens", { 1: "spark" }) },
  "45": { constant: "MIDAS", ...T("Midas", "midas") },
  "46": { constant: "NAPIER", ...T("Napier", "raw") },
  "49": { constant: "AAVE_V4", ...T("Aave V4", "aave-v4", { 1: "aave-v4" }) },
  "50": { constant: "EXTERNAL_STATE", ...T("External state", "external") },
  "53": { constant: "UNISWAP_V4", ...T("Uniswap V4", "uniswap-v4", { 1: "uniswap-v4" }) },
  "57": {
    constant: "COMPOUND_V3_INSTITUTIONAL_USDC",
    ...T("Compound V3 institutional USDC", "tokens"),
  },
  "1202": { constant: "UNIVERSAL_TOKEN_SWAPPER_V2", ...T("Universal Token Swapper", "route") },
  "424243": { constant: "SPOL_UNSTAKE", ...T("SPOL unstake", "route") },
};

/** The zero-balance market's id: uint256's top. Its fuse reports nothing. */
export const ZERO_BALANCE_MARKET = ((BigInt(1) << BigInt(256)) - BigInt(1)).toString();

/** What the page knows about a market id. */
export function marketInfo(id: string): MarketInfo {
  if (id === ZERO_BALANCE_MARKET)
    return { constant: "ZERO_BALANCE_MARKET", venue: "Zero-balance market", kind: "route" };
  const known = MARKETS[id];
  if (known) return known;
  const n = Number(id);
  if (n >= 100001 && n <= 100020)
    return { constant: `ERC4626_${String(n - 100000).padStart(4, "0")}`, venue: "ERC-4626 vault", kind: "child" };
  if (n >= 200001 && n <= 200010)
    return { constant: `META_MORPHO_${String(n - 200000).padStart(4, "0")}`, venue: "MetaMorpho vault", kind: "child" };
  return { constant: null, venue: `Market ${id}`, kind: "raw" };
}

// ── substrates ───────────────────────────────────────────────────────────────

export type Substrate =
  | { kind: "address"; address: string }
  | { kind: "morpho-market"; id: string }
  | {
      kind: "aave-v4-reserve";
      spoke: string;
      reserveId: number;
      isCollateral: boolean;
      canBorrow: boolean;
    }
  | { kind: "euler-vault"; vault: string; isCollateral: boolean; canBorrow: boolean; subAccount: number }
  | { kind: "euler-pool"; pool: string; subAccount: number }
  | { kind: "pool-id"; id: string }
  | { kind: "typed"; type: string; address: string }
  | { kind: "target"; address: string; selector: string }
  | { kind: "setting"; type: string; value: string }
  | { kind: "raw"; hex: string };

const word = (hex: string) => BigInt(hex);
const MASK160 = (BigInt(1) << BigInt(160)) - BigInt(1);
const addr = (v: bigint) => `0x${(v & MASK160).toString(16).padStart(40, "0")}`;
const hex32 = (hex: string) => `0x${hex.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
/** An address substrate: the low 160 bits, with nothing above them. */
const plainAddress = (hex: string): string | null => (word(hex) >> BigInt(160) === BigInt(0) ? addr(word(hex)) : null);

const MIDAS_TYPES = ["undefined", "mToken", "deposit vault", "redemption vault", "instant redemption vault", "asset"];
const EXTERNAL_TYPES = [
  "undefined",
  "asset",
  "target",
  "custodian",
  "balance account",
  "staleness limit",
  "big-change limit",
  "dust threshold",
  "minimum update interval",
];

/** One substrate, decoded for its market's kind. Anything that does not fit
 *  its layout stays raw. */
export function decodeSubstrate(kind: MarketKind, hexIn: string): Substrate {
  const hex = hex32(hexIn);
  const w = word(hex);
  switch (kind) {
    case "tokens":
    case "held":
    case "child":
    case "address":
    case "route": {
      const a = plainAddress(hex);
      return a ? { kind: "address", address: a } : { kind: "raw", hex };
    }
    case "liquity": {
      // LiquityBalanceFuse reads the low 160 bits as a branch's address
      // registry (PlasmaVaultConfigLib.bytes32ToAddress); a tag above them is
      // the vault's own and is shown as a type.
      const tag = Number(w >> BigInt(160));
      return tag === 0
        ? { kind: "address", address: addr(w) }
        : { kind: "typed", type: `tag ${tag}`, address: addr(w) };
    }
    case "morpho":
      return { kind: "morpho-market", id: hex };
    case "aave-v4": {
      // AaveV4SubstrateLib: type 255..248 (1 = reserve), spoke 247..88,
      // reserveId 87..56, flags 55..48 (bit0 isCollateral, bit1 canBorrow).
      if (Number(w >> BigInt(248)) !== 1) return { kind: "raw", hex };
      const flags = Number((w >> BigInt(48)) & BigInt(0xff));
      return {
        kind: "aave-v4-reserve",
        spoke: addr(w >> BigInt(88)),
        reserveId: Number((w >> BigInt(56)) & BigInt(0xffffffff)),
        isCollateral: (flags & 1) === 1,
        canBorrow: (flags & 2) === 2,
      };
    }
    case "euler": {
      // EulerFuseLib: vault 255..96, isCollateral byte at 88, canBorrow at 80,
      // sub-account at 72; bit 64 marks an EulerSwap pool entry.
      const subAccount = Number((w >> BigInt(72)) & BigInt(0xff));
      if (((w >> BigInt(64)) & BigInt(1)) === BigInt(1))
        return { kind: "euler-pool", pool: addr(w >> BigInt(96)), subAccount };
      return {
        kind: "euler-vault",
        vault: addr(w >> BigInt(96)),
        isCollateral: ((w >> BigInt(88)) & BigInt(1)) === BigInt(1),
        canBorrow: ((w >> BigInt(80)) & BigInt(1)) === BigInt(1),
        subAccount,
      };
    }
    case "uniswap-v4": {
      // UniswapV4SubstrateLib: a PoolId (keccak of the PoolKey), or a token.
      const a = plainAddress(hex);
      return a ? { kind: "address", address: a } : { kind: "pool-id", id: hex };
    }
    case "midas": {
      // MidasSubstrateLib: type << 160 | address.
      const t = Number(w >> BigInt(160));
      return t > 0 && t < MIDAS_TYPES.length
        ? { kind: "typed", type: MIDAS_TYPES[t], address: addr(w) }
        : { kind: "raw", hex };
    }
    case "external": {
      // ExternalStateSubstrateLib: type in 255..248; an address in the low 160
      // bits, a target's selector in the 32 bits above it, or a uint248 value.
      const t = Number(w >> BigInt(248));
      if (t === 0 || t >= EXTERNAL_TYPES.length) return { kind: "raw", hex };
      const type = EXTERNAL_TYPES[t];
      if (t === 2)
        return {
          kind: "target",
          address: addr(w),
          selector: `0x${((w >> BigInt(160)) & BigInt(0xffffffff)).toString(16).padStart(8, "0")}`,
        };
      if (t === 1 || t === 3 || t === 4) return { kind: "typed", type, address: addr(w) };
      return { kind: "setting", type, value: (w & ((BigInt(1) << BigInt(248)) - BigInt(1))).toString() };
    }
    case "raw":
      return { kind: "raw", hex };
  }
}

/** Every address a market's decoded substrates name: the ones the page asks a
 *  name for. */
export function substrateAddresses(subs: readonly Substrate[]): string[] {
  const out: string[] = [];
  for (const s of subs) {
    if (s.kind === "address" || s.kind === "typed" || s.kind === "target") out.push(s.address);
    else if (s.kind === "euler-vault") out.push(s.vault);
    else if (s.kind === "euler-pool") out.push(s.pool);
  }
  return out;
}
