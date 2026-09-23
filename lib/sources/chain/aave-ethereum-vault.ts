// ONE Aave vault on Ethereum, and one holder's reading of it, at one pinned
// block — the page behind /ethereum/aave/vaults/<vault>. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The directory (aave-ethereum-vault-directory.ts) reads eighteen vaults one
// column deep. This reads ONE vault as deep as its family goes, plus — when
// `?holder=` resolved — what that address holds of it. Everything is an
// `eth_call` at a single block: no indexer, no backend table, no log range.
//
// WHICH ADDRESSES THIS SERVES — the catalogue, decided by the catalogue. The
// roster call is the FIRST thing this loader makes, at the same block as every
// figure it goes on to read: `StataTokenFactory.getStataTokens()`,
// `Umbrella.getStkTokens()`, and the one address Aave's address book names for
// sGHO. An address in that answer is served and its FAMILY comes from which
// call answered it; every other address comes back `served: false` and the page
// 404s. There is no hand-picked roster anywhere in this file — that was the
// Base build's one recorded mistake (a per-vault route serving a narrower set
// than the sibling surface already served for the same address), and the fix
// there was to make catalogue membership the whole test. It is the whole test
// here too.
//
// It is deliberately NOT cached. The directory's five-minute cache is right for
// a roster read that eighteen rows share; here the roster read is the served
// test, and a served test answered at one block while the figures are read at
// another is two claims wearing one block number. One request, one block, one
// answer.
//
// ── THE SHAPE OF THE READ ────────────────────────────────────────────────────
// One `eth_getBlockByNumber` (the block AND its timestamp — a cooldown's state
// is a comparison against the block's own clock, not against this server's),
// then up to four Multicall3 requests. They are sequential because the hops
// are: each request's arguments are the previous one's answers.
//
//   A  the two enumerators — who the vaults are, and therefore whether this
//      address is one — plus the GSM registry, which is not a vault roster at all
//      but the naming ladder's enumerator rung for a HOLDER
//      (lib/shared/attested-addresses.ts); 3 calls. The third one failing costs a
//      name and no figure, unlike the first two;
//   B  what the vault says about itself, the holder's balance, and every family
//      read whose arguments are already known;
//   C  the calls whose ARGUMENT came out of B: `convertToAssets(10^decimals)`
//      with the exponent read rather than assumed, `convertToAssets(holder's
//      shares)`, the asset the vault actually holds, on a stake token the
//      wrapper it holds asked what IT wraps, and on a stata token the other end
//      of that same hop — each stake token in A's roster asked for its `asset()`
//      and for `balanceOf` of this vault, which is what lets the page say whose
//      backing these shares are (`backedBy`);
//   D  only on an Umbrella stake token over a wrapper: the reserve reached by
//      C's second `asset()` hop, and what Umbrella says about that reserve.
//
// `batchSize: 0` on each keeps the request count a fact about the code.
//
// ── WHAT EACH FAMILY READS, AND WHY ──────────────────────────────────────────
//
// sGHO — a savings vault over GHO, one hop. Its accounting is the thing worth
// stating: `totalAssets()` is NOT the GHO the contract holds. It is what the
// stored yield index says the shares are worth, and withdrawals are clamped to
// the real balance instead. So this reads BOTH — `totalAssets()` and
// `GHO.balanceOf(sGHO)` — and states the difference as its own number, with no
// order asserted between them (measured at the time of writing: the balance was
// the larger by about 5,023 GHO; that is a fact about one block, not a rule).
// Beside them the configuration the risk council sets: `targetRate()` in basis
// points as stored, `supplyCap()`, and `maxDeposit()` — which is the cap minus
// the total, so remaining capacity is the vault's own answer rather than this
// page's subtraction.
//
// stata — an ERC-4626 wrapper over exactly one Aave V3 aToken. Its share price
// IS the reserve's normalised income, so the hop is the page: the wrapper's own
// `aToken()`, the Pool the wrapper names in `POOL()`, that Pool's
// `getReserveData(asset).liquidityIndex`, and `aToken.balanceOf(wrapper)`. The
// link is proved BOTH WAYS — the wrapper says which aToken it wraps, and the
// Pool says which aToken belongs to the reserve; a page that only asked the
// wrapper would be taking the wrapper's word for its own membership.
// `rewardTokens()` is read and stated even when it answers an empty list: an
// empty list is a reading. It is also a REGISTRY that can under-report — a
// reward added after the wrapper was created has to be registered by a
// permissionless call — and the receipt says so rather than presenting it as
// the Pool's truth.
//
// umbrella — staked, and slashable. Three of the four stake tokens hold a stata
// token rather than the reserve asset, so a holder is THREE HOPS from the
// reserve and this loader walks all three, each leg its own call: the stake
// token's `asset()` (a wrapper), the wrapper's `asset()` (the reserve), and the
// wrapper's `convertToAssets()` for what the holder's wrapper-unit claim is in
// reserve units. stkGHO holds GHO directly and has no middle hop; the code
// tests for the wrapper by CATALOGUE MEMBERSHIP of the answer, never by
// assuming the family. (`getStakeTokenData()` is not used for this at all: its
// first word is not the asset for stkGHO.)
//
// ⚠️ WHAT THE SLASHING FIGURES ARE, AND WHAT THEY ARE NOT. `getMaxSlashableAssets()`,
// `MIN_ASSETS_REMAINING()`, `Umbrella.isReserveSlashable(reserve)`,
// `getDeficitOffset(reserve)` and `getPendingDeficit(reserve)` are the
// contract's own configuration and its own readings, in native units, and they
// render as that. NO HOLDER'S SHARE OF A SLASHABLE AMOUNT IS COMPUTED ANYWHERE
// IN THIS FILE. "This holder would lose N" is a projection of an event that has
// not happened; the chain-truth gate refuses it on the face, and the way to
// keep refusing it is not to have the number.
//
// ── NO USD, ANYWHERE ─────────────────────────────────────────────────────────
// A stake token's `latestAnswer()` is a USD oracle price and is deliberately
// not read. Every figure below is a quantity of one named token.
//
// A REVERT IS AN ABSENCE, A FAILED REQUEST IS NOTHING. Every optional call goes
// through `allowFailure`, so a contract that does not answer a getter is a
// contract without it — rendered as unread, never as a zero. A request that
// FAILED is a different thing: the whole reading comes back `chainStale` and
// the page states no figure at all.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { chainBatchClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import type { RawAmount } from "./morpho-base-vault";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import {
  AAVE_STATA_FACTORY,
  AAVE_UMBRELLA,
  AAVE_ETHEREUM_BOOK_VAULTS,
  type AaveVaultFamily,
} from "@/lib/aave-vaults/vault-catalog";
import {
  AAVE_GSM_REGISTRY,
  attestedAddress,
  attestedByGsmRegistry,
  type AttestedAddress,
} from "@/lib/shared/attested-addresses";

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const ENUMERATOR_ABI = parseAbi([
  "function getStataTokens() view returns (address[])",
  "function getStkTokens() view returns (address[])",
]);

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
]);

const SGHO_ABI = parseAbi([
  "function targetRate() view returns (uint16)",
  "function supplyCap() view returns (uint160)",
  "function maxDeposit(address) view returns (uint256)",
  "function yieldIndex() view returns (uint176)",
  "function ratePerSecond() view returns (uint96)",
  "function lastUpdate() view returns (uint64)",
  "function paused() view returns (bool)",
]);

const STATA_ABI = parseAbi([
  "function aToken() view returns (address)",
  "function POOL() view returns (address)",
  "function rewardTokens() view returns (address[])",
]);

const POOL_ABI = parseAbi([
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);

const STAKE_ABI = parseAbi([
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
  "function getMaxSlashableAssets() view returns (uint256)",
  "function MIN_ASSETS_REMAINING() view returns (uint256)",
  "function owner() view returns (address)",
  "function getStakerCooldown(address) view returns ((uint192 amount, uint32 endOfCooldown, uint32 withdrawalWindow))",
]);

const UMBRELLA_ABI = parseAbi([
  "function isReserveSlashable(address reserve) view returns (bool, uint256)",
  "function getDeficitOffset(address reserve) view returns (uint256)",
  "function getPendingDeficit(address reserve) view returns (uint256)",
]);

const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// ── the holder-shape classifier ──────────────────────────────────────────────
// Ported from lib/sources/chain/morpho-base-vault.ts, which built it for the
// Base section, with two differences that are differences in the CHAIN and not
// in taste:
//
//  1. THE "KNOWN VAULT" BRANCH IS THIS CATALOGUE'S. There, a holder that is
//     itself a censused MetaMorpho is named as one; here, a holder that is
//     itself in Aave's own catalogue is named as one — and it is the common
//     case rather than a curiosity: each funded static aToken's largest holder
//     is the Umbrella stake token staked on it.
//  2. A FOURTH SAFE SINGLETON. The Base table carries four released addresses;
//     an Ethereum holder census over all eighteen vaults found holders behind a
//     fifth, `0xfb1b…91ea` (1.3.0 L2, eip155). A singleton missing from the
//     table is not a wrong answer — the address falls through to "a contract" —
//     but it is a WEAKER one, so the table carries what this chain shows.
//
// The two tables were not merged into one shared module in this phase. The Base
// union type is written in the Base catalogue's own nouns (`metamorpho-vault`,
// with a census row's name on it), so generalising it is a rename that reaches
// into the Base view's shape sentence and its verifier — a separate, provable
// change, not a side effect of building a page on another chain.
//
// A REVERT IS AN ABSENCE here too: the optional accessors go through
// `allowFailure`, so a contract with no `asset()` is a contract with no
// `asset()`, never an error and never a zero.

/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") − 1. */
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
/** Slot 0 — where a Safe proxy keeps its singleton address. */
const SLOT_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
/** The EIP-1167 minimal-proxy runtime, implementation embedded at [10, 30). */
const EIP1167_RE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i;
/** The EIP-7702 delegation indicator: EXACTLY 23 bytes, `0xef0100` then the
 *  20-byte delegate. Anchored at both ends — a longer code that merely starts
 *  this way is not a delegation. Tested BEFORE every other code branch: read
 *  after them, a delegated account reads as an anonymous 23-byte contract. */
const EIP7702_RE = /^0xef0100([0-9a-f]{40})$/i;

/** The Safe singletons a proxy can point at, by released version. A Safe is
 *  proven by the address in its slot 0 (or embedded in its minimal-proxy
 *  bytecode) matching one of these — never by a guess about its ABI. */
const SAFE_SINGLETONS: Record<string, string> = {
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "1.3.0",
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "1.3.0 L2",
  "0xfb1bffc9d739b8d520daf37df666da4c687191ea": "1.3.0 L2 (eip155)",
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "1.4.1",
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "1.4.1 L2",
};

const HOLDER_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function totalSupply() view returns (uint256)",
  // A GHO Stability Module says what it holds in its own words, and for the two
  // on Ethereum the answer IS a vault in this catalogue. Asked of every holder
  // through `allowFailure`, so a contract without it is a contract without it.
  "function UNDERLYING_ASSET() view returns (address)",
]);

/** `GsmRegistry.getGsmList()` — the enumerator rung of the naming ladder
 *  (lib/shared/attested-addresses.ts). Asked of the address Aave's own book
 *  names, so a module deployed after the pinned commit is still found. */
const GSM_REGISTRY_ABI = parseAbi(["function getGsmList() view returns (address[])"]);

/** What the address holding the shares turned out to be, with the read each
 *  verdict rests on. The page states one sentence per shape and the evidence
 *  rides with it rather than being re-derived. */
export type AaveVaultHolderShape =
  /** `eth_getCode` came back empty at the pinned block. */
  | { kind: "eoa"; codeSize: 0 }
  /** EIP-7702: the code is the 23-byte delegation indicator. A key still
   *  controls the account; its code is the delegate's. */
  | { kind: "delegated-account"; codeSize: 23; delegate: string }
  /** Itself a member of this catalogue — Aave's own vault layer holding its own
   *  vault layer. */
  | {
      kind: "aave-vault";
      codeSize: number;
      family: AaveVaultFamily;
      symbol: string | null;
      /** Its `asset()`, and whether that asset is THIS vault's share token. */
      asset: string | null;
      assetIsVaultShares: boolean;
    }
  /** Slot 0 (or the minimal-proxy bytecode) names a released Safe singleton. */
  | { kind: "safe"; codeSize: number; version: string; singleton: string; evidence: "storage slot 0" | "EIP-1167 code" }
  /** Answers `asset()` with an address AND answers `totalSupply()`. */
  | {
      kind: "erc4626";
      codeSize: number;
      name: string | null;
      symbol: string | null;
      asset: string;
      assetIsVaultShares: boolean;
    }
  /** The EIP-1967 implementation slot holds a non-zero address. */
  | { kind: "erc1967-proxy"; codeSize: number; implementation: string; slot: string; slotValue: string }
  /** The runtime code IS the EIP-1167 minimal proxy, implementation inline. */
  | { kind: "eip1167-proxy"; codeSize: number; implementation: string }
  /** NAMED BY A REGISTRY ITS OWNER PUBLISHES — the address book at a pinned
   *  commit, or an enumerator the book names (lib/shared/attested-addresses.ts
   *  holds the ladder and the rule). The name is the publication's own constant:
   *  nothing here is read off a verified source, a deployer or a resemblance, and
   *  an address no rung answers for keeps the shapes above and says so. */
  | {
      kind: "attested";
      codeSize: number;
      attested: AttestedAddress;
      /** Its own `UNDERLYING_ASSET()`, where it answers one — the read that says
       *  WHY this address holds this vault rather than leaving the name to do it. */
      underlying: string | null;
      /** Whether that underlying is the vault this reading is about. */
      underlyingIsVaultShares: boolean;
    }
  /** Has code, and none of the reads above said anything more than that. */
  | { kind: "contract"; codeSize: number; name: string | null; symbol: string | null };

// ── the response ─────────────────────────────────────────────────────────────

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});
const maybeAmount = (raw: bigint | undefined, decimals: number): RawAmount | null =>
  raw == null ? null : amount(raw, decimals);

const last20 = (word: string) => `0x${word.slice(-40)}`.toLowerCase();
const lower = (a: unknown): string | null => (typeof a === "string" ? a.toLowerCase() : null);

/** A token as this section names it: its own symbol where one resolved, the
 *  address itself where none did. `named: false` is what stops a page styling
 *  hex like a ticker. */
export interface AaveVaultToken {
  address: string;
  symbol: string;
  decimals: number;
  named: boolean;
}

/** A vault in this catalogue, as it is referred to from another vault's page —
 *  the "held by a catalogue member" cross-link. Membership is a CHAIN FACT (the
 *  address came out of an enumerator at this block), never a name. */
export interface AaveVaultRef {
  address: string;
  family: AaveVaultFamily;
  symbol: string | null;
}

export interface AaveSghoReading {
  /** `targetRate()` in basis points exactly as stored. */
  targetRateBps: number | null;
  /** `ratePerSecond()`, RAY-scaled, as stored. A configuration slot. */
  ratePerSecond: string | null;
  /** `yieldIndex()` — the RAY the conversions run against. */
  yieldIndex: string | null;
  /** `lastUpdate()` — a STORED unix second, not the block's own. */
  lastUpdate: number | null;
  /** `paused()`. False is a reading. */
  paused: boolean | null;
  /** `supplyCap()`, in GHO. */
  supplyCap: RawAmount | null;
  /** `maxDeposit()` — the vault's own answer for what is left of the cap. */
  remainingCapacity: RawAmount | null;
  /** `GHO.balanceOf(sGHO)` — the asset the contract actually holds, which is
   *  NOT `totalAssets()` and can be either side of it. */
  assetHeld: RawAmount | null;
  /** assetHeld − totalAssets. Signed, and no order is asserted. */
  assetHeldGap: RawAmount | null;
}

export interface AaveStataReading {
  /** `aToken()` — the one aToken this wrapper wraps, asked of the wrapper. */
  aToken: string | null;
  /** `POOL()` — the Pool the wrapper itself names. */
  pool: string | null;
  /** `Pool.getReserveData(asset).liquidityIndex`, RAY. */
  liquidityIndex: string | null;
  /** `Pool.getReserveData(asset).aTokenAddress` — the same link from the other
   *  end. Equal to `aToken` proves the wrapper's claim rather than repeating it. */
  poolAToken: string | null;
  /** `aToken.balanceOf(wrapper)` — the supply position the wrapper holds. */
  aTokenBalance: RawAmount | null;
  /** aTokenBalance − totalAssets. Signed; the wrapper's own floor rounding. */
  custodyGap: RawAmount | null;
  /** `rewardTokens()`. An empty list is a reading. Null is unread. */
  rewardTokens: string[] | null;
}

export interface AaveUmbrellaReading {
  cooldownSeconds: number | null;
  unstakeWindowSeconds: number | null;
  /** `getMaxSlashableAssets()`, in the stake token's asset units. */
  maxSlashable: RawAmount | null;
  /** `MIN_ASSETS_REMAINING()` — the floor the slashable figure stops at. */
  minAssetsRemaining: RawAmount | null;
  /** `owner()` — the only address that can slash this token. */
  owner: string | null;
  /** `asset.balanceOf(stakeToken)` — what the token custodies, beside the
   *  stored counter `totalAssets()` returns. */
  assetHeld: RawAmount | null;
  /** The reserve this stake token covers, reached by this loader's own
   *  `asset()` hops. Null when a hop did not answer. */
  reserve: AaveVaultToken | null;
  /** `Umbrella.isReserveSlashable(reserve)`'s first word. False is a reading. */
  reserveSlashable: boolean | null;
  /** `Umbrella.getDeficitOffset(reserve)`, in the reserve's units. */
  deficitOffset: RawAmount | null;
  /** `Umbrella.getPendingDeficit(reserve)`, in the reserve's units. */
  pendingDeficit: RawAmount | null;
  /** The middle hop: the static aToken this stake token holds. Null on stkGHO,
   *  which holds GHO directly — tested by catalogue membership of the answer,
   *  never assumed from the family. */
  wrapper: {
    address: string;
    symbol: string | null;
    decimals: number | null;
    aToken: string | null;
    liquidityIndex: string | null;
    /** One whole wrapper share in reserve units. */
    sharePrice: RawAmount | null;
    /** The holder's wrapper-unit claim, converted by the wrapper into reserve
     *  units. Null with no holder. */
    holderClaim: RawAmount | null;
  } | null;
}

/** A catalogue member that holds this vault's shares AND names this vault as its
 *  own `asset()` — an Umbrella stake token staked on this static aToken, which
 *  is the same thing as saying this vault's shares are that token's backing.
 *
 *  Every field is a chain read at the page's own block: the roster answered the
 *  address, the token's own `asset()` named this vault, and `balanceOf` says how
 *  much of it the token holds. Nothing here is a census figure, a ranking or a
 *  USD amount — the reason the relationship can be stated at all is that both
 *  sides of it are reads this page already had to make. */
export interface AaveVaultBackedBy {
  address: string;
  family: AaveVaultFamily;
  /** Its own `symbol()`, read at the same block. Null when that call didn't
   *  answer — then the sentence names the address instead. */
  symbol: string | null;
  /** `this.balanceOf(thatToken)`, in THIS vault's share decimals. */
  shares: RawAmount;
  /** shares ÷ totalSupply. The exact ratio is the two raws; this is for
   *  printing. Shares are fungible, so a share of the shares IS a share of the
   *  pool — no price and no conversion enters it. */
  fraction: number;
}

export interface AaveVaultHolderReading {
  address: string;
  /** `balanceOf(holder)` in the share token's own decimals. */
  shares: RawAmount;
  /** shares ÷ totalSupply, for printing. The exact ratio is the two raws. */
  fraction: number;
  /** True when the fraction rounds to nothing at four significant figures and
   *  the balance is not zero — a holder whose exact share count is the only
   *  truthful thing to print. */
  dust: boolean;
  /** `convertToAssets(shares)` — the VAULT's answer for what they convert to. */
  claim: RawAmount | null;
  /** `maxRedeem(holder)`, in SHARE units. Zero beside a positive balance is a
   *  state on a stake token, not missing data. */
  maxRedeem: RawAmount | null;
  /** From `eth_getCode` at the same block. Null when that read did not answer —
   *  an unread shape is stated as nothing, never guessed as a wallet. */
  shape: AaveVaultHolderShape | null;
  /** Set when the holder is itself in this catalogue at this block. */
  catalogued: AaveVaultRef | null;
  /** `getStakerCooldown(holder)` on an Umbrella stake token — the struct the
   *  contract holds, and which of its four states the block's own timestamp
   *  puts it in. Null on the other two families, which have no cooldown. */
  cooldown: {
    /** The shares the snapshot covers, in share units. */
    amount: RawAmount;
    /** Unix seconds. Zero when no cooldown was ever started. */
    endOfCooldown: number;
    /** Unix seconds of window after it. */
    withdrawalWindow: number;
    /** "none" — no snapshot; "waiting" — the cooldown has not ended;
     *  "open" — inside the window; "expired" — the window has passed. */
    state: "none" | "waiting" | "open" | "expired";
  } | null;
}

export interface AaveEthereumVaultResponse {
  /** Is this address one the catalogue answered at this block? A page 404s and
   *  the API route 400s on false — the same answer either way. */
  served: boolean;
  /** The block the roster AND every figure below was read at. */
  blockNumber: number;
  /** That block's own timestamp, unix seconds — a cooldown's state is a
   *  comparison against this and not against the reader's clock. */
  blockTimestamp: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  vault: {
    address: string;
    family: AaveVaultFamily;
    name: string | null;
    symbol: string | null;
    /** The SHARE token's own decimals: the exponent the share price is asked
     *  for, and the scale shares are printed at. Null = unread, and then there
     *  is no share price either. */
    shareDecimals: number | null;
    /** `asset()`, named and scaled through the house resolver. */
    asset: AaveVaultToken;
    /** Set when the asset is ITSELF in this catalogue — a stake token holding a
     *  static aToken. A chain fact: the address came out of an enumerator. */
    assetVault: AaveVaultRef | null;
  };
  totalAssets: RawAmount | null;
  totalSupply: RawAmount | null;
  /** `convertToAssets(10 ** shareDecimals)` — one whole share in asset units,
   *  the exponent read at the same block. */
  sharePrice: RawAmount | null;
  sgho: AaveSghoReading | null;
  stata: AaveStataReading | null;
  umbrella: AaveUmbrellaReading | null;
  holder: AaveVaultHolderReading | null;
  /** The catalogue members whose own `asset()` is this vault and which hold some
   *  of its shares — in practice the one Umbrella stake token staked on a static
   *  aToken, which is why a stata vault's biggest position is a contract whose
   *  whole life is share transfers. An EMPTY ARRAY IS A READING: the roster
   *  answered, every member's `asset()` was asked, and none named this vault
   *  (every stake token's own page, and sGHO's, answer empty by construction).
   *  The list is in roster order and carries no ranking. */
  backedBy: AaveVaultBackedBy[];
}

const SGHO_ADDRESS = AAVE_ETHEREUM_BOOK_VAULTS.find((v) => v.family === "sgho")!.address;

function unread(vault: string, served: boolean): AaveEthereumVaultResponse {
  return {
    served,
    blockNumber: 0,
    blockTimestamp: 0,
    chainStale: true,
    vault: {
      address: vault,
      family: "stata",
      name: null,
      symbol: null,
      shareDecimals: null,
      asset: { address: "", symbol: "not read", decimals: 18, named: false },
      assetVault: null,
    },
    totalAssets: null,
    totalSupply: null,
    sharePrice: null,
    sgho: null,
    stata: null,
    umbrella: null,
    holder: null,
    // Not `[]` with a comment saying "none": on an unread response nothing was
    // asked, and an empty list here would be a reading this function never made.
    // `chainStale` is what a caller tests, and it refuses the whole response.
    backedBy: [],
  };
}

/**
 * Read one Aave vault on Ethereum at one pinned block, and — when `holder` is
 * given — that address's reading of it.
 *
 * `holder` must already be an address; ENS resolution belongs to the caller
 * (lib/aave-vaults/vault-holder.ts), so this loader has one input shape and no
 * network dependency of its own beyond Ethereum.
 *
 * `served: false` means the catalogue did not name this address at this block.
 * `chainStale: true` means the read failed and NOTHING here may be rendered.
 */
export async function loadAaveEthereumVault(vault: string, holder?: string): Promise<AaveEthereumVaultResponse> {
  const address = vault.toLowerCase();
  const holderAddress = holder?.toLowerCase();
  try {
    const client = chainBatchClient(MAINNET_CHAIN_ID);
    // ONE block, and its timestamp with it. Everything after is pinned to it.
    const block = await client.getBlock();
    const blockNumber = block.number;

    // ── A: who the vaults are — the served test and the family, in one read ──
    const roster = (await client.multicall({
      contracts: [
        { address: AAVE_STATA_FACTORY as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStataTokens" },
        { address: AAVE_UMBRELLA as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStkTokens" },
        // Not a vault roster: the naming ladder's enumerator rung
        // (lib/shared/attested-addresses.ts). It rides THIS request because it is
        // asked at the same block as everything else and a GSM is one of the
        // biggest holders of two of these vaults. A registry that does not answer
        // costs the page a NAME, never a figure — so unlike the two enumerators
        // above, a failure here is not a stale read.
        { address: AAVE_GSM_REGISTRY as `0x${string}`, abi: GSM_REGISTRY_ABI, functionName: "getGsmList" },
      ],
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const stata = (ok(roster[0]) as readonly string[] | undefined)?.map((a) => a.toLowerCase());
    const stake = (ok(roster[1]) as readonly string[] | undefined)?.map((a) => a.toLowerCase());
    const gsmRoster = new Set((ok(roster[2]) as readonly string[] | undefined)?.map((a) => a.toLowerCase()) ?? []);
    // An enumerator that did not answer is not a short roster — it is no
    // roster, and this loader must not answer "not a vault" from silence.
    if (!stata || !stake) {
      console.error("Aave Ethereum vault: an enumerator did not answer at block", blockNumber.toString());
      return unread(address, true);
    }
    const catalogue = new Map<string, AaveVaultFamily>([
      [SGHO_ADDRESS, "sgho"],
      ...stata.map((a) => [a, "stata"] as const),
      ...stake.map((a) => [a, "umbrella-stake"] as const),
    ]);
    const family = catalogue.get(address);
    if (!family) return { ...unread(address, false), blockNumber: Number(blockNumber), chainStale: false };

    // ── B: what the vault says about itself, and the holder's balance ────────
    const bPlan: { kind: string; call: ContractFunctionParameters }[] = [];
    const push = (kind: string, call: ContractFunctionParameters) => bPlan.push({ kind, call });
    const self = address as `0x${string}`;
    for (const fn of ["name", "symbol", "decimals", "asset", "totalAssets", "totalSupply"] as const)
      push(fn, { address: self, abi: VAULT_ABI, functionName: fn });
    if (holderAddress) {
      push("balanceOf", { address: self, abi: VAULT_ABI, functionName: "balanceOf", args: [holderAddress] });
      push("maxRedeem", { address: self, abi: VAULT_ABI, functionName: "maxRedeem", args: [holderAddress] });
    }
    if (family === "sgho") {
      for (const fn of ["targetRate", "supplyCap", "yieldIndex", "ratePerSecond", "lastUpdate", "paused"] as const)
        push(fn, { address: self, abi: SGHO_ABI, functionName: fn });
      // `maxDeposit` takes a receiver and ignores it — asked with the vault's
      // own address so the answer does not depend on who is reading.
      push("maxDeposit", { address: self, abi: SGHO_ABI, functionName: "maxDeposit", args: [self] });
    }
    if (family === "stata")
      for (const fn of ["aToken", "POOL", "rewardTokens"] as const)
        push(fn, { address: self, abi: STATA_ABI, functionName: fn });
    if (family === "umbrella-stake") {
      for (const fn of [
        "getCooldown",
        "getUnstakeWindow",
        "getMaxSlashableAssets",
        "MIN_ASSETS_REMAINING",
        "owner",
      ] as const)
        push(fn, { address: self, abi: STAKE_ABI, functionName: fn });
      if (holderAddress)
        push("stakerCooldown", {
          address: self,
          abi: STAKE_ABI,
          functionName: "getStakerCooldown",
          args: [holderAddress],
        });
    }
    const bRes = (await client.multicall({
      contracts: bPlan.map((p) => p.call),
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const b = new Map<string, unknown>(bPlan.map((p, i) => [p.kind, ok(bRes[i])]));

    const shareDecimals = typeof b.get("decimals") === "number" ? (b.get("decimals") as number) : null;
    const assetAddress = lower(b.get("asset"));
    const totalAssetsRaw = b.get("totalAssets") as bigint | undefined;
    const totalSupplyRaw = b.get("totalSupply") as bigint | undefined;
    const holderShares = holderAddress ? ((b.get("balanceOf") as bigint | undefined) ?? ZERO) : ZERO;

    // The asset is itself a catalogue member on three of the four stake tokens.
    // Tested against the roster this read answered, never against the family.
    const assetFamily = assetAddress ? catalogue.get(assetAddress) : undefined;

    // ── C: the calls whose ARGUMENT came out of B ────────────────────────────
    const cPlan: { kind: string; call: ContractFunctionParameters }[] = [];
    const pushC = (kind: string, call: ContractFunctionParameters) => cPlan.push({ kind, call });
    if (shareDecimals != null)
      pushC("sharePrice", {
        address: self,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [BigInt(10) ** BigInt(shareDecimals)],
      });
    if (holderAddress && holderShares > ZERO)
      pushC("holderClaim", { address: self, abi: VAULT_ABI, functionName: "convertToAssets", args: [holderShares] });
    if (assetAddress && assetAddress !== ZERO_ADDR)
      pushC("assetHeld", {
        address: assetAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [self],
      });
    const aTokenAddress = family === "stata" ? lower(b.get("aToken")) : null;
    const stataPool = family === "stata" ? lower(b.get("POOL")) : null;
    if (family === "stata" && aTokenAddress)
      pushC("aTokenBalance", {
        address: aTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [self],
      });
    if (family === "stata" && stataPool && assetAddress)
      pushC("reserveData", {
        address: stataPool as `0x${string}`,
        abi: POOL_ABI,
        functionName: "getReserveData",
        args: [assetAddress as `0x${string}`],
      });
    // ── WHO IS BACKED BY THIS VAULT — the other end of the middle hop ───────
    // A stake token names its stata wrapper as its `asset()`; asked from the
    // WRAPPER's page that relationship is invisible, and the wrapper's own
    // biggest position is then a contract whose whole life is share transfers
    // with nothing on the page saying what it is. So on a stata page every stake
    // token in the roster is asked two questions — what its asset is, and how
    // much of this vault it holds — and the ones that name this vault are what
    // the page states. The roster came out of call A, so the members are the
    // chain's own list at this block and not a pair written down here.
    //
    // Asked of the stake tokens only. The other direction of the same hop is
    // `assetVault` above, and no vault in this catalogue is the asset of a stata
    // token or of sGHO — so asking the whole catalogue would be ten calls to
    // prove something already read.
    const stakeProbe = family === "stata" ? stake : [];
    for (const stk of stakeProbe) {
      const s = stk as `0x${string}`;
      pushC(`stk.${stk}.asset`, { address: s, abi: VAULT_ABI, functionName: "asset" });
      pushC(`stk.${stk}.symbol`, { address: s, abi: VAULT_ABI, functionName: "symbol" });
      pushC(`stk.${stk}.balance`, { address: self, abi: VAULT_ABI, functionName: "balanceOf", args: [s] });
    }
    // The middle hop, only where the asset is itself a wrapper in this
    // catalogue: ask THAT contract what it wraps and what it is worth.
    const wrapper = family === "umbrella-stake" && assetFamily === "stata" ? assetAddress : null;
    if (wrapper) {
      const w = wrapper as `0x${string}`;
      for (const fn of ["symbol", "decimals", "asset"] as const)
        pushC(`wrapper.${fn}`, { address: w, abi: VAULT_ABI, functionName: fn });
      for (const fn of ["aToken", "POOL"] as const)
        pushC(`wrapper.${fn}`, { address: w, abi: STATA_ABI, functionName: fn });
    }
    const cRes = cPlan.length
      ? ((await client.multicall({
          contracts: cPlan.map((p) => p.call),
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        })) as Call[])
      : [];
    const c = new Map<string, unknown>(cPlan.map((p, i) => [p.kind, ok(cRes[i])]));

    // ── D: the reserve a stake token covers, and Umbrella's word on it ───────
    const wrapperDecimals =
      typeof c.get("wrapper.decimals") === "number" ? (c.get("wrapper.decimals") as number) : null;
    const wrapperPool = lower(c.get("wrapper.POOL"));
    const wrapperAsset = lower(c.get("wrapper.asset"));
    // stkGHO holds GHO itself, so its reserve IS its asset; the other three
    // reach theirs through the wrapper.
    const reserveAddress = family === "umbrella-stake" ? (wrapper ? wrapperAsset : assetAddress) : null;
    const dPlan: { kind: string; call: ContractFunctionParameters }[] = [];
    const pushD = (kind: string, call: ContractFunctionParameters) => dPlan.push({ kind, call });
    if (reserveAddress) {
      const r = reserveAddress as `0x${string}`;
      pushD("slashable", {
        address: AAVE_UMBRELLA as `0x${string}`,
        abi: UMBRELLA_ABI,
        functionName: "isReserveSlashable",
        args: [r],
      });
      pushD("deficitOffset", {
        address: AAVE_UMBRELLA as `0x${string}`,
        abi: UMBRELLA_ABI,
        functionName: "getDeficitOffset",
        args: [r],
      });
      pushD("pendingDeficit", {
        address: AAVE_UMBRELLA as `0x${string}`,
        abi: UMBRELLA_ABI,
        functionName: "getPendingDeficit",
        args: [r],
      });
    }
    if (wrapper && wrapperPool && wrapperAsset)
      pushD("wrapper.reserveData", {
        address: wrapperPool as `0x${string}`,
        abi: POOL_ABI,
        functionName: "getReserveData",
        args: [wrapperAsset as `0x${string}`],
      });
    if (wrapper && wrapperDecimals != null)
      pushD("wrapper.sharePrice", {
        address: wrapper as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [BigInt(10) ** BigInt(wrapperDecimals)],
      });
    // The third hop for a holder: their claim in wrapper units, converted by
    // the wrapper into the reserve's own units. Each leg is a call, and the
    // page states all three rather than the last one alone.
    const holderClaimRaw = c.get("holderClaim") as bigint | undefined;
    if (wrapper && holderClaimRaw != null && holderClaimRaw > ZERO)
      pushD("wrapper.holderClaim", {
        address: wrapper as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [holderClaimRaw],
      });

    const [dRes, shape] = await Promise.all([
      dPlan.length
        ? (client.multicall({
            contracts: dPlan.map((p) => p.call),
            batchSize: 0,
            allowFailure: true,
            blockNumber,
          }) as Promise<Call[]>)
        : Promise.resolve([] as Call[]),
      holderAddress
        ? readAaveVaultHolderShape(client, holderAddress, blockNumber, catalogue, address, gsmRoster)
        : Promise.resolve(null),
    ]);
    const d = new Map<string, unknown>(dPlan.map((p, i) => [p.kind, ok(dRes[i])]));

    // ── naming and scaling, once, over every distinct token ──────────────────
    const toName = new Set<string>();
    if (assetAddress) toName.add(assetAddress);
    if (reserveAddress) toName.add(reserveAddress);
    const tokens = await resolveErc20Meta([...toName], MAINNET_CHAIN_ID);
    const named = (addr: string | null): AaveVaultToken | null => {
      if (!addr) return null;
      const meta = tokens.get(addr);
      return {
        address: addr,
        symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        decimals: meta?.decimals ?? 18,
        named: Boolean(meta?.named),
      };
    };
    const asset = named(assetAddress) ?? { address: "", symbol: "not read", decimals: 18, named: false };
    const reserve = named(reserveAddress);
    const assetDecimals = asset.decimals;
    const reserveDecimals = reserve?.decimals ?? assetDecimals;

    const refFor = (addr: string | null): AaveVaultRef | null => {
      if (!addr) return null;
      const fam = catalogue.get(addr);
      return fam ? { address: addr, family: fam, symbol: null } : null;
    };
    const assetVault = refFor(assetAddress);
    if (assetVault && wrapper === assetAddress)
      assetVault.symbol = (c.get("wrapper.symbol") as string | undefined) ?? null;

    // The stake tokens that named THIS vault as their own asset, with what each
    // holds of it. A member that holds nothing is left out: the claim the page
    // makes is "these shares stand behind that token's holders", and a zero
    // balance stands behind nobody. Roster order, no ranking.
    const backedBy: AaveVaultBackedBy[] = [];
    for (const stk of stakeProbe) {
      if (lower(c.get(`stk.${stk}.asset`)) !== address) continue;
      const held = c.get(`stk.${stk}.balance`) as bigint | undefined;
      if (held == null || held <= ZERO) continue;
      backedBy.push({
        address: stk,
        family: "umbrella-stake",
        symbol: (c.get(`stk.${stk}.symbol`) as string | undefined) ?? null,
        shares: amount(held, shareDecimals ?? 18),
        fraction: totalSupplyRaw == null || totalSupplyRaw === ZERO ? 0 : Number(held) / Number(totalSupplyRaw),
      });
    }

    // ── the per-family readings ─────────────────────────────────────────────
    const totalAssets = maybeAmount(totalAssetsRaw, assetDecimals);
    const assetHeldRaw = c.get("assetHeld") as bigint | undefined;

    const sgho: AaveSghoReading | null =
      family !== "sgho"
        ? null
        : {
            targetRateBps: typeof b.get("targetRate") === "number" ? (b.get("targetRate") as number) : null,
            ratePerSecond: (b.get("ratePerSecond") as bigint | undefined)?.toString() ?? null,
            yieldIndex: (b.get("yieldIndex") as bigint | undefined)?.toString() ?? null,
            lastUpdate: b.get("lastUpdate") == null ? null : Number(b.get("lastUpdate") as bigint),
            paused: typeof b.get("paused") === "boolean" ? (b.get("paused") as boolean) : null,
            supplyCap: maybeAmount(b.get("supplyCap") as bigint | undefined, assetDecimals),
            remainingCapacity: maybeAmount(b.get("maxDeposit") as bigint | undefined, assetDecimals),
            assetHeld: maybeAmount(assetHeldRaw, assetDecimals),
            assetHeldGap:
              assetHeldRaw == null || totalAssetsRaw == null
                ? null
                : amount(assetHeldRaw - totalAssetsRaw, assetDecimals),
          };

    const reserveData = c.get("reserveData") as { liquidityIndex: bigint; aTokenAddress: string } | undefined;
    const aTokenBalanceRaw = c.get("aTokenBalance") as bigint | undefined;
    const stataReading: AaveStataReading | null =
      family !== "stata"
        ? null
        : {
            aToken: aTokenAddress,
            pool: stataPool,
            liquidityIndex: reserveData?.liquidityIndex?.toString() ?? null,
            poolAToken: reserveData?.aTokenAddress?.toLowerCase() ?? null,
            aTokenBalance: maybeAmount(aTokenBalanceRaw, assetDecimals),
            custodyGap:
              aTokenBalanceRaw == null || totalAssetsRaw == null
                ? null
                : amount(aTokenBalanceRaw - totalAssetsRaw, assetDecimals),
            rewardTokens: Array.isArray(b.get("rewardTokens"))
              ? (b.get("rewardTokens") as readonly string[]).map((a) => a.toLowerCase())
              : null,
          };

    const slashable = d.get("slashable") as readonly [boolean, bigint] | undefined;
    const wrapperReserveData = d.get("wrapper.reserveData") as { liquidityIndex: bigint } | undefined;
    const umbrella: AaveUmbrellaReading | null =
      family !== "umbrella-stake"
        ? null
        : {
            cooldownSeconds: b.get("getCooldown") == null ? null : Number(b.get("getCooldown") as bigint),
            unstakeWindowSeconds:
              b.get("getUnstakeWindow") == null ? null : Number(b.get("getUnstakeWindow") as bigint),
            maxSlashable: maybeAmount(b.get("getMaxSlashableAssets") as bigint | undefined, assetDecimals),
            minAssetsRemaining: maybeAmount(b.get("MIN_ASSETS_REMAINING") as bigint | undefined, assetDecimals),
            owner: lower(b.get("owner")),
            assetHeld: maybeAmount(assetHeldRaw, assetDecimals),
            reserve,
            reserveSlashable: slashable == null ? null : slashable[0],
            deficitOffset: maybeAmount(d.get("deficitOffset") as bigint | undefined, reserveDecimals),
            pendingDeficit: maybeAmount(d.get("pendingDeficit") as bigint | undefined, reserveDecimals),
            wrapper: wrapper
              ? {
                  address: wrapper,
                  symbol: (c.get("wrapper.symbol") as string | undefined) ?? null,
                  decimals: wrapperDecimals,
                  aToken: lower(c.get("wrapper.aToken")),
                  liquidityIndex: wrapperReserveData?.liquidityIndex?.toString() ?? null,
                  sharePrice: maybeAmount(d.get("wrapper.sharePrice") as bigint | undefined, reserveDecimals),
                  holderClaim: maybeAmount(d.get("wrapper.holderClaim") as bigint | undefined, reserveDecimals),
                }
              : null,
          };

    // ── the holder ──────────────────────────────────────────────────────────
    const cooldownStruct = b.get("stakerCooldown") as
      | { amount: bigint; endOfCooldown: number; withdrawalWindow: number }
      | undefined;
    const now = Number(block.timestamp);
    const holderReading: AaveVaultHolderReading | null = !holderAddress
      ? null
      : {
          address: holderAddress,
          shares: amount(holderShares, shareDecimals ?? 18),
          fraction:
            totalSupplyRaw == null || totalSupplyRaw === ZERO ? 0 : Number(holderShares) / Number(totalSupplyRaw),
          dust:
            holderShares > ZERO &&
            totalSupplyRaw != null &&
            totalSupplyRaw > ZERO &&
            Number(holderShares) / Number(totalSupplyRaw) < 0.000001,
          claim: maybeAmount(holderClaimRaw, assetDecimals),
          maxRedeem: maybeAmount(b.get("maxRedeem") as bigint | undefined, shareDecimals ?? 18),
          shape,
          catalogued: refFor(holderAddress),
          cooldown:
            cooldownStruct == null
              ? null
              : {
                  amount: amount(cooldownStruct.amount, shareDecimals ?? 18),
                  endOfCooldown: Number(cooldownStruct.endOfCooldown),
                  withdrawalWindow: Number(cooldownStruct.withdrawalWindow),
                  state:
                    cooldownStruct.amount === ZERO || Number(cooldownStruct.endOfCooldown) === 0
                      ? "none"
                      : now < Number(cooldownStruct.endOfCooldown)
                        ? "waiting"
                        : now < Number(cooldownStruct.endOfCooldown) + Number(cooldownStruct.withdrawalWindow)
                          ? "open"
                          : "expired",
                },
        };
    // A catalogued holder's symbol is the one thing about it worth naming, and
    // the shape read already asked for it.
    if (holderReading?.catalogued && holderReading.shape?.kind === "aave-vault")
      holderReading.catalogued.symbol = holderReading.shape.symbol;

    return {
      served: true,
      blockNumber: Number(blockNumber),
      blockTimestamp: now,
      chainStale: false,
      vault: {
        address,
        family,
        name: (b.get("name") as string | undefined) ?? null,
        symbol: (b.get("symbol") as string | undefined) ?? null,
        shareDecimals,
        asset,
        assetVault,
      },
      totalAssets,
      totalSupply: totalSupplyRaw == null || shareDecimals == null ? null : amount(totalSupplyRaw, shareDecimals),
      sharePrice: maybeAmount(c.get("sharePrice") as bigint | undefined, assetDecimals),
      sgho,
      stata: stataReading,
      umbrella,
      holder: holderReading,
      backedBy,
    };
  } catch (error) {
    console.error("Aave Ethereum vault chain read failed:", error);
    // Served is left TRUE on a failed read: the catalogue never answered, so
    // "this is not a vault" is not something this read established.
    return unread(address, true);
  }
}

/**
 * What the holding address IS, from a code read at the same pinned block.
 *
 * Every verdict is a read, not an inference from an ABI's shape: an empty code
 * answer is an externally owned account; a 23-byte `0xef0100…` code is the
 * EIP-7702 delegation indicator and nothing else; a catalogue member is one
 * because an enumerator returned it at this block; a Safe singleton address is
 * an exact match against a released deployment; `asset()` + `totalSupply()` is
 * a contract answering the ERC-4626 accessors; an implementation slot is a
 * pointer to another address to read. What is left is a contract with a size
 * and, sometimes, a name it gave itself. Nothing beyond that is claimed, and no
 * app is named from any of it.
 *
 * Returns null when the read throws: an absent shape renders as nothing, never
 * as an externally owned account.
 *
 * `vaultAddress` is the vault the reading is ABOUT, where there is one: it is
 * the only thing `assetIsVaultShares` compares against. The holder sweep across
 * the whole catalogue has no single vault to be about and passes none, so that
 * flag reads false there — which is correct, not a gap: nothing was compared.
 */
export async function readAaveVaultHolderShape(
  client: ReturnType<typeof chainBatchClient>,
  holder: string,
  blockNumber: bigint,
  catalogue: Map<string, AaveVaultFamily>,
  vaultAddress?: string,
  /** The naming ladder's enumerator rung: what `GsmRegistry.getGsmList()`
   *  answered at THIS block, read by the caller in its own roster request. An
   *  EMPTY SET IS NOT "no GSMs" — it is "nobody asked, or the registry did not
   *  answer", and the only cost is that such an address keeps the shape it would
   *  have had before the ladder existed. Rung 1, the published table, needs no
   *  argument: it is a lookup. */
  gsmRoster?: ReadonlySet<string>,
): Promise<AaveVaultHolderShape | null> {
  const address = holder as `0x${string}`;
  try {
    const code = await client.getCode({ address, blockNumber });
    if (!code || code === "0x") return { kind: "eoa", codeSize: 0 };
    const codeSize = (code.length - 2) / 2;

    const delegation = EIP7702_RE.exec(code);
    if (delegation) return { kind: "delegated-account", codeSize: 23, delegate: `0x${delegation[1].toLowerCase()}` };

    // A Safe deployed through the 1.4.1 factory is a minimal proxy whose
    // implementation IS the singleton, so this match is read off the code.
    const minimal = EIP1167_RE.exec(code);
    const minimalImpl = minimal ? `0x${minimal[1].toLowerCase()}` : null;
    if (minimalImpl && SAFE_SINGLETONS[minimalImpl])
      return {
        kind: "safe",
        codeSize,
        version: SAFE_SINGLETONS[minimalImpl],
        singleton: minimalImpl,
        evidence: "EIP-1167 code",
      };

    const [calls, slotZero, implSlot] = await Promise.all([
      client.multicall({
        contracts: (["name", "symbol", "asset", "totalSupply", "UNDERLYING_ASSET"] as const).map((functionName) => ({
          address,
          abi: HOLDER_ABI,
          functionName,
        })),
        allowFailure: true,
        blockNumber,
      }) as Promise<Call[]>,
      client.getStorageAt({ address, slot: SLOT_ZERO as `0x${string}`, blockNumber }),
      client.getStorageAt({ address, slot: EIP1967_IMPL_SLOT as `0x${string}`, blockNumber }),
    ]);
    const answeredName = (ok(calls[0]) as string | undefined) ?? null;
    const answeredSymbol = (ok(calls[1]) as string | undefined) ?? null;
    const answeredAsset = lower(ok(calls[2]));
    const answersSupply = ok(calls[3]) != null;

    const family = catalogue.get(holder);
    if (family)
      return {
        kind: "aave-vault",
        codeSize,
        family,
        symbol: answeredSymbol,
        asset: answeredAsset,
        assetIsVaultShares: answeredAsset === vaultAddress,
      };

    // ── THE NAMING LADDER — rung 1, then rung 2 ─────────────────────────────
    // A published constant first, then a contract the book names having returned
    // the address. Both are the OWNING PROTOCOL's own claim; neither is a
    // verified-source label, a deployer or a resemblance, and an address neither
    // answers for falls through to the shapes below exactly as before. The rule,
    // and the fixture that proves the refusal, are in
    // lib/shared/attested-addresses.ts.
    //
    // It sits here rather than at the top of the function for one reason: the
    // `UNDERLYING_ASSET()` answer above is what says WHY a named address holds
    // this vault, and a name without it would be a label on its own. The
    // EIP-1167 fast path does return earlier — a released Safe singleton in the
    // code is itself a published-registry claim (rung 3), so whichever of the two
    // answered, the page states a registry's word and not a guess.
    const attested = attestedAddress(holder) ?? (gsmRoster?.has(holder) ? attestedByGsmRegistry(holder) : null);
    if (attested) {
      const underlying = lower(ok(calls[4]));
      return {
        kind: "attested",
        codeSize,
        attested,
        underlying,
        underlyingIsVaultShares: underlying != null && underlying === vaultAddress,
      };
    }

    if (slotZero && slotZero !== SLOT_ZERO) {
      const singleton = last20(slotZero);
      if (SAFE_SINGLETONS[singleton])
        return { kind: "safe", codeSize, version: SAFE_SINGLETONS[singleton], singleton, evidence: "storage slot 0" };
    }

    if (answeredAsset && answeredAsset !== ZERO_ADDR && answersSupply)
      return {
        kind: "erc4626",
        codeSize,
        name: answeredName,
        symbol: answeredSymbol,
        asset: answeredAsset,
        assetIsVaultShares: answeredAsset === vaultAddress,
      };

    if (implSlot && implSlot !== SLOT_ZERO)
      return {
        kind: "erc1967-proxy",
        codeSize,
        implementation: last20(implSlot),
        slot: EIP1967_IMPL_SLOT,
        slotValue: implSlot,
      };

    if (minimalImpl) return { kind: "eip1167-proxy", codeSize, implementation: minimalImpl };

    return { kind: "contract", codeSize, name: answeredName, symbol: answeredSymbol };
  } catch (error) {
    console.error("Aave Ethereum vault holder code read failed:", error);
    return null;
  }
}
