// The three Liquity V2 stability pools, one per branch: the contracts whose
// DepositOperation rails-server mirrors (migs 490, 491;
// scripts/backfill-liquity-v2-sp-operations.mjs there names the same three).
// Pure: no imports beyond the type.

import type { SpBranch } from "./sp-routes";

export const LIQUITY_V2_SP_POOLS: Record<SpBranch, string> = {
  WETH: "0x5721cbbd64fc7ae3ef44a0a3f9a790a9264cf9bf",
  wstETH: "0x9502b7c397e9aa22fe9db7ef7daf21cd2aebe56b",
  rETH: "0xd442e41019b7f5c4dd78f50dc03726c446148695",
};
