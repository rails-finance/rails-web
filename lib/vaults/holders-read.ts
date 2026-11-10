// A MetaMorpho vault page's Who holds it: the vault's largest holders at the
// census block, from the positions listing (`fetchVaultPositions`, the
// /api/vaults/positions proxy over the stored census) filtered to the vault,
// live rows only, largest balance first, no live overlay. Each row's
// `sharePpm` is its balance over `totalSupply()` at the census block. Null
// where the census did not answer or has no row for the vault. One read per
// request (React `cache`).
//
// SERVER-ONLY: the SSR hop signs the request.

import { cache } from "react";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";

/** Every holder of 2% or more draws its own slice, so a page of 50 holds them all. */
const PAGE = 50;

export interface VaultHolders {
  /** The block the census swept to; every figure here is at it. */
  censusBlock: number;
  /** Addresses holding a share at the census block. */
  liveCount: number;
  /** Σ balanceOf == totalSupply() wei-exact at the census block. */
  sumMatches: boolean;
  /** Largest first. `ppm` is parts per million of the share supply. */
  holders: { holder: string; balance: string; ppm: number }[];
}

export const loadVaultHolders = cache(async (chainId: number, vault: string): Promise<VaultHolders | null> => {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({
      chainId,
      vault,
      families: "morpho",
      status: "live",
      sortBy: "shares",
      sortOrder: "desc",
      limit: PAGE,
      overlay: false,
      ...hop,
    });
    const header = r.census.find((c) => c.vault.toLowerCase() === vault.toLowerCase());
    if (!header) return null;
    return {
      censusBlock: header.censusBlock,
      liveCount: header.liveCount,
      sumMatches: header.sumMatches,
      holders: r.data
        .filter((row) => row.census.sharePpm != null)
        .map((row) => ({ holder: row.holder, balance: row.census.balance, ppm: Number(row.census.sharePpm) })),
    };
  } catch (error) {
    console.error(`The holder read did not answer for ${vault}:`, error);
    return null;
  }
});
