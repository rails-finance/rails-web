// The vault-position listing proxy — the census page, plus the live overlay.
// ----------------------------------------------------------------------------
// TWO THINGS HAPPEN IN ONE REQUEST, and the response keeps them apart:
//
//  1. THE CENSUS PAGE. Forwarded to rails-server (`/api/vaults/positions`) with
//     `createAuthFetchOptions` + `proxyCacheControl`, exactly as
//     app/api/troves/route.ts forwards a trove page. Membership, the counted
//     transfers, the first and last blocks and the holder's shape all come from
//     there, each stated at the census block the row carries.
//  2. THE LIVE OVERLAY. `balanceOf` and `convertToAssets(balanceOf)` per card
//     and `totalSupply()` per distinct vault on the page, read at ONE block this
//     route pins for the whole response. Twenty cards is ≤ 40 + 18 calls over
//     three Multicall3 rounds (the second depends on the first), well under the
//     batch ceiling. The response states that block once.
//
// A FAILED OVERLAY IS AN UNREAD FIGURE, NOT A ZERO. If the chain read throws —
// no key, a refused batch, a timeout — every row answers with `live: null` and
// the response's `blockNumber` is null. The card then draws its census figures
// labelled as census figures and says the live read did not answer. The census
// page still answers, because membership does not depend on the head.
//
// NOTHING IS EVER WRITTEN. A search for an address the census does not know
// answers zero rows; it does not insert, and there is no lane here that could.
// The set of participants is the census's answer and only the census's.
//
// TWO CHAINS, ONE ROUTE. `chain` picks which census is paged and which chain
// the overlay is read on — 1 (Aave's three vault families) and 8453 (every
// MetaMorpho vault the two Base factories made). What differs between them is
// only where the ASSET each `convertToAssets` answers in comes from: on
// Ethereum the directory read the section already caches names it, on Base the
// asset's own `symbol()` and `decimals()` are read in the same batch as the
// balances, at the same block, for the ≤ 20 distinct assets a page can hold.
// The `family` axis differs too: Base has exactly one value, so the route
// accepts it and the listing offers no menu for it.
//
// THE VALUE IS THE CENSUS'S, NOT THIS ROUTE'S. Since mig 206 each backend row
// carries `valueUsdE8` — the position's USD value at the census block, from the
// chain's Aave V3 oracle — and the census header carries every input that
// figure was built from. This route composes the two into `row.value` so a
// card has the figure AND its receipt in one place, and it forwards the `Size`
// facet as the backend's own params: a whole-dollar bracket becomes `minUsd`,
// and `unpriced` selects exactly the rows the oracle declined. Nothing about
// the value is read, priced or converted here.

import { NextRequest, NextResponse } from "next/server";

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import {
  isVaultPositionShape,
  vaultPositionValueFrom,
  type VaultCensusRow,
  type VaultPositionLive,
  type VaultPositionRow,
} from "@/lib/aave-vaults/vault-position";
import { VAULT_SIZE_BRACKETS, VAULT_SIZE_UNPRICED } from "@/lib/aave-vaults/position-list-filter-dimensions";
import { AAVE_VAULT_FAMILY_ORDER } from "@/lib/aave-vaults/vault-catalog";
import { loadMorphoBaseVaultRoster } from "@/lib/morpho-base/vault-roster";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { chainBatchClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { parseAbi } from "viem";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** The chains whose census this route pages. A chain absent here is refused
 *  rather than forwarded: the backend would answer an empty page for it, and an
 *  empty page reads as "nobody holds anything" rather than "no census exists". */
const CENSUS_CHAINS: readonly ChainId[] = [MAINNET_CHAIN_ID, BASE_CHAIN_ID];

/** The families each chain's census writes. Base has exactly one — every
 *  catalogued vault there is MetaMorpho — so it is a value the route accepts
 *  and never a menu the listing offers. */
const FAMILIES_BY_CHAIN: Record<number, readonly string[]> = {
  [MAINNET_CHAIN_ID]: AAVE_VAULT_FAMILY_ORDER,
  [BASE_CHAIN_ID]: ["morpho"],
};

const VALID_SORT_FIELDS = ["value", "share", "shares", "lastActivity", "firstSeen", "transfers"];
/** The `Size` facet's wire values: the whole-dollar brackets the facet offers,
 *  plus the unpriced set. Anything else is refused rather than forwarded. */
const VALID_SIZES: readonly string[] = [...VAULT_SIZE_BRACKETS.map((b) => String(b)), VAULT_SIZE_UNPRICED];
const VALID_SORT_ORDERS = ["asc", "desc"];
const VALID_STATUSES = ["live", "closed"];
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** `q` is matched as a fragment of a holder address, so it may be partial — but
 *  it is still hex, and anything else is refused rather than forwarded. */
const Q_RE = /^0x?[0-9a-fA-F]{0,40}$/;

/** The listing's page size is 20; the backend caps `limit` at 100 and the
 *  overlay's batch is sized for a page, so this route refuses more. */
const MAX_LIMIT = 100;

const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

const ERC20_META_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);
const bigOrNull = (v: unknown): bigint | null => (typeof v === "bigint" ? v : null);
const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});

/** The backend's row shape as Phase 1 shipped it (camelCase, flat). */
interface BackendPositionRow {
  chainId: number;
  vault: string;
  holder: string;
  family: string;
  symbol: string | null;
  shareDecimals: number | null;
  balance: string;
  live: boolean;
  transferCount: number;
  firstBlock: number;
  lastBlock: number;
  shape: string | null;
  shapeDetail: Record<string, unknown> | null;
  censusBlock: number;
  /** mig 206 — null where the vault is unpriced, or before the price pass. */
  valueUsdE8?: string | null;
  sharePpm?: string | null;
}

/** Is this a family word the chain's own census writes? */
const isFamilyOn = (chainId: number, v: string): boolean => (FAMILIES_BY_CHAIN[chainId] ?? []).includes(v);

const isVaultFamily = (v: string): v is VaultPositionRow["family"] =>
  (AAVE_VAULT_FAMILY_ORDER as readonly string[]).includes(v) || v === "morpho";

/** Reshape one backend row into the two-lane row the listing renders. The live
 *  lane is filled in afterwards; here it is null, which reads as unread. */
function toRow(r: BackendPositionRow, chainId: number, census: VaultCensusRow | null): VaultPositionRow {
  return {
    chainId: r.chainId,
    vault: r.vault.toLowerCase(),
    holder: r.holder.toLowerCase(),
    // A family the web tier does not know is not silently renamed: the row
    // keeps the census's word where it is one this tier knows, and otherwise
    // falls back to the chain's own single family — never to another chain's.
    family: isVaultFamily(r.family) ? r.family : chainId === BASE_CHAIN_ID ? "morpho" : "stata",
    symbol: r.symbol,
    shareDecimals: r.shareDecimals,
    census: {
      block: r.censusBlock,
      balance: r.balance,
      live: r.live,
      transferCount: r.transferCount,
      firstBlock: r.firstBlock,
      lastBlock: r.lastBlock,
      shape: r.shape != null && isVaultPositionShape(r.shape) ? r.shape : null,
      shapeDetail: r.shapeDetail,
      sharePpm: r.sharePpm ?? null,
    },
    live: null,
    asset: null,
    firstSeenAt: null,
    lastActivityAt: null,
    value: vaultPositionValueFrom(census, r.valueUsdE8 ?? null),
  };
}

type OverlayAsset = { address: string; symbol: string; decimals: number };

/** The asset behind each Base vault on the page: the roster's immutable
 *  `asset()` (a chain read, proved against every vault's creation log; the
 *  box's roster over the baked one, lib/morpho-base/vault-roster.ts), with that token's `symbol()` and
 *  `decimals()` asked at the overlay's own block. A page can hold at most 20
 *  distinct assets, so this is ≤ 40 calls in one batch beside the balances.
 *
 *  A vault the catalogue does not know, or a token that did not answer, is
 *  simply absent from the map — the card then states no claim rather than a
 *  figure scaled by an assumed exponent. */
async function baseAssets(
  client: ReturnType<typeof chainBatchClient>,
  vaults: string[],
  blockNumber: bigint,
): Promise<Map<string, OverlayAsset>> {
  const assetOfVault = new Map<string, string>();
  const roster = await loadMorphoBaseVaultRoster();
  for (const v of vaults) {
    const entry = roster.byAddress.get(v.toLowerCase());
    if (entry) assetOfVault.set(v, entry.asset.toLowerCase());
  }
  const tokens = Array.from(new Set(assetOfVault.values()));
  if (tokens.length === 0) return new Map();

  const meta = (await client.multicall({
    contracts: tokens.flatMap((t) => [
      { address: t as `0x${string}`, abi: ERC20_META_ABI, functionName: "symbol" as const },
      { address: t as `0x${string}`, abi: ERC20_META_ABI, functionName: "decimals" as const },
    ]),
    batchSize: 0,
    allowFailure: true,
    blockNumber,
  })) as Call[];

  const byToken = new Map<string, OverlayAsset>();
  tokens.forEach((t, i) => {
    const symbol = ok(meta[i * 2]);
    const decimals = ok(meta[i * 2 + 1]);
    if (typeof symbol !== "string" || typeof decimals !== "number") return;
    byToken.set(t, { address: t, symbol, decimals });
  });

  const out = new Map<string, OverlayAsset>();
  for (const [vault, token] of assetOfVault) {
    const a = byToken.get(token);
    if (a) out.set(vault, a);
  }
  return out;
}

/**
 * The overlay: one pinned block, one balance and one claim per card, one supply
 * per distinct vault, and the timestamp of every block a card names. Mutates the
 * rows in place and answers the block it pinned; answers null when the chain
 * read did not happen at all, which the rows then carry as `live: null`.
 */
async function applyOverlay(
  rows: VaultPositionRow[],
  chainId: ChainId,
): Promise<{ blockNumber: number; finalized: number | null } | null> {
  if (rows.length === 0) return null;
  try {
    const client = chainBatchClient(chainId);
    // The head this page is read at, and the lane's OWN `finalized` block —
    // asked together, in one round trip, because the second is what the
    // section's history store cuts at and the listing states the two side by
    // side rather than a lag anybody assumed. The tag means different things
    // on different chains and moves within minutes; the node is the only place
    // it is defined. A lane that will not answer it leaves it unstated.
    const [blockNumber, finalizedBlock] = await Promise.all([
      client.getBlockNumber(),
      client.getBlock({ blockTag: "finalized" }).then(
        (b) => Number(b.number),
        () => null,
      ),
    ]);

    const vaults = Array.from(new Set(rows.map((r) => r.vault)));

    // The asset each vault's `convertToAssets` answers in, with the decimals
    // its figure is scaled by. Where it comes from is the one thing the two
    // chains do differently, and neither is a hand-kept table: on Ethereum it
    // is the directory read the section already caches for five minutes (a
    // roster, not a balance); on Base it is the catalogue's own immutable
    // `asset()` per vault, with that token's `symbol()` and `decimals()` read
    // in the same wave as the balances, at the same block. A vault whose asset
    // did not answer leaves the claim unstated rather than scaled by a guess.
    const assetOf = await (chainId === BASE_CHAIN_ID
      ? baseAssets(client, vaults, blockNumber)
      : loadAaveEthereumVaultDirectory().then(
          (directory) => new Map(directory.rows.map((v) => [v.address.toLowerCase(), v.asset])),
        ));

    // Round 1: every card's balance, and every distinct vault's supply.
    const round1 = (await client.multicall({
      contracts: [
        ...rows.map((r) => ({
          address: r.vault as `0x${string}`,
          abi: VAULT_ABI,
          functionName: "balanceOf" as const,
          args: [r.holder as `0x${string}`],
        })),
        ...vaults.map((v) => ({
          address: v as `0x${string}`,
          abi: VAULT_ABI,
          functionName: "totalSupply" as const,
        })),
      ],
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];

    const balances = rows.map((_, i) => bigOrNull(ok(round1[i])));
    const supplies = new Map<string, bigint | null>(vaults.map((v, i) => [v, bigOrNull(ok(round1[rows.length + i]))]));

    // Round 2: the vault's own conversion of THIS balance — asked with the
    // balance as an argument, never shares × a price this route divided out.
    // A zero balance is not asked: `convertToAssets(0)` is zero by definition
    // and a closed card draws no claim.
    const claimIdx: number[] = [];
    rows.forEach((_, i) => {
      const b = balances[i];
      if (b != null && b > BigInt(0)) claimIdx.push(i);
    });
    const round2 =
      claimIdx.length === 0
        ? []
        : ((await client.multicall({
            contracts: claimIdx.map((i) => ({
              address: rows[i].vault as `0x${string}`,
              abi: VAULT_ABI,
              functionName: "convertToAssets" as const,
              args: [balances[i] as bigint],
            })),
            batchSize: 0,
            allowFailure: true,
            blockNumber,
          })) as Call[]);
    const claims = new Map<number, bigint | null>(claimIdx.map((i, k) => [i, bigOrNull(ok(round2[k]))]));

    // The blocks the cards name. A date is a block's own timestamp, read at that
    // block — never inferred from a block number and an assumed cadence.
    const blocks = Array.from(new Set(rows.flatMap((r) => [r.census.firstBlock, r.census.lastBlock]))).filter(
      (b) => Number.isFinite(b) && b > 0,
    );
    const stamps = new Map<number, number>();
    const settled = await Promise.allSettled(blocks.map((b) => client.getBlock({ blockNumber: BigInt(b) })));
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") stamps.set(blocks[i], Number(s.value.timestamp));
    });

    rows.forEach((r, i) => {
      const shareDecimals = r.shareDecimals ?? 18;
      const asset = assetOf.get(r.vault) ?? null;
      r.asset = asset ? { address: asset.address, symbol: asset.symbol, decimals: asset.decimals } : null;
      r.firstSeenAt = stamps.get(r.census.firstBlock) ?? null;
      r.lastActivityAt = stamps.get(r.census.lastBlock) ?? null;
      const b = balances[i];
      if (b == null) {
        // This card's own read did not answer. Its neighbours' did, so the
        // response is not stale — this ONE figure is unread, and says so.
        r.live = null;
        return;
      }
      const claim = claims.get(i) ?? null;
      const supply = supplies.get(r.vault) ?? null;
      const live: VaultPositionLive = {
        blockNumber: Number(blockNumber),
        shares: amount(b, shareDecimals),
        claim: claim == null || asset == null ? null : amount(claim, asset.decimals),
        totalSupply: supply == null ? null : amount(supply, shareDecimals),
        live: b > BigInt(0),
      };
      r.live = live;
    });

    return {
      blockNumber: Number(blockNumber),
      finalized:
        finalizedBlock != null && Number.isFinite(finalizedBlock) && finalizedBlock > 0 ? finalizedBlock : null,
    };
  } catch (error) {
    console.error("Vault positions overlay chain read failed:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const sp = request.nextUrl.searchParams;

  const chain = sp.get("chain") ?? "1";
  const vault = sp.get("vault");
  const family = sp.get("family");
  const status = sp.get("status");
  const shape = sp.get("shape");
  const q = sp.get("q");
  const size = sp.get("size");
  const sortBy = sp.get("sortBy");
  const sortOrder = sp.get("sortOrder");
  const limit = sp.get("limit");
  const offset = sp.get("offset");
  const overlay = sp.get("overlay") !== "0";

  const chainId = Number(chain) as ChainId;
  if (!CENSUS_CHAINS.includes(chainId)) {
    return NextResponse.json(
      { error: `No vault position census exists for chain ${chain}. Censused chains: ${CENSUS_CHAINS.join(", ")}` },
      { status: 400 },
    );
  }
  if (vault && !ADDRESS_RE.test(vault)) {
    return NextResponse.json({ error: "Invalid vault address format" }, { status: 400 });
  }
  if (family && !isFamilyOn(chainId, family)) {
    return NextResponse.json(
      {
        error: `Invalid family parameter for chain ${chain}. Valid values: ${(FAMILIES_BY_CHAIN[chainId] ?? []).join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status parameter. Valid values: live, closed" }, { status: 400 });
  }
  if (shape && !isVaultPositionShape(shape)) {
    return NextResponse.json({ error: "Invalid shape parameter" }, { status: 400 });
  }
  if (q && !Q_RE.test(q.trim())) {
    return NextResponse.json({ error: "Search must be an address or a hex fragment of one" }, { status: 400 });
  }
  if (size && !VALID_SIZES.includes(size)) {
    return NextResponse.json(
      { error: `Invalid size parameter. Valid values: ${VALID_SIZES.join(", ")}` },
      { status: 400 },
    );
  }
  if (sortBy && !VALID_SORT_FIELDS.includes(sortBy)) {
    return NextResponse.json(
      { error: `Invalid sortBy parameter. Valid values: ${VALID_SORT_FIELDS.join(", ")}` },
      { status: 400 },
    );
  }
  if (sortOrder && !VALID_SORT_ORDERS.includes(sortOrder)) {
    return NextResponse.json({ error: "Invalid sortOrder parameter. Valid values: asc, desc" }, { status: 400 });
  }
  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > MAX_LIMIT)) {
    return NextResponse.json({ error: `limit must be a number between 1 and ${MAX_LIMIT}` }, { status: 400 });
  }
  if (offset && (isNaN(Number(offset)) || Number(offset) < 0)) {
    return NextResponse.json({ error: "offset must be a non-negative number" }, { status: 400 });
  }

  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const backendParams = new URLSearchParams({ chain });
    if (vault) backendParams.set("vault", vault.toLowerCase());
    if (family) backendParams.set("family", family);
    if (status) backendParams.set("status", status);
    if (shape) backendParams.set("shape", shape);
    if (q) backendParams.set("q", q.trim().toLowerCase());
    // The facet's one param becomes the backend's two: a bracket is a lower
    // bound in whole dollars, and "unpriced" is the NULL set.
    if (size === VAULT_SIZE_UNPRICED) backendParams.set("size", VAULT_SIZE_UNPRICED);
    else if (size) backendParams.set("minUsd", size);
    if (sortBy) backendParams.set("sortBy", sortBy);
    if (sortOrder) backendParams.set("sortOrder", sortOrder);
    if (limit) backendParams.set("limit", limit);
    if (offset) backendParams.set("offset", offset);

    const url = `${RAILS_API_URL}/api/vaults/positions?${backendParams.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const json = (await response.json()) as {
      data?: BackendPositionRow[];
      pagination?: { total?: number; limit?: number; offset?: number };
      census?: VaultCensusRow[];
    };

    const censusByVault = new Map((json.census ?? []).map((c) => [c.vault.toLowerCase(), c]));
    const rows = (json.data ?? []).map((r) => toRow(r, chainId, censusByVault.get(r.vault.toLowerCase()) ?? null));
    const read = overlay ? await applyOverlay(rows, chainId) : null;

    return NextResponse.json(
      {
        data: rows,
        pagination: {
          total: json.pagination?.total ?? rows.length,
          limit: json.pagination?.limit ?? Number(limit ?? 20),
          offset: json.pagination?.offset ?? Number(offset ?? 0),
        },
        census: json.census ?? [],
        blockNumber: read?.blockNumber ?? null,
        finalizedBlock: read?.finalized ?? null,
      },
      // The overlay is a head read, so this response is only as cacheable as
      // the block it names — the listing TTL (60s) is roughly five blocks, and
      // the page states the block it read at.
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching vault positions from backend:", error);
    return NextResponse.json({ error: "Failed to fetch vault positions" }, { status: 500 });
  }
}
