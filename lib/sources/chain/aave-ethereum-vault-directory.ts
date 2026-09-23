// Aave's whole vault layer on Ethereum, read at ONE pinned block — the directory
// behind /ethereum/aave/vaults. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The sibling on Base (morpho-base-vault-directory.ts) reads a roster that was
// censused off logs months ago and is a FLOOR. This one asks the protocol who
// its vaults are, at the same block it asks them what they hold:
//
//   1. `STATA_FACTORY.getStataTokens()` — the whole static-aToken family;
//   2. `UMBRELLA.getStkTokens()`        — the whole Umbrella stake-token family;
//   3. `GhoEthereum.SGHO`               — one address the book names, no
//      enumerator exists and none is needed.
//
// So the row set is complete AT THE READ BLOCK by construction, and there is no
// second block anywhere in the reading: no census block to state beside the read
// block, and no window in which a vault deployed yesterday is missing.
//
// THE SHAPE OF THE READ. One `eth_blockNumber`, then THREE Multicall3 requests,
// every call pinned to that block:
//
//   A  the two enumerators (2 calls);
//   B  `name/symbol/decimals/asset/totalAssets/totalSupply` on each vault
//      (6 × ~18 = ~108 calls);
//   C  `convertToAssets(one whole share)` on each vault, plus each family's own
//      mechanic reads (~45 calls).
//
// B before C is not a stylistic choice: C's argument comes from B (see the
// decimals note below), and the stake tokens' reserves come from B's `asset()`
// hops. `batchSize: 0` on each keeps the request count a fact about the code
// rather than a viem heuristic.
//
// ⚠️ THE SHARE PRICE'S EXPONENT IS READ, NEVER ASSUMED. The Base loader
// hard-codes `convertToAssets(10^18)` because MetaMorpho's `DECIMALS_OFFSET`
// pins every one of its share tokens to 18 decimals. AAVE'S DO NOT: at the time
// of writing waEthUSDC, waEthUSDT, waEthPYUSD, waEthUSDG, waEthEURC,
// stkwaEthUSDC and stkwaEthUSDT answer 6, waEthWBTC answers 8, and the rest 18.
// `convertToAssets` is linear, so the argument decides the units of the answer:
// `convertToAssets(10^18)` on a 6-decimal vault returns the rate times 1e18 —
// printing that against the asset's six decimals overstates the share price by
// a factor of 1e12. Every row therefore raises ten to ITS OWN `decimals()`, read
// at the same block; a vault whose `decimals()` did not answer gets NO share
// price rather than a guessed one.
//
// WHAT EACH FAMILY ALSO READS — the mechanic the directory states per row, each
// leg its own call at the same block, each in the contract's own units:
//
//   • sgho    — `targetRate()` (basis points, as stored) and `supplyCap()` (GHO).
//     Neither is annualised into what a holder earns; that is a forecast, and
//     the chain-truth gate refuses it.
//   • stata   — `aToken()`, the one aToken this wrapper wraps. The wrapper's
//     share price IS that reserve's liquidity index in the Core Pool, which is
//     why an EMPTY stata vault still answers a share price well clear of parity.
//   • umbrella — `getCooldown()` and `getUnstakeWindow()` on the token, and
//     `Umbrella.isReserveSlashable(reserve)` on the reserve the token covers.
//     The reserve is derived by hopping the token's `asset()`: three of the four
//     stake tokens hold a STATA token, whose own `asset()` is the reserve, and
//     stkGHO holds GHO directly. `getStakeTokenData()` is NOT used for this —
//     its first word is not the asset for stkGHO.
//
// NO PER-HOLDER FIGURE OF ANY KIND, and no amount at risk: `isReserveSlashable`
// is rendered as the contract's own answer about a reserve, never multiplied by
// anyone's balance. That multiplication is a projection of an event that has not
// happened.
//
// CACHED FOR FIVE MINUTES, WITH THE BLOCK STATED — the same contract the Base
// directory keeps: the page prints the block the cached reading describes, and a
// failed read is returned stale and NOT cached.
//
// NO USD anywhere. A stake token's `latestAnswer()` is a USD oracle price and is
// deliberately not read: this section states native units only.

import { unstable_cache } from "next/cache";
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

const ZERO = BigInt(0);

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
]);

const MECHANIC_ABI = parseAbi([
  // stata
  "function aToken() view returns (address)",
  // umbrella stake token
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
  // Umbrella itself, about a reserve
  "function isReserveSlashable(address reserve) view returns (bool, uint256)",
  // sGHO
  "function targetRate() view returns (uint16)",
  "function supplyCap() view returns (uint160)",
]);

const META_CALLS = ["name", "symbol", "decimals", "asset", "totalAssets", "totalSupply"] as const;

/** How long a directory reading is served before it is re-read: five minutes.
 *  The page states the block it was read at, so a cached reading is never
 *  passed off as the head. */
export const AAVE_VAULT_DIRECTORY_REVALIDATE_SECONDS = 300;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface AaveEthereumVaultRow {
  /** Lowercased vault address — the row's identity. */
  address: string;
  family: AaveVaultFamily;
  /** `name()` at the block. Null when the call did not answer. */
  name: string | null;
  /** `symbol()` at the block — the share token's own ticker. */
  symbol: string | null;
  /** The SHARE token's `decimals()` at the block: the exponent the share price
   *  is asked for, and the scale `totalSupply` is printed at. Null when the call
   *  did not answer — and then there is no share price either. */
  shareDecimals: number | null;
  /** The ERC-4626 underlying (`asset()`), named and scaled through the house
   *  resolver. For a stake token this is ANOTHER VAULT (a stata token, or GHO
   *  for stkGHO), which is why the row states the hop rather than printing the
   *  last hop's symbol against the first hop's amount. */
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  /** `totalAssets()` at the block, in the asset's units. Null = unread. */
  totalAssets: RawAmount | null;
  /** `totalSupply()` at the block, in the SHARE token's own decimals. */
  totalSupply: RawAmount | null;
  /** `convertToAssets(10 ** shareDecimals)` — one whole share, in the asset's
   *  units. Null when it or `decimals()` did not answer. */
  sharePrice: RawAmount | null;
  /** stata: the one aToken this wrapper wraps (`aToken()`). */
  aToken: string | null;
  /** umbrella: `getCooldown()`, in seconds. */
  cooldownSeconds: number | null;
  /** umbrella: `getUnstakeWindow()`, in seconds. */
  unstakeWindowSeconds: number | null;
  /** umbrella: the reserve this stake token covers, hopped from `asset()`. */
  reserve: { address: string; symbol: string } | null;
  /** umbrella: `Umbrella.isReserveSlashable(reserve)`'s first word. False is a
   *  reading — no deficit is outstanding — and never an absence. */
  reserveSlashable: boolean | null;
  /** sgho: `targetRate()`, in basis points exactly as stored. */
  targetRateBps: number | null;
  /** sgho: `supplyCap()`, in GHO. */
  supplyCap: RawAmount | null;
}

export interface AaveEthereumVaultDirectoryResponse {
  /** The block the roster AND every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** How many vaults the two enumerators plus sGHO answered at that block. */
  catalogSize: number;
  /** How many of them each enumerator answered — the counts the denominator
   *  paragraph states, so the page never restates a length as a claim about a
   *  call it did not make. */
  stataCount: number;
  stakeCount: number;
  /** When this reading was taken, ISO-8601 UTC. */
  readAt: string;
  /** One row per vault, in the order the enumerators answered (sGHO first). */
  rows: AaveEthereumVaultRow[];
}

function empty(): AaveEthereumVaultDirectoryResponse {
  return {
    blockNumber: 0,
    chainStale: true,
    catalogSize: 0,
    stataCount: 0,
    stakeCount: 0,
    readAt: new Date().toISOString(),
    rows: [],
  };
}

const SGHO = AAVE_ETHEREUM_BOOK_VAULTS.find((v) => v.family === "sgho")!.address;

async function readDirectory(): Promise<AaveEthereumVaultDirectoryResponse> {
  try {
    const client = chainBatchClient(MAINNET_CHAIN_ID);
    // ONE block read; the roster and every figure below are pinned to it.
    const blockNumber = await client.getBlockNumber();

    // ── A: who the vaults are, answered by Aave's own contracts ──────────────
    const roster = (await client.multicall({
      contracts: [
        { address: AAVE_STATA_FACTORY as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStataTokens" },
        { address: AAVE_UMBRELLA as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStkTokens" },
      ],
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const stata = (ok(roster[0]) as readonly string[] | undefined)?.map((a) => a.toLowerCase());
    const stake = (ok(roster[1]) as readonly string[] | undefined)?.map((a) => a.toLowerCase());
    // An enumerator that did not answer is not a short roster — it is no
    // roster. The whole reading is stale rather than quietly missing a family.
    if (!stata || !stake) {
      console.error("Aave Ethereum vault directory: an enumerator did not answer at block", blockNumber.toString());
      return empty();
    }

    const vaults: { address: string; family: AaveVaultFamily }[] = [
      { address: SGHO, family: "sgho" },
      ...stata.map((address) => ({ address, family: "stata" as const })),
      ...stake.map((address) => ({ address, family: "umbrella-stake" as const })),
    ];

    // ── B: what each vault says about itself ─────────────────────────────────
    const meta = (await client.multicall({
      contracts: vaults.flatMap((v) =>
        META_CALLS.map((functionName) => ({
          address: v.address as `0x${string}`,
          abi: VAULT_ABI,
          functionName,
        })),
      ),
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const at = (i: number, call: (typeof META_CALLS)[number]) =>
      ok(meta[i * META_CALLS.length + META_CALLS.indexOf(call)]);

    const shareDecimals = vaults.map((_, i) => {
      const d = at(i, "decimals");
      return typeof d === "number" ? d : null;
    });
    const assets = vaults.map((_, i) => (at(i, "asset") as string | undefined)?.toLowerCase() ?? null);
    const byAddress = new Map(vaults.map((v, i) => [v.address, i]));

    /** The reserve a stake token covers: its `asset()` is a stata token whose
     *  own `asset()` is the reserve — except stkGHO, which holds GHO itself. */
    const reserveOf = (i: number): string | null => {
      const asset = assets[i];
      if (!asset) return null;
      const inner = byAddress.get(asset);
      return inner != null && vaults[inner].family === "stata" ? assets[inner] : asset;
    };

    // ── C: one whole share, and each family's mechanic ───────────────────────
    // Built as a list of (row index, kind) so a failure lands back on the row
    // that asked for it rather than on a position in a flat array.
    const contracts: ContractFunctionParameters[] = [];
    const plan: { row: number; kind: string }[] = [];
    vaults.forEach((v, i) => {
      const dec = shareDecimals[i];
      if (dec != null) {
        contracts.push({
          address: v.address as `0x${string}`,
          abi: VAULT_ABI,
          functionName: "convertToAssets",
          args: [BigInt(10) ** BigInt(dec)],
        });
        plan.push({ row: i, kind: "sharePrice" });
      }
      if (v.family === "stata") {
        contracts.push({ address: v.address as `0x${string}`, abi: MECHANIC_ABI, functionName: "aToken" });
        plan.push({ row: i, kind: "aToken" });
      }
      if (v.family === "umbrella-stake") {
        contracts.push({ address: v.address as `0x${string}`, abi: MECHANIC_ABI, functionName: "getCooldown" });
        plan.push({ row: i, kind: "cooldown" });
        contracts.push({ address: v.address as `0x${string}`, abi: MECHANIC_ABI, functionName: "getUnstakeWindow" });
        plan.push({ row: i, kind: "unstakeWindow" });
        const reserve = reserveOf(i);
        if (reserve) {
          contracts.push({
            address: AAVE_UMBRELLA as `0x${string}`,
            abi: MECHANIC_ABI,
            functionName: "isReserveSlashable",
            args: [reserve as `0x${string}`],
          });
          plan.push({ row: i, kind: "slashable" });
        }
      }
      if (v.family === "sgho") {
        contracts.push({ address: v.address as `0x${string}`, abi: MECHANIC_ABI, functionName: "targetRate" });
        plan.push({ row: i, kind: "targetRate" });
        contracts.push({ address: v.address as `0x${string}`, abi: MECHANIC_ABI, functionName: "supplyCap" });
        plan.push({ row: i, kind: "supplyCap" });
      }
    });
    const mech = (await client.multicall({
      contracts,
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const extra = new Map<string, Call>(plan.map((p, i) => [`${p.row}:${p.kind}`, mech[i]]));
    const answered = (row: number, kind: string) => ok(extra.get(`${row}:${kind}`));

    // Name and scale every distinct asset once, and every reserve with it — the
    // reserve is named in the row's own mechanic sentence.
    const named = new Set<string>();
    assets.forEach((a) => a && named.add(a));
    vaults.forEach((v, i) => {
      if (v.family !== "umbrella-stake") return;
      const r = reserveOf(i);
      if (r) named.add(r);
    });
    const tokens = await resolveErc20Meta([...named], MAINNET_CHAIN_ID);

    const rows: AaveEthereumVaultRow[] = vaults.map((v, i) => {
      const assetAddress = assets[i];
      const assetMeta = assetAddress ? tokens.get(assetAddress) : undefined;
      const assetDecimals = assetMeta?.decimals ?? 18;
      const dec = shareDecimals[i];
      const totalAssetsRaw = at(i, "totalAssets") as bigint | undefined;
      const totalSupplyRaw = at(i, "totalSupply") as bigint | undefined;
      const sharePriceRaw = answered(i, "sharePrice") as bigint | undefined;
      const cooldown = answered(i, "cooldown") as bigint | undefined;
      const unstakeWindow = answered(i, "unstakeWindow") as bigint | undefined;
      const slashable = answered(i, "slashable") as readonly [boolean, bigint] | undefined;
      const targetRate = answered(i, "targetRate") as number | undefined;
      const supplyCap = answered(i, "supplyCap") as bigint | undefined;
      const reserveAddress = v.family === "umbrella-stake" ? reserveOf(i) : null;
      const reserveMeta = reserveAddress ? tokens.get(reserveAddress) : undefined;
      return {
        address: v.address,
        family: v.family,
        name: (at(i, "name") as string | undefined) ?? null,
        symbol: (at(i, "symbol") as string | undefined) ?? null,
        shareDecimals: dec,
        asset: {
          address: assetAddress ?? "",
          symbol: assetMeta?.symbol ?? (assetAddress ? assetAddress.slice(0, 6) : "not read"),
          decimals: assetDecimals,
          named: Boolean(assetMeta?.named),
        },
        totalAssets: totalAssetsRaw == null ? null : amount(totalAssetsRaw, assetDecimals),
        totalSupply: totalSupplyRaw == null || dec == null ? null : amount(totalSupplyRaw, dec),
        sharePrice: sharePriceRaw == null ? null : amount(sharePriceRaw, assetDecimals),
        aToken: ((answered(i, "aToken") as string | undefined) ?? null)?.toLowerCase() ?? null,
        cooldownSeconds: cooldown == null ? null : Number(cooldown),
        unstakeWindowSeconds: unstakeWindow == null ? null : Number(unstakeWindow),
        reserve:
          reserveAddress == null
            ? null
            : { address: reserveAddress, symbol: reserveMeta?.symbol ?? reserveAddress.slice(0, 6) },
        reserveSlashable: slashable == null ? null : slashable[0],
        targetRateBps: targetRate == null ? null : Number(targetRate),
        supplyCap: supplyCap == null ? null : amount(supplyCap, assetDecimals),
      };
    });

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      catalogSize: rows.length,
      stataCount: stata.length,
      stakeCount: stake.length,
      readAt: new Date().toISOString(),
      rows,
    };
  } catch (error) {
    console.error("Aave Ethereum vault directory chain read failed:", error);
    return empty();
  }
}

/** Is this reading usable? A stale one must not be cached for five minutes —
 *  the next request should try the chain again. */
const isReadable = (d: AaveEthereumVaultDirectoryResponse) =>
  !d.chainStale && d.rows.length > 0 && d.rows.some((r) => r.totalAssets != null && BigInt(r.totalAssets.raw) >= ZERO);

const cachedDirectory = unstable_cache(readDirectory, ["aave-ethereum-vault-directory"], {
  revalidate: AAVE_VAULT_DIRECTORY_REVALIDATE_SECONDS,
});

/**
 * Every vault Aave's own enumerators name on Ethereum, at one pinned block,
 * cached for five minutes. A failed read is returned stale and NOT cached.
 */
export async function loadAaveEthereumVaultDirectory(): Promise<AaveEthereumVaultDirectoryResponse> {
  const cached = await cachedDirectory();
  if (isReadable(cached)) return cached;
  return readDirectory();
}
