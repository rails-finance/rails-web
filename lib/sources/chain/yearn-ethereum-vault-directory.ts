// Every vault the Yearn V3 factories made on Ethereum, read at ONE pinned block
// — the roster behind /ethereum/yearn/vaults. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The catalogue (lib/yearn/vault-catalog.ts) says which contracts exist and what
// cannot change about them. This loader says what they hold right now: for each
// of the 247 catalogued vaults its live `name()`, `totalAssets()`, one whole
// share through `convertToAssets()`, whether it is shut down, and whether Yearn
// endorses it — every call answered at one block, which the page prints.
//
// ENDORSEMENT IS A READING, NOT A PROPERTY. `Registry.isEndorsed(vault)` on
// `0xff31…a3Af` is read here per vault rather than baked into the catalogue,
// because Yearn can remove an endorsement: the badge is only ever true "at block
// N" and the page states N beside it (rails-ops decision 0027 point 5 and call
// 1). Two things that look like the roster are not, and neither is read here —
// `Registry.getAllEndorsedVaults()` answers the endorsed subset mixed with
// tokenized strategies no factory made, and `Registry.releaseRegistry()` returns
// a pointer that knows three of the five factories.
//
// ONE WHOLE SHARE IS `convertToAssets(10 ** decimals)`, and the exponent is the
// ASSET's decimals rather than a fixed 18: a Yearn V3 vault's share token
// answers its asset's own `decimals()`, and the census proved it for all 247
// (it refuses to write when a vault's `decimals()` disagrees with its asset's).
// This roster holds assets at 6, 8, 9 and 18 decimals, so a fixed 18 would print
// a USDC vault's share price a trillion times over.
//
// THE ASSET'S SYMBOL AND DECIMALS COME FROM THE CATALOGUE, not from a second
// read. The census read both from chain and checked the decimals against every
// vault that uses the asset; decimals cannot move, and a symbol that did would
// be a snapshot either way. That is 72 calls this loader does not make.
//
// THREE THINGS A ROW KEEPS APART, because the page draws them differently:
//
//   • a vault whose `totalAssets()` answered zero — an EMPTY vault, a reading
//     ("this vault holds nothing at this block") the page collapses into a
//     trailing group but still lists;
//   • a vault whose read did not answer — `totalAssets: null`, an ABSENCE the
//     page states as unread rather than drawing a dash or a zero for;
//   • a vault whose `isEndorsed()` did not answer — `endorsed: null`, which is
//     not `false`: an unread badge is no badge and no claim either way.
//
// CACHED FOR FIVE MINUTES, WITH THE BLOCK STATED, and a failed read is never
// cached — the same contract the Base roster's loader keeps.

import { unstable_cache } from "next/cache";
import { parseAbi } from "viem";
import { chainBatchClient } from "./rpc";
import type { RawAmount } from "./morpho-base-vault";
import { YEARN_REGISTRY } from "@/lib/yearn/vault-catalog";
import { loadYearnVaultRoster, type YearnVaultRoster } from "@/lib/yearn/vault-roster";

/** Yearn V3 is deployed on Ethereum mainnet; this loader reads no other chain. */
export const YEARN_CHAIN_ID = 1;

const ZERO = BigInt(0);

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function isShutdown() view returns (bool)",
]);
const REGISTRY_ABI = parseAbi(["function isEndorsed(address) view returns (bool)"]);

/** How many Multicall3 requests the roster is split across. Five of ~50 vaults
 *  (~250 calls each) keeps a request's gas — dominated by `totalAssets()`, which
 *  walks each vault's default queue — inside what a node will serve;
 *  `batchSize: 0` stops viem splitting further on its own size heuristic, so the
 *  count is a fact about the code. */
const DIRECTORY_REQUESTS = 5;

/** How long a roster reading is served before it is re-read: five minutes. The
 *  page states the block it was read at, so a cached reading is never passed off
 *  as the head. */
export const YEARN_DIRECTORY_REVALIDATE_SECONDS = 300;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface YearnVaultDirectoryRow {
  /** Lowercased vault address — the row's identity and its page's route. */
  address: string;
  /** The factory that made it, lowercased — immutable, from the catalogue. */
  factory: string;
  /** That factory's release, which is the vault's own `apiVersion()`. A string:
   *  a release added after the bake arrives through the served roster. */
  apiVersion: string;
  createdBlock: number;
  /** `name()` read at the pinned block. Null when the call did not answer — the
   *  page then shows the census snapshot, labelled as such. 3.0.4 and 3.1.0
   *  vaults answer `setName`, so the live name and the snapshot can differ. */
  name: string | null;
  /** The name the census recorded at its own block — a labelled snapshot. */
  censusName: string;
  /** `symbol()` at the census block. A snapshot, as `censusName` is. */
  censusSymbol: string;
  /** The ERC-4626 underlying (`asset()`, immutable), named and scaled by the
   *  census. `named` is false where `symbol()` did not decode as a string. */
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  /** `totalAssets()` at the pinned block, in the asset's units. Null when the
   *  call did not answer — an unread vault, never a zero. */
  totalAssets: RawAmount | null;
  /** `convertToAssets(10 ** decimals)` at the pinned block — one whole share, in
   *  the asset's units. Null when the call did not answer. NO USD: a quantity of
   *  the vault's own asset, exactly as `totalAssets` is. */
  sharePrice: RawAmount | null;
  /** `isShutdown()` at the pinned block: the vault takes no more deposits and
   *  its strategies are being wound down. Null when the call did not answer. */
  shutdown: boolean | null;
  /** `Registry.isEndorsed(vault)` at the pinned block — the only thing that
   *  earns the Yearn mark and the "endorsed" badge on a row (rails-ops decision
   *  0027 call 1). Null when the call did not answer, which is not false. */
  endorsed: boolean | null;
}

export interface YearnVaultDirectoryResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** The block lib/yearn/vault-catalog.ts was censused at. */
  censusBlock: number;
  /** When that census block was mined, ISO-8601 UTC. */
  censusBlockIso: string;
  /** How many vaults the census holds — the row count when the read answered. */
  catalogSize: number;
  /** When this reading was taken, ISO-8601 UTC — so a cached roster can say how
   *  old it is beside the block it names. */
  readAt: string;
  /** One row per catalogued vault, in the catalogue's own (creation) order; the
   *  page groups and orders them. */
  rows: YearnVaultDirectoryRow[];
}

function empty(r: YearnVaultRoster): YearnVaultDirectoryResponse {
  return {
    blockNumber: 0,
    chainStale: true,
    censusBlock: r.censusBlock,
    censusBlockIso: r.censusBlockIso,
    catalogSize: r.vaults.length,
    readAt: new Date().toISOString(),
    rows: [],
  };
}

async function readDirectory(): Promise<YearnVaultDirectoryResponse> {
  const served = await loadYearnVaultRoster();
  const roster = served.vaults;
  try {
    const client = chainBatchClient(YEARN_CHAIN_ID);
    // ONE block read; every call below is pinned to it.
    const blockNumber = await client.getBlockNumber();

    const size = Math.ceil(roster.length / DIRECTORY_REQUESTS);
    const chunks = Array.from({ length: DIRECTORY_REQUESTS }, (_, i) => roster.slice(i * size, (i + 1) * size)).filter(
      (c) => c.length > 0,
    );
    const results = (await Promise.all(
      chunks.map((chunk) =>
        client.multicall({
          contracts: chunk.flatMap((v) => [
            { address: v.address as `0x${string}`, abi: VAULT_ABI, functionName: "name" },
            { address: v.address as `0x${string}`, abi: VAULT_ABI, functionName: "totalAssets" },
            {
              address: v.address as `0x${string}`,
              abi: VAULT_ABI,
              functionName: "convertToAssets",
              args: [BigInt(10) ** BigInt(v.asset.decimals)],
            },
            { address: v.address as `0x${string}`, abi: VAULT_ABI, functionName: "isShutdown" },
            {
              address: YEARN_REGISTRY as `0x${string}`,
              abi: REGISTRY_ABI,
              functionName: "isEndorsed",
              args: [v.address as `0x${string}`],
            },
          ]),
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        }),
      ),
    )) as Call[][];

    const PER = 5;
    const rows: YearnVaultDirectoryRow[] = [];
    chunks.forEach((chunk, c) =>
      chunk.forEach((vault, i) => {
        const at = (offset: number) => ok(results[c][i * PER + offset]);
        const decimals = vault.asset.decimals;
        const totalAssetsRaw = at(1) as bigint | undefined;
        const sharePriceRaw = at(2) as bigint | undefined;
        const shutdown = at(3) as boolean | undefined;
        const endorsed = at(4) as boolean | undefined;
        rows.push({
          address: vault.address,
          factory: vault.factory,
          apiVersion: vault.apiVersion,
          createdBlock: vault.createdBlock,
          name: (at(0) as string | undefined) ?? null,
          censusName: vault.name,
          censusSymbol: vault.symbol,
          asset: {
            address: vault.asset.address,
            symbol: vault.asset.symbol ?? vault.asset.address.slice(0, 6),
            decimals,
            named: vault.asset.symbol != null,
          },
          totalAssets: totalAssetsRaw == null ? null : amount(totalAssetsRaw, decimals),
          sharePrice: sharePriceRaw == null ? null : amount(sharePriceRaw, decimals),
          shutdown: shutdown ?? null,
          endorsed: endorsed ?? null,
        });
      }),
    );

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      censusBlock: served.censusBlock,
      censusBlockIso: served.censusBlockIso,
      catalogSize: roster.length,
      readAt: new Date().toISOString(),
      rows,
    };
  } catch (error) {
    console.error("Yearn vault roster chain read failed:", error);
    return empty(served);
  }
}

/** Is any row's `totalAssets` a real figure? A stale reading must not be cached
 *  for five minutes — the next request should try the chain again. */
const isReadable = (d: YearnVaultDirectoryResponse) =>
  !d.chainStale && d.rows.some((r) => r.totalAssets != null && BigInt(r.totalAssets.raw) >= ZERO);

const cachedDirectory = unstable_cache(readDirectory, ["yearn-ethereum-vault-directory"], {
  revalidate: YEARN_DIRECTORY_REVALIDATE_SECONDS,
});

/**
 * Every catalogued Yearn V3 vault on Ethereum at one pinned block, cached for
 * five minutes. A failed read is returned stale and NOT cached —
 * `unstable_cache` would otherwise serve the failure for the whole window — so a
 * reader after a blip gets a fresh attempt.
 */
export async function loadYearnEthereumVaultDirectory(): Promise<YearnVaultDirectoryResponse> {
  const cached = await cachedDirectory();
  if (isReadable(cached)) return cached;
  return readDirectory();
}
