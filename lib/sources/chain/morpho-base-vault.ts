// One MetaMorpho vault on Base, and one holder's attributed slice of it — read
// at ONE pinned block. SERVER-ONLY.
// ----------------------------------------------------------------------------
// A MetaMorpho vault pools depositors' asset (USDC, on the case-study vault) and
// a curator routes it into Morpho Blue markets. A depositor holds fungible vault
// SHARES; the vault holds supply positions in Blue. Nothing on chain records
// which depositor's asset went into which market, and nothing could: the deposits
// were pooled before they were allocated.
//
// So what this loader computes is an ATTRIBUTION, and it is worth naming exactly:
//
//     attributed(leg) = floor(holderShares × legAssets ÷ totalSupply)
//
// — the holder's share of the vault, applied to each of the vault's own Blue
// positions. Two holders with equal shares get equal figures whatever they
// deposited or when. It is not fund-tracing and it never claims to be; the page
// says so, and the receipts say so per figure.
//
// EVERY READ IS PINNED. `getBlockNumber()` runs once and every multicall after it
// carries that `blockNumber`. A vault figure read at block N against legs read at
// block N+3 would reconcile to a gap that is an artefact of the read, not a fact
// about the vault — and the gap is one of the things this page states.
//
// TWO THINGS THE ARITHMETIC MUST NOT SMOOTH OVER:
//
//  1. THE LEGS ARE STORED, THE VAULT'S OWN TOTAL IS NOT. A leg's assets come from
//     Blue's `market(id)` totals, which Blue only updates when a market is
//     TOUCHED — the same reason lib/sources/chain/morpho-markets.ts refuses to
//     accrue in view. MetaMorpho's `totalAssets()` extrapolates interest to the
//     block timestamp instead. The two therefore differ, always, and the page
//     states the difference as its own figure rather than picking a winner or
//     hiding it inside a rounding. On the case-study vault it is about 1.25 USDC
//     against 21.15M.
//  2. `lostAssets()` IS V1.1 ONLY. A V1.0 vault REVERTS on the call. Read through
//     `allowFailure`, a revert is `status: "failure"` and becomes `null` here —
//     "this vault family keeps no such ledger", which the page renders by
//     omitting the card. A zero would be a claim (a V1.1 vault answering 0 makes
//     exactly that claim), and the two must never render the same.
//
// The withdraw queue is the vault's own list of the markets it allocates to,
// including the IDLE market (no collateral token, no oracle, no IRM) that lets a
// vault hold cash inside Blue rather than outside it. An idle leg is labelled,
// not dropped: it is where the unallocated asset sits.

import { parseAbi } from "viem";
import { chainBatchClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import { MORPHO_BASE_BLUE, MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { type MorphoBaseVaultCatalogEntry, type MorphoBaseVaultFactory } from "@/lib/morpho-base/vault-catalog";
import { loadMorphoBaseVaultRoster, type MorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";

const ZERO = BigInt(0);
const TEN = BigInt(10);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const WAD = BigInt("1000000000000000000");

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function curator() view returns (address)",
  "function owner() view returns (address)",
  "function MORPHO() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function lastTotalAssets() view returns (uint256)",
  "function lostAssets() view returns (uint256)",
  "function withdrawQueueLength() view returns (uint256)",
  "function withdrawQueue(uint256) view returns (bytes32)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function DECIMALS_OFFSET() view returns (uint8)",
]);

const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

// ── what the holder address IS, read from its own code ───────────────────────
// The exposure section attributes a slice of the vault to an address, and most
// of the addresses holding a Base vault's shares are not wallets: on the
// case-study vault, measured at Base block 50,907,089, 846 of 5,751 holders had
// no code and the other 4,905 were contracts — a re-wrapping ERC-4626 at the
// top, 3,732 proxies sharing implementations, 377 Safes. Without this read the
// page reads a wrapper's exposure exactly as it reads a person's.
//
// EVIDENCE-FIRST, AND NO NAME IS INVENTED. Every verdict below rests on a read
// pinned to the same block as every other figure: the code itself, one storage
// slot, and calls the contract either answers or does not. What the loader will
// NOT do is infer a name from an ABI shape — "a 4337 smart account" is a guess
// about a shared implementation, not something the chain states, so a proxy is
// reported as a proxy TO A NAMED ADDRESS and the reader can follow it. The one
// name that travels is a name the contract answered itself (`name()`/`symbol()`)
// or one this repo's own vault census recorded.
//
// A REVERT IS AN ABSENCE. The optional calls go through `allowFailure`, so a
// contract that has no `asset()` is a contract with no `asset()` — never an
// error, and never a zero.

/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") − 1. */
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
/** Slot 0 — where a Gnosis Safe proxy keeps its singleton address. */
const SLOT_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
/** The EIP-1167 minimal-proxy runtime, implementation embedded at [10, 30). */
const EIP1167_RE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i;
/** The EIP-7702 delegation indicator: an account's code is EXACTLY 23 bytes,
 *  the three-byte prefix `0xef0100` followed by the 20-byte delegate. Anchored
 *  at both ends — 23 bytes is the whole of it, and a longer code that merely
 *  starts this way is not a delegation. */
const EIP7702_RE = /^0xef0100([0-9a-f]{40})$/i;

/** The Safe singletons a proxy can point at, by their released version. A Safe
 *  is proven by the address in its slot 0 (or embedded in its minimal-proxy
 *  bytecode) matching one of these — not by any guess about its ABI. */
const SAFE_SINGLETONS: Record<string, string> = {
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "1.3.0",
  "0x3e5c63644e683549055b9be8653de26e0b4cd36e": "1.3.0 L2",
  "0x41675c099f32341bf84bfc5382af534df5c7461a": "1.4.1",
  "0x29fcb43b46531bca003ddc8fcb67ffe91900c762": "1.4.1 L2",
};

const HOLDER_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function totalSupply() view returns (uint256)",
]);

/** The last 20 bytes of a 32-byte word, as a lowercased address. */
const last20 = (word: string) => `0x${word.slice(-40)}`.toLowerCase();

/** What the address the page is attributing to turned out to be, with the read
 *  each verdict rests on. A discriminated union: the page states one sentence
 *  per shape, and the evidence rides with it rather than being re-derived. */
export type MorphoBaseVaultHolderShape =
  /** `eth_getCode` came back empty at the pinned block. */
  | { kind: "eoa"; codeSize: 0 }
  /** EIP-7702: the code is the 23-byte delegation indicator, `0xef0100`
   *  followed by a delegate address. The account is still an externally owned
   *  account — a key controls it — and its code is the delegate's. */
  | { kind: "delegated-account"; codeSize: 23; delegate: string }
  /** In this repo's own Base vault census, so the name is the census's. */
  | {
      kind: "metamorpho-vault";
      codeSize: number;
      /** The census row's name. */
      name: string;
      symbol: string | null;
      /** `asset()` — a MetaMorpho is itself an ERC-4626. */
      asset: string | null;
      assetSymbol: string | null;
      assetIsVaultShares: boolean;
      assetIsVaultAsset: boolean;
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
      assetSymbol: string | null;
      /** Its asset is THIS vault's share token — it re-wraps this very vault. */
      assetIsVaultShares: boolean;
      /** Its asset is the same token this vault lends — a sibling wrapper. */
      assetIsVaultAsset: boolean;
    }
  /** The EIP-1967 implementation slot holds a non-zero address. */
  | { kind: "erc1967-proxy"; codeSize: number; implementation: string; slot: string; slotValue: string }
  /** The runtime code IS the EIP-1167 minimal proxy, implementation inline. */
  | { kind: "eip1167-proxy"; codeSize: number; implementation: string }
  /** Has code, and none of the above reads said anything more than that. */
  | { kind: "contract"; codeSize: number; name: string | null; symbol: string | null };

/** Raw integer + the same value scaled by its token's decimals. Both travel:
 *  the scaled number is what a page prints, the raw string is what a reader
 *  re-runs the eth_call against. */
export interface RawAmount {
  raw: string;
  value: number;
}

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  // Through Number twice rather than one division: an amount larger than
  // 2^53 in raw units still scales exactly enough for a display figure.
  value: Number(raw) / Math.pow(10, decimals),
});

export interface MorphoBaseVaultLeg {
  /** 0x market id — the withdraw-queue entry, and a key into Morpho Blue. */
  id: string;
  /** Position in the withdraw queue, 0-based — the vault's own ordering. */
  queueIndex: number;
  loanToken: string;
  collateralToken: string;
  /** Null on the idle market: there is no collateral side to name. */
  collateralSymbol: string | null;
  collateralNamed: boolean;
  /** The market's one rung, as a 0..1 fraction. Zero on an idle market. */
  lltv: number;
  /** True when the market has no collateral token, oracle or IRM — where a vault
   *  holds cash inside Blue rather than outside it. */
  isIdle: boolean;

  /** The vault's `supplyShares` in this market, from `position(id, vault)`. */
  supplyShares: string;
  /** The market's stored totals, from `market(id)` — the two legs of the ratio. */
  marketTotalSupplyAssets: string;
  marketTotalSupplyShares: string;
  /** The market's last settlement, as a unix second. */
  lastUpdate: number;

  /** supplyShares × totalSupplyAssets ÷ totalSupplyShares, floored, in the loan
   *  token's units. Zero when the market has no supply shares at all. */
  assets: RawAmount;
  /** This leg over Σ legs — 0..1. Null when Σ legs is zero. */
  shareOfAllocated: number | null;

  /** floor(holderShares × assets ÷ totalSupply). Null with no holder. */
  attributed: RawAmount | null;
}

export interface MorphoBaseVaultHolder {
  /** Checksum-free lowercased address, as read. */
  address: string;
  /** The holder's vault shares — `balanceOf`, in the vault's own share decimals. */
  shares: RawAmount;
  /** shares ÷ totalSupply as a display number (0..1). The exact ratio is the two
   *  raw integers beside it; this one is for printing a percentage. */
  fraction: number;
  /** True when the fraction rounds to nothing at the page's four-significant-
   *  figure precision but the balance is not zero — a dust holder, whose exact
   *  share count is the only truthful thing to print. */
  dust: boolean;
  /** `convertToAssets(shares)` — the VAULT's own answer for what these shares
   *  claim, not ours. It extrapolates like `totalAssets()` does. */
  claim: RawAmount;
  /** `maxWithdraw(holder)` — the vault's OWN answer for what this address can
   *  take out at this block, in the ASSET's units. It is not the claim: ERC-4626
   *  clamps it to what the markets in the withdraw queue actually hold at that
   *  block, so a vault whose legs are fully utilised answers less than the claim
   *  beside it, and a paused vault answers zero. Null when the call did not
   *  answer — an unread figure, stated as unread and never as a zero. */
  maxWithdraw: RawAmount | null;
  /** Σ over the legs of the attributed amounts. Not equal to `claim`: it is the
   *  holder's slice of the STORED leg totals, where `claim` is their slice of the
   *  vault's extrapolated one. */
  attributedTotal: RawAmount;
  /** What the address itself is, from a code read at the same pinned block.
   *  Null when that read did not answer — an unread shape is not a shape, and
   *  the page states nothing rather than guessing "wallet". */
  shape: MorphoBaseVaultHolderShape | null;
}

export interface MorphoBaseVaultResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** The block lib/morpho-base/vault-catalog.ts was censused at. */
  censusBlock: number;

  vault: {
    address: string;
    /** Read at `blockNumber`, not taken from the census — V1.1 vaults can be
     *  renamed by their owner and dozens have been. */
    name: string;
    symbol: string;
    /** The share token's own decimals (asset decimals + DECIMALS_OFFSET). */
    decimals: number;
    decimalsOffset: number | null;
    factory: MorphoBaseVaultFactory;
    createdBlock: number;
    asset: { address: string; symbol: string; decimals: number; named: boolean };
    /** Null when `curator()` is the zero address — the vault names no curator and
     *  the owner is the only party to state. */
    curator: string | null;
    owner: string;
    /** The Blue singleton the vault names as its own — read, never assumed. */
    morpho: string;
  };

  /** `totalAssets()` — the VAULT's own figure, interest extrapolated to the
   *  block timestamp. */
  totalAssets: RawAmount;
  /** `lastTotalAssets()` — what it was at the vault's last accrual. */
  lastTotalAssets: RawAmount;
  /** `lostAssets()` on V1.1; null where the family has no such ledger. */
  lostAssets: RawAmount | null;
  /** `totalSupply()` — every share in existence, in share decimals. */
  totalSupply: RawAmount;
  /** `convertToAssets(10^decimals)` — one whole share, in asset units. */
  sharePrice: RawAmount;
  /** Σ over the legs of each leg's stored assets. */
  allocated: RawAmount;
  /** totalAssets − Σ legs. Unaccrued interest (plus `lostAssets`, where the
   *  vault keeps one): the vault's own total extrapolates to the block, the legs
   *  are Blue's last settled state. Signed — it can be negative. */
  gap: RawAmount;

  legs: MorphoBaseVaultLeg[];
  holder: MorphoBaseVaultHolder | null;
}

/** The house stub: every figure zeroed and `chainStale` true, so a caller that
 *  forgets the flag renders zeros rather than a wrong number. The vault identity
 *  it carries is the CENSUS row — the one thing that did not need this read. */
function empty(vaultAddress: string, roster: MorphoBaseVaultRoster): MorphoBaseVaultResponse {
  const row: MorphoBaseVaultCatalogEntry | undefined = roster.byAddress.get(vaultAddress.toLowerCase());
  const zero = { raw: "0", value: 0 };
  return {
    blockNumber: 0,
    chainStale: true,
    censusBlock: roster.censusBlock,
    vault: {
      address: vaultAddress.toLowerCase(),
      name: row?.name ?? "",
      symbol: row?.symbol ?? "",
      decimals: 18,
      decimalsOffset: null,
      factory: row?.factory ?? "v1.1",
      createdBlock: row?.createdBlock ?? 0,
      asset: { address: row?.asset ?? ZERO_ADDR, symbol: "", decimals: 18, named: false },
      curator: null,
      owner: ZERO_ADDR,
      morpho: MORPHO_BASE_BLUE,
    },
    totalAssets: zero,
    lastTotalAssets: zero,
    lostAssets: null,
    totalSupply: zero,
    sharePrice: zero,
    allocated: zero,
    gap: zero,
    legs: [],
    holder: null,
  };
}

type MarketParamsTuple = readonly [string, string, string, string, bigint];
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
type PositionTuple = readonly [bigint, bigint, bigint];

interface Call {
  status: string;
  result?: unknown;
}
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

/**
 * What the holder address is, read at the SAME pinned block as every figure
 * beside it: `eth_getCode`, two `eth_getStorageAt` reads, and four optional
 * calls through `allowFailure`.
 *
 * The order the branches are tried in is the order of how much a read PROVES:
 * an empty code answer is a complete statement on its own; so is the 23-byte
 * EIP-7702 delegation indicator, which IS the delegate address; a census row is a
 * name this repo recorded; a Safe singleton address is an exact match against a
 * released deployment; `asset()` + `totalSupply()` is a contract answering the
 * ERC-4626 accessors; an implementation slot is a pointer to another address to
 * read. What is left is a contract with a size and, sometimes, a name it gave
 * itself. Nothing beyond that is claimed.
 *
 * `assetSymbol` comes back null here — naming a token is the house resolver's
 * job and the caller batches it with the vault's own. Returns null when the read
 * throws: an absent shape is rendered as nothing, never as an EOA.
 */
async function readHolderShape(
  client: ReturnType<typeof chainBatchClient>,
  holder: string,
  blockNumber: bigint,
  vaultAddress: string,
  vaultAsset: string,
): Promise<MorphoBaseVaultHolderShape | null> {
  const address = holder as `0x${string}`;
  try {
    const code = await client.getCode({ address, blockNumber });
    if (!code || code === "0x") return { kind: "eoa", codeSize: 0 };
    const codeSize = (code.length - 2) / 2;

    // EIP-7702 before every other branch that looks at code: the 23-byte
    // delegation indicator is a COMPLETE statement about the account, read off
    // the code itself with nothing inferred. Read after the branches below it
    // would be read as an anonymous contract with 23 bytes — which is how the
    // first Base holder census classified thousands of these accounts.
    const delegation = EIP7702_RE.exec(code);
    if (delegation) return { kind: "delegated-account", codeSize: 23, delegate: `0x${delegation[1].toLowerCase()}` };

    // A Safe deployed through the 1.4.1 factory is a minimal proxy whose
    // implementation IS the singleton, so this match is read off the code and
    // needs no storage read at all.
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
        contracts: (["name", "symbol", "asset", "totalSupply"] as const).map((functionName) => ({
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
    const answeredAsset = (ok(calls[2]) as string | undefined)?.toLowerCase() ?? null;
    const answersSupply = ok(calls[3]) != null;

    const row = (await loadMorphoBaseVaultRoster()).byAddress.get(holder.toLowerCase());
    if (row)
      return {
        kind: "metamorpho-vault",
        codeSize,
        name: row.name,
        symbol: answeredSymbol,
        asset: answeredAsset,
        assetSymbol: null,
        assetIsVaultShares: answeredAsset === vaultAddress,
        assetIsVaultAsset: answeredAsset === vaultAsset,
      };

    if (slotZero && slotZero !== SLOT_ZERO) {
      const singleton = last20(slotZero);
      if (SAFE_SINGLETONS[singleton])
        return {
          kind: "safe",
          codeSize,
          version: SAFE_SINGLETONS[singleton],
          singleton,
          evidence: "storage slot 0",
        };
    }

    if (answeredAsset && answeredAsset !== ZERO_ADDR && answersSupply)
      return {
        kind: "erc4626",
        codeSize,
        name: answeredName,
        symbol: answeredSymbol,
        asset: answeredAsset,
        assetSymbol: null,
        assetIsVaultShares: answeredAsset === vaultAddress,
        assetIsVaultAsset: answeredAsset === vaultAsset,
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
    console.error("Morpho Base vault holder code read failed:", error);
    return null;
  }
}

/** The address of the token a shape's `asset()` named, when it named one — the
 *  one extra address the caller's `resolveErc20Meta` batch has to carry. */
const shapeAssetAddress = (shape: MorphoBaseVaultHolderShape | null): string | null =>
  shape && (shape.kind === "erc4626" || shape.kind === "metamorpho-vault") ? shape.asset : null;

/** What a caller that is reading MORE than this one vault needs to say.
 *
 *  Both fields exist for a holder's reading of one vault,
 *  which reads every vault an address holds. It pins ONE block for the whole
 *  page and hands it down, so four vaults read side by side are four readings of
 *  the same moment rather than four moments; and it reads the holder's own code
 *  once for the page instead of once per vault, since what an address IS does
 *  not vary by which vault is being attributed. */
export interface LoadMorphoBaseVaultOptions {
  /** Read at this block instead of asking the node for its head. */
  blockNumber?: bigint;
  /** Leave `holder.shape` null: the caller has already read it, at this block. */
  skipHolderShape?: boolean;
}

/**
 * Read one MetaMorpho vault on Base at one pinned block, and — when `holder` is
 * given — that holder's proportional slice of every leg.
 *
 * `holder` must already be an address; ENS resolution belongs to the caller (the
 * route and the page both resolve before calling, so the loader has one input
 * shape and no network dependency of its own beyond Base).
 */
export async function loadMorphoBaseVault(
  vault: string,
  holder?: string,
  opts: LoadMorphoBaseVaultOptions = {},
): Promise<MorphoBaseVaultResponse> {
  const vaultAddress = vault.toLowerCase() as `0x${string}`;
  const roster = await loadMorphoBaseVaultRoster();
  const row = roster.byAddress.get(vaultAddress);
  try {
    const client = chainBatchClient(MORPHO_BASE_CHAIN_ID);
    // ONE block read; everything after it is pinned to it. A caller reading
    // several vaults as one page pins the block itself and passes it in, so the
    // vaults it stacks are one reading rather than several.
    const blockNumber = opts.blockNumber ?? (await client.getBlockNumber());

    const scalars = [
      "name",
      "symbol",
      "decimals",
      "asset",
      "curator",
      "owner",
      "MORPHO",
      "totalAssets",
      "totalSupply",
      "lastTotalAssets",
      "lostAssets",
      "withdrawQueueLength",
      "DECIMALS_OFFSET",
    ] as const;
    const head = (await client.multicall({
      contracts: scalars.map((functionName) => ({ address: vaultAddress, abi: VAULT_ABI, functionName })),
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const at = (name: (typeof scalars)[number]) => ok(head[scalars.indexOf(name)]);

    const name = at("name") as string | undefined;
    const assetAddress = (at("asset") as string | undefined)?.toLowerCase();
    const totalAssetsRaw = at("totalAssets") as bigint | undefined;
    const totalSupplyRaw = at("totalSupply") as bigint | undefined;
    const queueLength = at("withdrawQueueLength") as bigint | undefined;
    // Four reads that no MetaMorpho can refuse. Missing one means the address is
    // not answering as a vault at this block, and nothing below would be true.
    if (name == null || assetAddress == null || totalAssetsRaw == null || totalSupplyRaw == null || queueLength == null)
      return empty(vaultAddress, roster);

    const shareDecimals = Number((at("decimals") as number | bigint | undefined) ?? 18);
    const curatorRaw = (at("curator") as string | undefined)?.toLowerCase() ?? ZERO_ADDR;
    // `lostAssets` REVERTS on V1.0 — a failure here is "no such ledger", never 0.
    const lostAssetsRaw = at("lostAssets") as bigint | undefined;

    // The withdraw queue: the vault's own list of the markets it allocates to.
    const queue = (await client.multicall({
      contracts: Array.from({ length: Number(queueLength) }, (_, i) => ({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "withdrawQueue",
        args: [BigInt(i)],
      })),
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const ids = queue.map((r) => ok(r) as string | undefined).filter((id): id is string => typeof id === "string");

    // Per leg: the market's immutable params, its stored totals, and the VAULT's
    // own position in it. One multicall, all at the pinned block.
    const blue = MORPHO_BASE_BLUE as `0x${string}`;
    const legReads = (await client.multicall({
      contracts: ids.flatMap((id) => [
        { address: blue, abi: BLUE_ABI, functionName: "idToMarketParams", args: [id as `0x${string}`] },
        { address: blue, abi: BLUE_ABI, functionName: "market", args: [id as `0x${string}`] },
        { address: blue, abi: BLUE_ABI, functionName: "position", args: [id as `0x${string}`, vaultAddress] },
      ]),
      allowFailure: true,
      blockNumber,
    })) as Call[];

    // The holder's balance and the vault's own answer for what it claims — the
    // same block again, and `convertToAssets` only when there is a balance to ask
    // about (a zero-share holder needs no second call to be told it claims zero).
    let holderShares: bigint | null = null;
    let holderClaim = ZERO;
    let holderMaxWithdrawRaw: bigint | null = null;
    let holderShape: MorphoBaseVaultHolderShape | null = null;
    const holderAddress = holder?.toLowerCase();
    if (holderAddress) {
      // What the address IS, at the same block as what it holds. A separate
      // read, and a separate statement: a zero balance and a wrapper's balance
      // are both facts about an address whose shape the page states either way.
      // Skipped where the caller has already made it for the same address at
      // the same block — the answer would be identical, and the page that reads
      // several vaults at once states it once.
      holderShape = opts.skipHolderShape
        ? null
        : await readHolderShape(client, holderAddress, blockNumber, vaultAddress, assetAddress);
      // `maxWithdraw` rides the balance call rather than opening a request of
      // its own: both are one-argument reads of this vault at this block, and
      // the strip on the card states them side by side. It sits HERE and not in
      // the `convertToAssets` batch below because that batch only runs for a
      // positive balance — and "this address can withdraw nothing" is a reading
      // an address holding nothing is entitled to as much as any other.
      const bal = (await client.multicall({
        contracts: [
          {
            address: vaultAddress,
            abi: VAULT_ABI,
            functionName: "balanceOf",
            args: [holderAddress as `0x${string}`],
          },
          {
            address: vaultAddress,
            abi: VAULT_ABI,
            functionName: "maxWithdraw",
            args: [holderAddress as `0x${string}`],
          },
        ],
        allowFailure: true,
        blockNumber,
      })) as Call[];
      holderShares = (ok(bal[0]) as bigint | undefined) ?? null;
      holderMaxWithdrawRaw = (ok(bal[1]) as bigint | undefined) ?? null;
      if (holderShares != null && holderShares > ZERO) {
        const conv = (await client.multicall({
          contracts: [{ address: vaultAddress, abi: VAULT_ABI, functionName: "convertToAssets", args: [holderShares] }],
          allowFailure: true,
          blockNumber,
        })) as Call[];
        holderClaim = (ok(conv[0]) as bigint | undefined) ?? ZERO;
      }
    }

    // One whole share, in asset units — the vault's own conversion, not a ratio
    // of ours, so it carries the same extrapolation `totalAssets()` does.
    const priceRead = (await client.multicall({
      contracts: [
        {
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: "convertToAssets",
          args: [TEN ** BigInt(shareDecimals)],
        },
      ],
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const sharePriceRaw = (ok(priceRead[0]) as bigint | undefined) ?? ZERO;

    // Name the asset and every collateral leg through the house resolver.
    const collateralTokens = ids
      .map((_, i) => (ok(legReads[i * 3]) as MarketParamsTuple | undefined)?.[1]?.toLowerCase())
      .filter((a): a is string => typeof a === "string" && a !== ZERO_ADDR);
    // The holder shape's own `asset()` rides in the same batch: a re-wrapper's
    // asset is named with the same resolver every other token here is.
    const shapeAsset = shapeAssetAddress(holderShape);
    const meta = await resolveErc20Meta(
      [assetAddress, ...collateralTokens, ...(shapeAsset && shapeAsset !== vaultAddress ? [shapeAsset] : [])],
      MORPHO_BASE_CHAIN_ID,
    );
    const assetMeta = meta.get(assetAddress);
    const assetDecimals = assetMeta?.decimals ?? 18;

    // ── the legs ────────────────────────────────────────────────────────────
    const raw: { leg: Omit<MorphoBaseVaultLeg, "shareOfAllocated" | "attributed">; assetsRaw: bigint }[] = [];
    ids.forEach((id, i) => {
      const params = ok(legReads[i * 3]) as MarketParamsTuple | undefined;
      const market = ok(legReads[i * 3 + 1]) as MarketTuple | undefined;
      const position = ok(legReads[i * 3 + 2]) as PositionTuple | undefined;
      if (!params || !market || !position) return;
      const collateralToken = params[1].toLowerCase();
      const supplyShares = position[0];
      const [totalSupplyAssets, totalSupplyShares, , , lastUpdate] = market;
      // Blue's own share→asset conversion on the STORED totals. No accrual: this
      // is the market's last settled state, which is what `market(id)` holds.
      const assetsRaw = totalSupplyShares === ZERO ? ZERO : (supplyShares * totalSupplyAssets) / totalSupplyShares;
      const coll = collateralToken === ZERO_ADDR ? undefined : meta.get(collateralToken);
      raw.push({
        assetsRaw,
        leg: {
          id,
          queueIndex: i,
          loanToken: params[0].toLowerCase(),
          collateralToken,
          collateralSymbol: coll?.symbol ?? null,
          collateralNamed: Boolean(coll?.named),
          lltv: Number((params[4] * BigInt(1_000_000)) / WAD) / 1_000_000,
          isIdle: collateralToken === ZERO_ADDR && params[2].toLowerCase() === ZERO_ADDR,
          supplyShares: supplyShares.toString(),
          marketTotalSupplyAssets: totalSupplyAssets.toString(),
          marketTotalSupplyShares: totalSupplyShares.toString(),
          lastUpdate: Number(lastUpdate),
          assets: amount(assetsRaw, assetDecimals),
        },
      });
    });

    const allocatedRaw = raw.reduce((s, r) => s + r.assetsRaw, ZERO);
    const shares = holderShares ?? ZERO;
    const legs: MorphoBaseVaultLeg[] = raw.map(({ leg, assetsRaw }) => ({
      ...leg,
      shareOfAllocated: allocatedRaw === ZERO ? null : Number(assetsRaw) / Number(allocatedRaw),
      attributed:
        holderShares == null
          ? null
          : // floor, in raw units — the same integer arithmetic anyone can re-run.
            amount(totalSupplyRaw === ZERO ? ZERO : (shares * assetsRaw) / totalSupplyRaw, assetDecimals),
    }));

    const attributedTotalRaw = legs.reduce((s, l) => s + BigInt(l.attributed?.raw ?? "0"), ZERO);
    const fraction = totalSupplyRaw === ZERO ? 0 : Number(shares) / Number(totalSupplyRaw);

    // The one thing the shape read could not name itself: the token its own
    // `asset()` pointed at. THIS vault's share token when the holder re-wraps
    // this very vault (the symbol is already in hand), and otherwise whatever
    // the house resolver read — null where it read nothing, so the page names a
    // token or names none, never a truncated address dressed as a symbol.
    const vaultSymbol = (at("symbol") as string | undefined) ?? "";
    const shape: MorphoBaseVaultHolderShape | null =
      holderShape && (holderShape.kind === "erc4626" || holderShape.kind === "metamorpho-vault")
        ? {
            ...holderShape,
            assetSymbol: holderShape.assetIsVaultShares
              ? vaultSymbol || null
              : holderShape.asset
                ? ((meta.get(holderShape.asset)?.named ? meta.get(holderShape.asset)?.symbol : null) ?? null)
                : null,
          }
        : holderShape;

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      censusBlock: roster.censusBlock,
      vault: {
        address: vaultAddress,
        name,
        symbol: vaultSymbol,
        decimals: shareDecimals,
        decimalsOffset: at("DECIMALS_OFFSET") == null ? null : Number(at("DECIMALS_OFFSET") as number | bigint),
        factory: row?.factory ?? "v1.1",
        createdBlock: row?.createdBlock ?? 0,
        asset: {
          address: assetAddress,
          symbol: assetMeta?.symbol ?? assetAddress.slice(0, 6),
          decimals: assetDecimals,
          named: Boolean(assetMeta?.named),
        },
        curator: curatorRaw === ZERO_ADDR ? null : curatorRaw,
        owner: (at("owner") as string | undefined)?.toLowerCase() ?? ZERO_ADDR,
        morpho: (at("MORPHO") as string | undefined)?.toLowerCase() ?? MORPHO_BASE_BLUE,
      },
      totalAssets: amount(totalAssetsRaw, assetDecimals),
      lastTotalAssets: amount((at("lastTotalAssets") as bigint | undefined) ?? ZERO, assetDecimals),
      lostAssets: lostAssetsRaw == null ? null : amount(lostAssetsRaw, assetDecimals),
      totalSupply: amount(totalSupplyRaw, shareDecimals),
      sharePrice: amount(sharePriceRaw, assetDecimals),
      allocated: amount(allocatedRaw, assetDecimals),
      gap: amount(totalAssetsRaw - allocatedRaw, assetDecimals),
      legs,
      holder:
        holderShares == null || holderAddress == null
          ? null
          : {
              address: holderAddress,
              shares: amount(holderShares, shareDecimals),
              fraction,
              // Below one part in a million the percentage prints as 0.0000% at
              // four significant figures, which reads as "nothing" for a balance
              // that is not nothing. The page states the exact share count instead.
              dust: holderShares > ZERO && fraction < 1e-6,
              claim: amount(holderClaim, assetDecimals),
              maxWithdraw: holderMaxWithdrawRaw == null ? null : amount(holderMaxWithdrawRaw, assetDecimals),
              attributedTotal: amount(attributedTotalRaw, assetDecimals),
              shape,
            },
    };
  } catch (error) {
    console.error("Morpho Base vault chain read failed:", error);
    return empty(vaultAddress, roster);
  }
}

/**
 * What ONE address is, read from its own code at a given block — the same read
 * `loadMorphoBaseVault` makes, with no vault to relate the answer to.
 *
 * A holder's reading of one vault states the shape once
 * for the whole page: an address's code does not vary by which vault is being
 * attributed, so reading it per vault would be the same answer four times over.
 * That page then passes `skipHolderShape` down to every per-vault read.
 *
 * WHAT IT CANNOT SAY, AND DOES NOT. The two "is this token the vault's own?"
 * flags are relative to a vault, and there is no single vault here, so both are
 * stated false rather than computed against an arbitrary one. A wrapper's asset
 * is still NAMED (the house resolver reads its symbol) — what is dropped is only
 * the claim that it is or is not this-vault's-shares, which the caller has no
 * vault to make.
 */
export async function loadMorphoBaseHolderShape(
  holder: string,
  blockNumber: bigint,
): Promise<MorphoBaseVaultHolderShape | null> {
  const client = chainBatchClient(MORPHO_BASE_CHAIN_ID);
  // ZERO_ADDR for both vault operands: neither flag can be true against it, and
  // no MetaMorpho or ERC-4626 answers the zero address from `asset()`.
  const shape = await readHolderShape(client, holder.toLowerCase(), blockNumber, ZERO_ADDR, ZERO_ADDR);
  if (!shape || (shape.kind !== "erc4626" && shape.kind !== "metamorpho-vault")) return shape;
  const assetAddress = shape.asset;
  if (!assetAddress) return shape;
  const meta = (await resolveErc20Meta([assetAddress], MORPHO_BASE_CHAIN_ID)).get(assetAddress);
  return {
    ...shape,
    assetSymbol: meta?.named ? (meta.symbol ?? null) : null,
    assetIsVaultShares: false,
    assetIsVaultAsset: false,
  };
}
