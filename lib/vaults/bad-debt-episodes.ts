// Bad debt in a steward's vaults (rails-ops ui-jobs 554, piece C): the
// episodes the steward's record lists under its vaults table.
// ----------------------------------------------------------------------------
// The rule:
//  - The steward's vaults are the record's MetaMorpho rows on Base and
//    Ethereum (lib/vaults/steward-record.ts). Each vault's markets are its
//    withdraw queue at the head (readMetaMorphoWithdrawQueues).
//  - An episode is one Liquidate with badDebtAssets > 0 in one of those
//    markets, from rails-server's S1 route (lib/api/fetch-morpho-market-
//    liquidations.ts), and a vault of the steward holding supply shares in
//    that market at the block before it.
//  - One Multicall3 eth_call per bad-debt block, at block − 1, reads
//    Morpho.market(id).totalSupplyShares and Morpho.position(id, vault)
//    .supplyShares for every steward vault in each market liquidated in that
//    block. The vault's part is lib/vaults/bad-debt-share.ts. A supply or
//    withdrawal by the vault earlier in the same block is not seen.
//  - A past block's answer never changes, so each block's read is cached for
//    good, keyed by chain, block and its sorted market:vault pairs.
//  - Markets a vault has left are not checked. Any market or chain read that
//    does not answer leaves the whole list unstated.
//
// SERVER-ONLY: the reads use the RPC keys and RAILS_API_URL.

import { unstable_cache } from "next/cache";
import { parseAbi } from "viem";
import { chainBatchClient } from "@/lib/sources/chain/rpc";
import { readMetaMorphoWithdrawQueues } from "@/lib/sources/chain/morpho-base-vault";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import {
  fetchMorphoMarketLiquidations,
  type MorphoLiquidationsChainId,
  type MorphoMarketLiquidation,
} from "@/lib/api/fetch-morpho-market-liquidations";
import { MORPHO_BASE_BLUE } from "@/lib/morpho-base/asset-catalog";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { loadStewardRecord } from "@/lib/vaults/steward-record";
import { vaultIndexHref } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import { supplySharePercent, vaultBadDebtPart } from "@/lib/vaults/bad-debt-share";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const BLUE_ABI = parseAbi([
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

/** One vault hit by one liquidation's bad debt. Raw integers as strings. */
export interface BadDebtEpisode {
  /** `<chainId>:<marketId>:<block>:<logIndex>`, the liquidation. */
  key: string;
  chainId: MorphoLiquidationsChainId;
  marketId: string;
  block: number;
  timestamp: number | null;
  txHash: string;
  logIndex: number;
  /** block − 1, where the shares were read. */
  readBlock: number;
  vault: { address: string; name: string | null; href: string; isCurrent: boolean };
  market: {
    loanToken: string;
    collateralToken: string;
    loanSymbol: string;
    loanDecimals: number;
    loanNamed: boolean;
    collateralSymbol: string;
    /** Raw at 1e18. */
    lltv: string;
    href: string;
    /** The head block the withdraw queue and the params were read at. */
    paramsBlock: number;
  };
  badDebtAssets: string;
  vaultShares: string;
  totalShares: string;
  vaultPart: string;
  /** The vault's share of the market's supply, percent, floored to 6 places. */
  sharePercent: number;
}

export type BadDebtRead =
  /** The steward's record did not read, so there are no vaults to check. */
  | { kind: "unread" }
  /** S1 or a chain read did not answer for a market; nothing is stated. */
  | { kind: "unavailable" }
  | {
      kind: "ok";
      /** Newest first. */
      episodes: BadDebtEpisode[];
      /** Distinct liquidations among the episodes. */
      liquidations: number;
      /** The MetaMorpho vaults checked, and the markets in their queues. */
      vaults: number;
      markets: number;
      /** Distinct (chain, block) at-block reads the list rests on. */
      atBlockReads: number;
    };

/** One block's at-block answer: per market, its total supply shares and each
 *  asked vault's supply shares, as strings. */
type BlockShares = Record<string, { total: string; vaults: Record<string, string> }>;

/** `pairs` is the sorted `marketId:vault,vault;…` list: the cache key's half. */
async function readBlockShares(chainId: number, readBlock: number, pairs: string): Promise<BlockShares> {
  const blue = MORPHO_BASE_BLUE as `0x${string}`;
  const plan = pairs.split(";").map((p) => {
    const [m, vs] = p.split(":");
    return { m: m as `0x${string}`, vaults: vs.split(",") as `0x${string}`[] };
  });
  const contracts = plan.flatMap(({ m, vaults }) => [
    { address: blue, abi: BLUE_ABI, functionName: "market" as const, args: [m] as const },
    ...vaults.map((v) => ({ address: blue, abi: BLUE_ABI, functionName: "position" as const, args: [m, v] as const })),
  ]);
  // batchSize 0: the whole block is one aggregate3 eth_call.
  const res = await chainBatchClient(chainId as MorphoLiquidationsChainId).multicall({
    contracts,
    allowFailure: false,
    blockNumber: BigInt(readBlock),
    batchSize: 0,
  });
  const out: BlockShares = {};
  let k = 0;
  for (const { m, vaults } of plan) {
    const market = res[k++] as readonly bigint[];
    const entry = { total: String(market[1]), vaults: {} as Record<string, string> };
    for (const v of vaults) entry.vaults[v] = String((res[k++] as readonly bigint[])[0]);
    out[m] = entry;
  }
  return out;
}

const cachedBlockShares = unstable_cache(readBlockShares, ["vault-bad-debt-block-shares", "1"], {
  revalidate: false,
});

/** Run `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const vaultKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

interface ChainEpisodes {
  episodes: BadDebtEpisode[];
  markets: number;
  reads: number;
}

async function chainEpisodes(
  chainId: MorphoLiquidationsChainId,
  vaults: VaultSummary[],
  current: string,
): Promise<ChainEpisodes | null> {
  if (vaults.length === 0) return { episodes: [], markets: 0, reads: 0 };
  const q = await readMetaMorphoWithdrawQueues(
    chainId,
    vaults.map((v) => v.address),
  );
  // An idle market (no collateral) cannot be liquidated.
  const markets = Object.keys(q.params).filter((id) => q.params[id].collateralToken !== ZERO_ADDR);
  const answers = await pool(markets, 8, (id) => fetchMorphoMarketLiquidations(chainId, id, true));
  if (answers.some((a) => a.kind !== "ok")) return null;

  // The vaults of this steward whose queue holds each market.
  const holders = new Map<string, string[]>();
  for (const [vault, ids] of Object.entries(q.queues))
    for (const id of ids) holders.set(id, [...(holders.get(id) ?? []), vault]);

  // Bad-debt rows grouped by block.
  const byBlock = new Map<number, { id: string; l: MorphoMarketLiquidation }[]>();
  markets.forEach((id, i) => {
    const a = answers[i];
    if (a.kind !== "ok") return;
    for (const l of a.data.liquidations) {
      if (BigInt(l.badDebtAssets) <= BigInt(0)) continue;
      byBlock.set(l.block, [...(byBlock.get(l.block) ?? []), { id, l }]);
    }
  });

  const blocks = [...byBlock.keys()];
  const shares = await pool(blocks, 6, async (block) => {
    const ids = [...new Set(byBlock.get(block)!.map((r) => r.id))].sort();
    const pairs = ids.map((id) => `${id}:${[...(holders.get(id) ?? [])].sort().join(",")}`).join(";");
    try {
      return await cachedBlockShares(chainId, block - 1, pairs);
    } catch (error) {
      console.error(`bad-debt episodes: the read at ${chainId}:${block - 1} did not answer`, error);
      return null;
    }
  });
  if (shares.some((s) => s == null)) return null;

  // Token names: S1's `tokens`, the chain's resolver for any it lacks.
  const tokens = new Map<string, { symbol: string; decimals: number; named: boolean }>();
  for (const a of answers)
    if (a.kind === "ok")
      for (const [addr, t] of Object.entries(a.data.tokens)) tokens.set(addr.toLowerCase(), { ...t, named: true });
  const want = new Set<string>();
  for (const id of markets)
    for (const addr of [q.params[id].loanToken, q.params[id].collateralToken]) if (!tokens.has(addr)) want.add(addr);
  if (want.size > 0) {
    const meta = await resolveErc20Meta([...want], chainId);
    for (const [addr, m] of meta)
      tokens.set(addr, { symbol: m.symbol, decimals: m.decimals, named: m.named === true && !m.unresolved });
  }

  const byAddress = new Map(vaults.map((v) => [v.address.toLowerCase(), v]));
  const episodes: BadDebtEpisode[] = [];
  blocks.forEach((block, bi) => {
    const read = shares[bi]!;
    for (const { id, l } of byBlock.get(block)!) {
      const m = read[id];
      const p = q.params[id];
      const loan = tokens.get(p.loanToken);
      if (!loan) continue;
      const total = BigInt(m.total);
      for (const [vault, s] of Object.entries(m.vaults)) {
        const vs = BigInt(s);
        const part = vaultBadDebtPart(BigInt(l.badDebtAssets), vs, total);
        if (part == null) continue;
        const v = byAddress.get(vault)!;
        episodes.push({
          key: `${chainId}:${id}:${block}:${l.logIndex}`,
          chainId,
          marketId: id,
          block,
          timestamp: l.timestamp,
          txHash: l.txHash,
          logIndex: l.logIndex,
          readBlock: block - 1,
          vault: {
            address: vault,
            name: vaultDisplayName(v),
            href: vaultIndexHref(v),
            isCurrent: vaultKey(chainId, vault) === current,
          },
          market: {
            loanToken: p.loanToken,
            collateralToken: p.collateralToken,
            loanSymbol: loan.symbol,
            loanDecimals: loan.decimals,
            loanNamed: loan.named,
            collateralSymbol: tokens.get(p.collateralToken)?.symbol ?? p.collateralToken,
            lltv: p.lltv,
            href: morphoMarketHref(chainId, p.loanToken, id),
            paramsBlock: q.blockNumber,
          },
          badDebtAssets: l.badDebtAssets,
          vaultShares: s,
          totalShares: m.total,
          vaultPart: part.toString(),
          sharePercent: supplySharePercent(vs, total, 6) ?? 0,
        });
      }
    }
  });
  return { episodes, markets: markets.length, reads: blocks.length };
}

/** The bad-debt episodes in the vaults of the steward of `vault` on `chainId`. */
export async function loadBadDebtEpisodes(chainId: number, vault: string): Promise<BadDebtRead> {
  const record = await loadStewardRecord(chainId, vault, null);
  if (!record) return { kind: "unread" };
  const mm = record.vaults.filter((v) => v.family === "metamorpho");
  try {
    const per = await Promise.all(
      ([1, 8453] as const).map((c) =>
        chainEpisodes(
          c,
          mm.filter((v) => v.chainId === c),
          record.current,
        ),
      ),
    );
    if (per.some((p) => p == null)) return { kind: "unavailable" };
    const episodes = per
      .flatMap((p) => p!.episodes)
      .sort((a, b) =>
        a.timestamp !== b.timestamp && a.timestamp != null && b.timestamp != null
          ? b.timestamp - a.timestamp
          : a.chainId !== b.chainId
            ? a.chainId - b.chainId
            : b.block - a.block || b.logIndex - a.logIndex || a.vault.address.localeCompare(b.vault.address),
      );
    return {
      kind: "ok",
      episodes,
      liquidations: new Set(episodes.map((e) => e.key)).size,
      vaults: mm.length,
      markets: per.reduce((s, p) => s + p!.markets, 0),
      atBlockReads: per.reduce((s, p) => s + p!.reads, 0),
    };
  } catch (error) {
    console.error("bad-debt episodes: a read did not answer", error);
    return { kind: "unavailable" };
  }
}
