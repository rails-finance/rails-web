// The reads behind "Supplied by vaults" (lib/vaults/supplied-by.ts).
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// Each family reads what Rails already reads for its vault roster, and adds at
// most one multicall:
//
//   • Morpho Blue (Base, Ethereum): the MetaMorpho directory, cached five
//     minutes, holds every funded vault's withdraw queue (read with the
//     illiquid test). The vaults whose queue names the market are this
//     market's; one multicall at the head reads `market(id)` and
//     `position(id, vault)` for each, N + 1 calls per page load, and converts
//     the supply shares over the market's totals as Blue last settled them.
//   • Aave V3 Core (Ethereum): the Aave vault directory, cached five minutes,
//     holds every static aToken and Umbrella stake with its asset, total
//     assets, share price and, for a stake, the reserve it covers and its
//     owner. No new chain read.

import { parseAbi } from "viem";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { serverHeadStampAt } from "@/lib/sources/api/server-head-stamps";
import { loadMetaMorphoVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { MORPHO_BLUE } from "@/lib/sources/chain/metamorpho-illiquid";
import { AAVE_STATA_FACTORY, AAVE_UMBRELLA } from "@/lib/aave-vaults/vault-catalog";
import { toAssetsDown } from "@/lib/vaults/illiquid";
import { releaseLabel } from "@/lib/vaults/families";
import { ethereumVaultHref, metaMorphoVaultHref } from "@/lib/vaults/routes";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { byAmountDesc, type SuppliedByRead, type SuppliedByRow } from "@/lib/vaults/supplied-by";

const ZERO = BigInt(0);
const BLUE_ABI = parseAbi([
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

const amountOf = (raw: bigint, decimals: number) => ({ raw: raw.toString(), value: Number(raw) / 10 ** decimals });

/** The MetaMorpho vaults with `marketId` in their withdraw queue, and each
 *  one's supply there. */
export async function readMorphoSuppliedBy(
  chainId: MetaMorphoChainId,
  marketId: string,
  asset: SuppliedByRead["asset"],
): Promise<SuppliedByRead> {
  const id = marketId.toLowerCase();
  const chainName = chainId === 1 ? "Ethereum" : "Base";
  const base: SuppliedByRead = {
    chainId,
    block: 0,
    asset,
    rows: [],
    contracts: [],
    roster: `the MetaMorpho roster on ${chainName}`,
  };
  try {
    const dir = await loadMetaMorphoVaultDirectory(chainId);
    if (dir.chainStale) return { ...base, failed: true };
    const vaults = dir.rows.filter((r) => r.queue?.includes(id));
    if (vaults.length === 0) return { ...base, block: dir.blockNumber, head: dir.head };

    const client = vaultHeadClient(chainId);
    const blockNumber = await client.getBlockNumber();
    const answers = (await client.multicall({
      contracts: [
        { address: MORPHO_BLUE as `0x${string}`, abi: BLUE_ABI, functionName: "market", args: [id as `0x${string}`] },
        ...vaults.map((v) => ({
          address: MORPHO_BLUE as `0x${string}`,
          abi: BLUE_ABI,
          functionName: "position",
          args: [id as `0x${string}`, v.address as `0x${string}`],
        })),
      ] as Parameters<typeof client.multicall>[0]["contracts"],
      allowFailure: true,
      batchSize: 0,
      blockNumber,
    })) as { status: string; result?: unknown }[];
    const market = answers[0]?.status === "success" ? (answers[0].result as readonly bigint[]) : null;

    const rows: SuppliedByRow[] = vaults.map((v, i) => {
      const p = answers[i + 1];
      const shares = p?.status === "success" ? (p.result as readonly bigint[])[0] : null;
      const raw = market && shares != null ? toAssetsDown(shares, market[0], market[1]) : null;
      const steward = v.curator
        ? { address: v.curator, role: "curator" }
        : v.owner
          ? { address: v.owner, role: "owner" }
          : null;
      return {
        address: v.address.toLowerCase(),
        name: v.name ?? v.censusName,
        kind: releaseLabel("metamorpho", v.factory),
        href: metaMorphoVaultHref(chainId, v.address),
        steward,
        amount: raw == null ? null : amountOf(raw, asset.decimals),
        amountWhat: `${asset.symbol} the vault supplies to this market: its supply shares converted over the market's supply totals as Morpho Blue last settled them.`,
        amountVia: "position(id, vault).supplyShares × market(id).totalSupplyAssets ÷ totalSupplyShares",
      };
    });
    return {
      ...base,
      block: Number(blockNumber),
      head: serverHeadStampAt(chainId, blockNumber),
      rows: rows.sort(byAmountDesc),
      contracts: [{ name: "Morpho Blue", address: MORPHO_BLUE, reads: "market(id), position(id, vault)" }],
    };
  } catch (error) {
    console.error(`Supplied by vaults: the Morpho read failed (chain ${chainId}, market ${id}):`, error);
    return { ...base, failed: true };
  }
}

/** The static aTokens over an Aave V3 Core reserve, and the Umbrella stakes
 *  that cover it. */
export async function readAaveCoreSuppliedBy(asset: SuppliedByRead["asset"]): Promise<SuppliedByRead> {
  const reserve = asset.address.toLowerCase();
  const base: SuppliedByRead = {
    chainId: MAINNET_CHAIN_ID,
    block: 0,
    asset,
    rows: [],
    contracts: [],
    roster: "Aave's vault roster on Ethereum",
  };
  try {
    const dir = await loadAaveEthereumVaultDirectory();
    if (dir.chainStale) return { ...base, failed: true };
    const byAddress = new Map(dir.rows.map((r) => [r.address, r]));
    const rows: SuppliedByRow[] = [];
    for (const r of dir.rows) {
      const name = r.name ?? r.symbol ?? r.address;
      if (r.family === "stata" && r.asset.address === reserve) {
        rows.push({
          address: r.address,
          name,
          kind: "Static aToken",
          href: ethereumVaultHref(r.address),
          steward: null,
          amount: r.totalAssets,
          amountWhat: `${asset.symbol} the wrapper holds as a supply position in this reserve: its total assets.`,
          amountVia: "totalAssets()",
        });
      }
      if (r.family === "umbrella-stake" && r.reserve?.address === reserve) {
        // A stake over a static aToken holds wrapper shares: one more hop at
        // the wrapper's share price reaches the reserve's asset. stkGHO holds
        // GHO itself.
        const inner = byAddress.get(r.asset.address);
        const hop = inner?.family === "stata" ? inner : null;
        let amount = r.totalAssets;
        if (hop && r.totalAssets) {
          amount =
            hop.sharePrice && hop.shareDecimals != null
              ? amountOf(
                  (BigInt(r.totalAssets.raw) * BigInt(hop.sharePrice.raw)) / BigInt(10) ** BigInt(hop.shareDecimals),
                  asset.decimals,
                )
              : null;
        }
        rows.push({
          address: r.address,
          name,
          kind: "Umbrella stake",
          href: ethereumVaultHref(r.address),
          steward: r.owner ? { address: r.owner, role: "owner" } : null,
          amount,
          amountWhat: hop
            ? `${asset.symbol} the stake holds through ${hop.symbol ?? "the wrapper"}: its total assets in wrapper shares at the wrapper's share price. The wrapper's own row counts the same ${asset.symbol}.`
            : `${asset.symbol} the stake holds: its total assets.`,
          amountVia: hop ? "totalAssets() × wrapper convertToAssets(one share)" : "totalAssets()",
        });
      }
    }
    return {
      ...base,
      block: dir.blockNumber,
      head: dir.head,
      rows: rows.sort(byAmountDesc),
      contracts: [
        { name: "Static aToken factory", address: AAVE_STATA_FACTORY, reads: "getStataTokens()" },
        { name: "Umbrella", address: AAVE_UMBRELLA, reads: "getStkTokens()" },
        ...rows.map((r) => ({
          name: r.name,
          address: r.address,
          reads: r.kind === "Umbrella stake" ? "asset(), totalAssets(), owner()" : "asset(), totalAssets()",
        })),
      ],
    };
  } catch (error) {
    console.error(`Supplied by vaults: the Aave read failed (reserve ${reserve}):`, error);
    return { ...base, failed: true };
  }
}
