// PWN Token Bundler contents — SERVER-ONLY (imported from /api/chain/pwn/*).
// ----------------------------------------------------------------------------
// A PWN bundle is the protocol's own ERC-1155 wrapping several assets into one
// token — the shape multi-asset collateral takes on PWN. The bundler exposes
// its contents on chain via tokensInBundle(id), returning MultiToken.Asset
// structs (category enum, address, id, amount). The read is pinned to the
// loan's CREATION block: the bundle is emptied when unwrapped after the loan
// closes, so the head state of a closed loan's bundle is empty — the
// creation-block state is the loan's truth (an archive read; Alchemy serves it).

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import { PWN_ADDRESSES } from "@/lib/pwn/asset-catalog";
import type { PwnBundleAsset, PwnBundleContentsResponse } from "@/lib/api/fetch-pwn-bundle";

const BUNDLER_ABI = parseAbi([
  "function tokensInBundle(uint256 _bundleId) view returns ((uint8 category, address assetAddress, uint256 id, uint256 amount)[])",
]);

const ZERO = BigInt(0);

/** MultiToken.Category → the stored category label. */
function categoryOf(cat: number): PwnBundleAsset["category"] {
  return cat === 0 ? "ERC20" : cat === 1 ? "ERC721" : cat === 2 ? "ERC1155" : "unknown";
}

export async function loadPwnBundleContents(bundleId: string, atBlock: number): Promise<PwnBundleContentsResponse> {
  const client = alchemyClient();
  const raw = await client.readContract({
    address: PWN_ADDRESSES.TOKEN_BUNDLER as `0x${string}`,
    abi: BUNDLER_ABI,
    functionName: "tokensInBundle",
    args: [BigInt(bundleId)],
    blockNumber: BigInt(atBlock),
  });

  const metas = await resolveErc20Meta(raw.map((t) => t.assetAddress.toLowerCase()));

  const assets: PwnBundleAsset[] = raw.map((t) => {
    const address = t.assetAddress.toLowerCase();
    const meta = metas.get(address);
    const category = categoryOf(t.category);
    const isNft = category === "ERC721" || category === "ERC1155";
    // MultiToken encodes an ERC721 with amount 0 (the id names the one token).
    const amount =
      category === "ERC20" ? scaleRaw(t.amount, meta?.decimals ?? 18) : t.amount === ZERO ? 1 : Number(t.amount);
    return {
      category,
      address,
      symbol: meta?.symbol ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
      named: meta?.named === true,
      tokenId: isNft ? t.id.toString() : null,
      amount,
    };
  });

  return { bundleId, atBlock, assets };
}
