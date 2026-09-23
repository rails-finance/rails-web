// One address, across every catalogued MetaMorpho vault on Base — read at ONE
// pinned block. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The sibling loader beside this one (morpho-base-vault.ts) answers "what is
// this address's slice of THIS vault". It needs a vault first, and the question
// people actually arrive with is the other way round: enter an address, and be
// told where it stands. That is what this file reads.
//
// THE SHAPE OF THE READ, and why it costs so little:
//
//   1. one `eth_blockNumber` — the block everything below is pinned to;
//   2. TWO Multicall3 requests: `balanceOf(holder)` on all 505 catalogued
//      vaults, split in half, at that block;
//   3. for each vault that came back non-zero, the SAME read the per-vault page
//      makes (`loadMorphoBaseVault`), at THE SAME block — a handful of calls per
//      vault, four vaults at a time;
//   4. one code read on the holder itself, for what the address is.
//
// So an address holding four vaults is two multicalls plus four vaults' worth of
// the read the per-vault page already makes, and nothing at all touches the
// indexed backend: no table, no worker, no box. An address holding none is two
// multicalls and one code read, and stops there.
//
// THE ROSTER IS A FLOOR, AND THE PAGE SAYS SO. The sweep can only ask vaults the
// census knows (lib/morpho-base/vault-catalog.ts: every vault the two MetaMorpho
// factories deployed up to the census block). A vault deployed without a factory
// emits no `CreateMetaMorpho`, is in no registry, and is therefore absent from
// the sweep — a holding in one would not appear here and nothing in this read
// could notice it. "Vaults held: 4 of 505 catalogued" is exactly that statement
// and never "4 vaults held on Base".
//
// NO TOTAL ACROSS ASSETS. A holding of USDC and a holding of WETH are amounts of
// two different things, and adding them would need a price this page does not
// read and does not want. The attributed sums are therefore grouped BY ASSET,
// one total per asset, and there is no figure summing the groups.
//
// A SECOND, CHEAPER SHAPE — `?summary=1` on the API route, `loadMorphoBaseHolderSummary`
// below. It exists for one caller: the wallet page's client-side vault note
// (components/protocol/morpho-base/vault-holdings-note.tsx), which only ever
// needs to say WHICH vaults, never the attributed slice of each. So it stops
// after the sweep — the same two Multicall3 requests, nothing else: no
// per-vault legs (`loadMorphoBaseVault`), no holder-shape read. `sweepHolderBalances`
// is the one sweep both this function and the full loader below run, so the
// two Multicall3 requests are written once. A held vault's share-token
// `decimals()` rides in the SAME two requests (one more call per vault, not
// one more request), which is what lets the summary state a scaled share
// count without a third round trip. The asset symbol is a static reverse
// lookup against `BASE_TOKEN_ADDRESSES` (zero chain reads) rather than
// `resolveErc20Meta` — the full loader's own per-vault read still resolves it
// properly for the figures that page states as fact; the summary's `asset`
// is a label on a note, not a receipted figure.

import { parseAbi } from "viem";
import { chainBatchClient } from "./rpc";
import {
  loadMorphoBaseHolderShape,
  loadMorphoBaseVault,
  type MorphoBaseVaultHolderShape,
  type MorphoBaseVaultResponse,
  type RawAmount,
} from "./morpho-base-vault";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { loadMorphoBaseVaultRoster, type MorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";
import { BASE_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.base";

const ZERO = BigInt(0);

const SWEEP_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/** The sweep goes out in exactly two requests. Splitting the roster in half is
 *  what makes that true; `batchSize: 0` is what stops viem from splitting it
 *  further on its own size heuristic. */
const SWEEP_REQUESTS = 2;
/** How many held vaults are read at once. Each is a handful of calls, and a
 *  wallet across a dozen vaults should not open a dozen fans of them at once. */
const VAULT_CONCURRENCY = 4;

/** address → symbol, inverted once from the generated Base token map — the
 *  same 50-odd majors and long-tail names the token-chip CDN lookup uses the
 *  other way round. No chain read: a miss just means this particular asset
 *  isn't in that generated list, not that it has no symbol. */
const ASSET_SYMBOL_BY_ADDRESS = new Map<string, string>(
  Object.entries(BASE_TOKEN_ADDRESSES).map(([symbol, addr]) => [addr.toLowerCase(), symbol]),
);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const assetSymbolOf = (address: string): string => ASSET_SYMBOL_BY_ADDRESS.get(address.toLowerCase()) ?? short(address);

/** One catalogued vault the address holds a non-zero share balance of, from
 *  the sweep alone. */
interface SweptHolderVault {
  address: string;
  name: string;
  symbol: string;
  assetAddress: string;
  balance: bigint;
  /** The share token's own `decimals()`, read in the SAME request as the
   *  balance above (one more call, not one more request). Falls back to 18 —
   *  the decimals every catalogued vault seen so far answers with — only when
   *  the call itself failed, so a genuinely different share-decimals vault is
   *  still read correctly and this is never silently wrong for one that
   *  answered. */
  shareDecimals: number;
}

/** THE sweep: `balanceOf(holder)` and `decimals()` on every catalogued vault,
 *  in exactly two Multicall3 requests, at one pinned block. Both the summary
 *  loader and the full loader below call this — the one place either of them
 *  reads the census, so "two requests" is a fact about one function rather
 *  than two copies of it. Returns only the vaults that answered non-zero. */
async function sweepHolderBalances(
  client: ReturnType<typeof chainBatchClient>,
  address: `0x${string}`,
  blockNumber: bigint,
): Promise<SweptHolderVault[]> {
  const roster = (await loadMorphoBaseVaultRoster()).vaults;
  const size = Math.ceil(roster.length / SWEEP_REQUESTS);
  const chunks = Array.from({ length: SWEEP_REQUESTS }, (_, i) => roster.slice(i * size, (i + 1) * size)).filter(
    (c) => c.length > 0,
  );
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        client.multicall({
          contracts: chunk.flatMap((v) => [
            {
              address: v.address as `0x${string}`,
              abi: SWEEP_ABI,
              functionName: "balanceOf" as const,
              args: [address] as const,
            },
            { address: v.address as `0x${string}`, abi: SWEEP_ABI, functionName: "decimals" as const },
          ]),
          // One eth_call per chunk: viem's own size-based splitting off, so
          // "two requests" is a fact about the code and not a hope about it.
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        }) as Promise<{ status: string; result?: unknown }[]>,
    ),
  );
  // A vault that REVERTED on balanceOf answered nothing, which is not a zero —
  // but it is also not a holding, and there is no balance to attribute. It is
  // left out the same way a zero is; the census count on the page is the
  // number asked, so a reader can see the sweep's reach either way.
  const held: SweptHolderVault[] = [];
  chunks.forEach((chunk, c) =>
    chunk.forEach((vault, i) => {
      const bal = results[c][i * 2];
      const dec = results[c][i * 2 + 1];
      if (bal?.status === "success" && (bal.result as bigint) > ZERO) {
        held.push({
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          assetAddress: vault.asset,
          balance: bal.result as bigint,
          shareDecimals: dec?.status === "success" ? Number(dec.result as number | bigint) : 18,
        });
      }
    }),
  );
  return held;
}

/** One vault the address holds, read exactly as its own page reads it. Every
 *  vault this loader can find comes from the catalog sweep below, and every
 *  catalogued vault has its own exposure page — so there is no "not served"
 *  case to carry here; it is dropped where the loader last had it. */
export interface MorphoBaseHolderVaultRow {
  /** The per-vault read, at this page's pinned block, with the holder. */
  read: MorphoBaseVaultResponse;
}

/** The attributed sum for ONE asset, over the vaults denominated in it. */
export interface MorphoBaseHolderAssetTotal {
  address: string;
  symbol: string;
  decimals: number;
  /** False where the house resolver could not read a symbol — the page then
   *  prints the address rather than a symbol nobody read. */
  named: boolean;
  /** How many held vaults are denominated in this asset. */
  vaults: number;
  /** Σ over those vaults of the holder's attributed amount. */
  total: RawAmount;
}

export interface MorphoBaseHolderExposureResponse {
  /** The block every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** The block lib/morpho-base/vault-catalog.ts was censused at. */
  censusBlock: number;
  /** How many vaults the sweep asked — the census roster's size. */
  catalogSize: number;
  /** The address read, lowercased. */
  holder: string;
  /** What the address is, from one code read at the pinned block. Null when
   *  that read did not answer: an unread shape is stated as nothing. */
  shape: MorphoBaseVaultHolderShape | null;
  /** The vaults holding a non-zero balance, largest attributed sum first. */
  vaults: MorphoBaseHolderVaultRow[];
  /** One entry per distinct asset across those vaults. Never summed together. */
  assetTotals: MorphoBaseHolderAssetTotal[];
}

function empty(holder: string, r: MorphoBaseVaultRoster): MorphoBaseHolderExposureResponse {
  return {
    blockNumber: 0,
    chainStale: true,
    censusBlock: r.censusBlock,
    catalogSize: r.vaults.length,
    holder: holder.toLowerCase(),
    shape: null,
    vaults: [],
    assetTotals: [],
  };
}

/** One catalogued vault the summary states — a name and an asset label, never
 *  the attributed slice inside it (that needs the per-vault legs the summary
 *  does not read). */
export interface MorphoBaseHolderSummaryVault {
  address: string;
  name: string;
  symbol: string;
  asset: { symbol: string };
  /** The holder's share-token balance — the sweep's own read, not an
   *  attribution. `value` is scaled by the vault's own `decimals()` read in
   *  the same request; see `SweptHolderVault.shareDecimals`. */
  shares: RawAmount;
}

export interface MorphoBaseHolderSummaryResponse {
  /** The block the sweep read at. 0 with `chainStale: true` on a failed read. */
  blockNumber: number;
  chainStale: boolean;
  /** The block lib/morpho-base/vault-catalog.ts was censused at. */
  censusBlock: number;
  /** The census roster's size — the sweep asked exactly this many. */
  catalogued: number;
  /** The address read, lowercased. */
  holder: string;
  /** The vaults holding a non-zero balance, largest balance first. */
  held: MorphoBaseHolderSummaryVault[];
}

function emptySummary(holder: string, r: MorphoBaseVaultRoster): MorphoBaseHolderSummaryResponse {
  return {
    blockNumber: 0,
    chainStale: true,
    censusBlock: r.censusBlock,
    catalogued: r.vaults.length,
    holder: holder.toLowerCase(),
    held: [],
  };
}

/**
 * The cheap half of the question above: which catalogued vaults does this
 * address hold shares of, and how many — nothing about what those shares are
 * WORTH inside the vault. One `eth_blockNumber` plus the two-request sweep,
 * and nothing else reads the chain. Built for the wallet page's client-side
 * vault note, which states names, not amounts, but the amounts ride along
 * (from the sweep, at no extra request) since the sweep already has them.
 *
 * `holder` must already be an address — see `loadMorphoBaseHolderExposure`.
 */
export async function loadMorphoBaseHolderSummary(holder: string): Promise<MorphoBaseHolderSummaryResponse> {
  const address = holder.toLowerCase() as `0x${string}`;
  const served = await loadMorphoBaseVaultRoster();
  try {
    const client = chainBatchClient(MORPHO_BASE_CHAIN_ID);
    const blockNumber = await client.getBlockNumber();
    const swept = await sweepHolderBalances(client, address, blockNumber);
    const held: MorphoBaseHolderSummaryVault[] = swept
      .slice()
      .sort((a, b) => (a.balance < b.balance ? 1 : a.balance > b.balance ? -1 : a.address.localeCompare(b.address)))
      .map((row) => ({
        address: row.address,
        name: row.name,
        symbol: row.symbol,
        asset: { symbol: assetSymbolOf(row.assetAddress) },
        shares: { raw: row.balance.toString(), value: Number(row.balance) / Math.pow(10, row.shareDecimals) },
      }));
    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      censusBlock: served.censusBlock,
      catalogued: served.vaults.length,
      holder: address,
      held,
    };
  } catch (error) {
    console.error("Morpho Base holder summary chain read failed:", error);
    return emptySummary(address, served);
  }
}

/** Run `worker` over `items`, at most `limit` in flight, keeping input order. */
async function mapWithLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Every catalogued vault this address holds shares of at one pinned block, and
 * its attributed exposure inside each of them.
 *
 * `holder` must already be an address — ENS resolution belongs to the caller,
 * the same division the per-vault route and page use.
 */
export async function loadMorphoBaseHolderExposure(holder: string): Promise<MorphoBaseHolderExposureResponse> {
  const address = holder.toLowerCase() as `0x${string}`;
  const served = await loadMorphoBaseVaultRoster();
  try {
    const client = chainBatchClient(MORPHO_BASE_CHAIN_ID);
    // ONE block read. Every balance, every leg and the code read below are
    // pinned to it, so the vaults stacked on the page are one moment.
    const blockNumber = await client.getBlockNumber();

    // ── the sweep: two requests over the whole census ──────────────────────
    // Shared with loadMorphoBaseHolderSummary above — one sweep, one place the
    // two-request count is a fact rather than a claim made twice.
    const roster = served.vaults;
    const held = (await sweepHolderBalances(client, address, blockNumber)).map((row) => row.address);

    // ── what the address is: once, for the page ────────────────────────────
    const shape = await loadMorphoBaseHolderShape(address, blockNumber);

    // ── the held vaults, read as their own pages read them ─────────────────
    const reads = await mapWithLimit(held, VAULT_CONCURRENCY, (vault) =>
      loadMorphoBaseVault(vault, address, { blockNumber, skipHolderShape: true }),
    );

    const found: MorphoBaseHolderVaultRow[] = reads
      // A vault the per-vault read could not resolve states no figure on its own
      // page either; it is dropped rather than rendered as a row of zeros.
      .filter((read) => !read.chainStale && read.holder != null)
      .map((read) => ({ read }));

    // ── per-asset totals, and no total across them ─────────────────────────
    // The ORDER is per asset too, and for the same reason the totals are: an
    // attributed amount is a quantity of one token, so sorting the whole list by
    // it would rank 1 wei of WETH above 1 USDC on an integer comparison that
    // means nothing. Assets are ordered by how many vaults sit in each, and the
    // vaults inside one asset by the attributed amount — a comparison of two
    // quantities of the same thing, which is the only kind made here.
    const byAsset = new Map<string, MorphoBaseHolderAssetTotal & { raw: bigint; rows: MorphoBaseHolderVaultRow[] }>();
    for (const row of found) {
      const asset = row.read.vault.asset;
      const add = BigInt(row.read.holder?.attributedTotal.raw ?? "0");
      const at = byAsset.get(asset.address);
      if (at) {
        at.raw += add;
        at.vaults += 1;
        at.rows.push(row);
      } else {
        byAsset.set(asset.address, {
          address: asset.address,
          symbol: asset.symbol,
          decimals: asset.decimals,
          named: asset.named,
          vaults: 1,
          raw: add,
          rows: [row],
          total: { raw: "0", value: 0 },
        });
      }
    }
    const groups = [...byAsset.values()].sort(
      (a, b) => b.vaults - a.vaults || a.symbol.localeCompare(b.symbol, "en-US") || a.address.localeCompare(b.address),
    );
    const attributedOf = (r: MorphoBaseHolderVaultRow) => BigInt(r.read.holder?.attributedTotal.raw ?? "0");
    const rows = groups.flatMap((g) =>
      [...g.rows].sort((a, b) => {
        const av = attributedOf(a);
        const bv = attributedOf(b);
        return av < bv ? 1 : av > bv ? -1 : a.read.vault.address.localeCompare(b.read.vault.address);
      }),
    );
    const assetTotals: MorphoBaseHolderAssetTotal[] = groups.map(({ raw, rows: _rows, ...rest }) => ({
      ...rest,
      total: { raw: raw.toString(), value: Number(raw) / Math.pow(10, rest.decimals) },
    }));

    return {
      blockNumber: Number(blockNumber),
      chainStale: false,
      censusBlock: served.censusBlock,
      catalogSize: roster.length,
      holder: address,
      shape,
      vaults: rows,
      assetTotals,
    };
  } catch (error) {
    console.error("Morpho Base holder exposure chain read failed:", error);
    return empty(address, served);
  }
}
