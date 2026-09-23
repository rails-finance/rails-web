// Every catalogued MetaMorpho vault on Base, read at ONE pinned block — the
// roster behind /base/morpho/vaults. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The two sibling loaders answer questions about one address (a holder's slice
// of one vault; a holder's vaults across the census). This one has no address
// in it at all: it reads the census ITSELF — name, `totalAssets()`,
// `totalSupply()`, `curator()` and `owner()` on all 505 catalogued vaults — so
// the section's front door can list what the catalogue holds, grouped by asset
// and ordered by size, with every figure a slot read at one stated block.
//
// THE SHAPE OF THE READ. One `eth_blockNumber`, then SIX calls per vault
// batched through Multicall3 in DIRECTORY_REQUESTS chunks, all at that block,
// in parallel. The holder sweep beside this one does 505 × `balanceOf` in two
// requests; this is six calls per vault and one of them — `totalAssets()` —
// walks the vault's whole supply queue, so the chunks are smaller to keep each
// request's gas well inside what a node will serve. Then one `resolveErc20Meta`
// over the 54 distinct asset addresses, which is cached for the life of the
// process after the first call.
//
// THE SIXTH CALL is `convertToAssets(10^18)` — what one whole SHARE converts to,
// in the vault's asset. The exponent is fixed at 18, not read per vault: every
// MetaMorpho vault's share token answers 18 to its own `decimals()` for every
// asset this catalog holds (≤18 decimals — true of all 54), because MetaMorpho's
// `DECIMALS_OFFSET` pads a lower-decimal asset up to 18 and adds nothing to one
// already at 18. `totalSupply` above already assumes this (`amount(_, 18)`); this
// read keeps the same assumption rather than adding a seventh call to confirm it
// per vault. Same call as the per-vault page's `vaultSharePriceProv`.
//
// CACHED FOR FIVE MINUTES, WITH THE BLOCK STATED. The directory is the same
// question for every reader and it is the section's most expensive read, so it
// goes through Next's data cache (`unstable_cache`, revalidate 300s) and the
// page prints the block the cached reading was taken at — a reader who lands on
// a four-minute-old directory is told which block it describes. The holder
// lookup on the same page is NOT cached: it is per address, and stays a read
// at the head on every request.
//
// THREE THINGS A ROW KEEPS APART, because the page draws them differently:
//
//   • a vault whose `totalAssets()` answered zero — an EMPTY vault, a reading
//     ("this vault holds nothing at this block") that the page collapses into
//     a trailing group but still lists;
//   • a vault whose read did not answer — `totalAssets: null`, an ABSENCE the
//     page states as unread rather than drawing a dash or a zero for;
//   • a vault whose `curator()` is the zero address — no curator is named, and
//     the page labels the `owner()` it falls back to as the owner, never as a
//     curator nobody holds.
//
// NO NAMES BUT THE VAULT'S OWN. The vault's `name()` is read live (V1.1 owners
// can rename), and it is the only name on a row: the curator and owner are
// addresses, because nothing on chain attests who they are and the page does
// not invent it. NO USD: `totalAssets()` is stated in the vault's own asset,
// and vaults are grouped by asset so no two quantities of different things are
// ever placed in one ordered list.

import { unstable_cache } from "next/cache";
import { parseAbi } from "viem";
import { chainBatchClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import type { RawAmount } from "./morpho-base-vault";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { type MorphoBaseVaultFactory } from "@/lib/morpho-base/vault-catalog";
import { loadMorphoBaseVaultRoster, type MorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const DIRECTORY_ABI = parseAbi([
  "function name() view returns (string)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function curator() view returns (address)",
  "function owner() view returns (address)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const CALLS = ["name", "totalAssets", "totalSupply", "curator", "owner", "convertToAssets"] as const;

/** One whole share, in the vault's own 18-decimal share units — see the header
 *  note on why the exponent is fixed rather than read per vault. */
const ONE_SHARE = BigInt(10) ** BigInt(18);

/** How many Multicall3 requests the census is split across. Ten of ~50 vaults
 *  (~250 calls each) keeps a request's gas — dominated by `totalAssets()`
 *  walking up to twenty legs per vault — well inside a node's `eth_call` cap;
 *  `batchSize: 0` stops viem splitting further on its own size heuristic, so
 *  the count is a fact about the code. */
const DIRECTORY_REQUESTS = 10;

/** How long a directory reading is served before it is re-read: five minutes.
 *  The page states the block it was read at, so a cached reading is never
 *  passed off as the head. */
export const DIRECTORY_REVALIDATE_SECONDS = 300;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

export interface MorphoBaseVaultDirectoryRow {
  /** Lowercased vault address — the row's identity and its page's route. */
  address: string;
  factory: MorphoBaseVaultFactory;
  createdBlock: number;
  /** `name()` read at the pinned block. Null when the call did not answer —
   *  the page then shows the census snapshot, labelled as such. */
  name: string | null;
  /** The name the census recorded at its own block — a labelled snapshot. */
  censusName: string;
  /** The ERC-4626 underlying (`asset()`, immutable, from the catalog), named
   *  and scaled through the house resolver. */
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  /** `totalAssets()` at the pinned block, in the asset's units. Null when the
   *  call did not answer — an unread vault, never a zero. */
  totalAssets: RawAmount | null;
  /** `totalSupply()` at the pinned block — every share in existence. Null when
   *  the call did not answer. */
  totalSupply: RawAmount | null;
  /** `convertToAssets(10^18)` at the pinned block — one whole share, in the
   *  asset's units. Null when the call did not answer. NO USD: a quantity of
   *  the vault's own asset, exactly as `totalAssets` is. */
  sharePrice: RawAmount | null;
  /** `curator()`, or null when it is the zero address (no curator named) or
   *  the call did not answer. */
  curator: string | null;
  /** `owner()`, or null when the call did not answer. */
  owner: string | null;
}

export interface MorphoBaseVaultDirectoryResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** The block the roster was read at: the box's last run
   *  (lib/morpho-base/vault-roster.ts), or the baked catalogue's census. */
  censusBlock: number;
  /** How many vaults the census holds — the row count when the read answered. */
  catalogSize: number;
  /** When this reading was taken, ISO-8601 UTC — so a cached directory can say
   *  how old it is beside the block it names. */
  readAt: string;
  /** One row per catalogued vault, in the catalog's own (creation) order; the
   *  page groups and orders them. */
  rows: MorphoBaseVaultDirectoryRow[];
}

function empty(r: MorphoBaseVaultRoster): MorphoBaseVaultDirectoryResponse {
  return {
    blockNumber: 0,
    chainStale: true,
    censusBlock: r.censusBlock,
    catalogSize: r.vaults.length,
    readAt: new Date().toISOString(),
    rows: [],
  };
}

async function readDirectory(): Promise<MorphoBaseVaultDirectoryResponse> {
  const served = await loadMorphoBaseVaultRoster();
  const roster = served.vaults;
  try {
    const client = chainBatchClient(MORPHO_BASE_CHAIN_ID);
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
            { address: v.address as `0x${string}`, abi: DIRECTORY_ABI, functionName: "name" },
            { address: v.address as `0x${string}`, abi: DIRECTORY_ABI, functionName: "totalAssets" },
            { address: v.address as `0x${string}`, abi: DIRECTORY_ABI, functionName: "totalSupply" },
            { address: v.address as `0x${string}`, abi: DIRECTORY_ABI, functionName: "curator" },
            { address: v.address as `0x${string}`, abi: DIRECTORY_ABI, functionName: "owner" },
            {
              address: v.address as `0x${string}`,
              abi: DIRECTORY_ABI,
              functionName: "convertToAssets",
              args: [ONE_SHARE],
            },
          ]),
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        }),
      ),
    )) as Call[][];

    // Name and scale every distinct asset once, through the same resolver the
    // per-vault page uses — so the directory and the page it links to print
    // the same symbol and the same decimals for one token.
    const meta = await resolveErc20Meta([...new Set(roster.map((v) => v.asset))], MORPHO_BASE_CHAIN_ID);

    const rows: MorphoBaseVaultDirectoryRow[] = [];
    chunks.forEach((chunk, c) =>
      chunk.forEach((vault, i) => {
        const at = (name: (typeof CALLS)[number]) => ok(results[c][i * CALLS.length + CALLS.indexOf(name)]);
        const assetMeta = meta.get(vault.asset);
        const decimals = assetMeta?.decimals ?? 18;
        const totalAssetsRaw = at("totalAssets") as bigint | undefined;
        const totalSupplyRaw = at("totalSupply") as bigint | undefined;
        const sharePriceRaw = at("convertToAssets") as bigint | undefined;
        const curatorRaw = (at("curator") as string | undefined)?.toLowerCase();
        const ownerRaw = (at("owner") as string | undefined)?.toLowerCase();
        rows.push({
          address: vault.address,
          factory: vault.factory,
          createdBlock: vault.createdBlock,
          name: (at("name") as string | undefined) ?? null,
          censusName: vault.name,
          asset: {
            address: vault.asset,
            symbol: assetMeta?.symbol ?? vault.asset.slice(0, 6),
            decimals,
            named: Boolean(assetMeta?.named),
          },
          totalAssets: totalAssetsRaw == null ? null : amount(totalAssetsRaw, decimals),
          totalSupply: totalSupplyRaw == null ? null : amount(totalSupplyRaw, 18),
          sharePrice: sharePriceRaw == null ? null : amount(sharePriceRaw, decimals),
          curator: curatorRaw == null || curatorRaw === ZERO_ADDR ? null : curatorRaw,
          owner: ownerRaw ?? null,
        });
      }),
    );

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      censusBlock: served.censusBlock,
      catalogSize: roster.length,
      readAt: new Date().toISOString(),
      rows,
    };
  } catch (error) {
    console.error("Morpho Base vault directory chain read failed:", error);
    return empty(served);
  }
}

/** Is any row's `totalAssets` a real figure? A stale reading must not be
 *  cached for five minutes — the next request should try the chain again. */
const isReadable = (d: MorphoBaseVaultDirectoryResponse) =>
  !d.chainStale && d.rows.some((r) => r.totalAssets != null && BigInt(r.totalAssets.raw) >= ZERO);

const cachedDirectory = unstable_cache(readDirectory, ["morpho-base-vault-directory"], {
  revalidate: DIRECTORY_REVALIDATE_SECONDS,
});

/**
 * Every catalogued vault on Base at one pinned block, cached for five minutes.
 * A failed read is returned stale and NOT cached — `unstable_cache` would
 * otherwise serve the failure for the whole window — so a reader after a blip
 * gets a fresh attempt.
 */
export async function loadMorphoBaseVaultDirectory(): Promise<MorphoBaseVaultDirectoryResponse> {
  const cached = await cachedDirectory();
  if (isReadable(cached)) return cached;
  return readDirectory();
}
