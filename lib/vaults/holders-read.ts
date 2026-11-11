// A vault page's Who holds it (MetaMorpho, Aave, Yearn V3): the vault's
// largest holders at the census block, from the positions listing
// (`fetchVaultPositions`, the /api/vaults/positions proxy over the stored
// census) scoped to the family's census word and filtered to the vault,
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
  /** The share token's decimals as the census stores them; null where it stores none. */
  shareDecimals: number | null;
  /** Largest first. `ppm` is parts per million of the share supply. */
  holders: { holder: string; balance: string; ppm: number }[];
}

/** `families`: the census's word for the vault's family ("morpho", "stata",
 *  "yearn-v3"…; lib/vaults/families.ts `census`). */
export const loadVaultHolders = cache(
  async (chainId: number, vault: string, families: string): Promise<VaultHolders | null> => {
    try {
      const hop = await ssrHop();
      const r = await fetchVaultPositions({
        chainId,
        vault,
        families,
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
        shareDecimals: r.data.find((row) => row.shareDecimals != null)?.shareDecimals ?? null,
        holders: r.data
          .filter((row) => row.census.sharePpm != null)
          .map((row) => ({ holder: row.holder, balance: row.census.balance, ppm: Number(row.census.sharePpm) })),
      };
    } catch (error) {
      console.error(`The holder read did not answer for ${vault}:`, error);
      return null;
    }
  },
);
