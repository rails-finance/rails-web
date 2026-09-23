// The Aave app's own names for the position swaps it places (rails-ops
// TO-DO-ui-jobs §15, D7). Shared by the server transform and the card, so it
// lives outside the server-only source module.

import type { AaveV3SwapKind } from "@/lib/shared/types/event-shape";

export const AAVE_V3_SWAP_LABELS: Record<AaveV3SwapKind, string> = {
  collateral_swap: "Collateral swap",
  debt_swap: "Debt swap",
  repay_with_collateral: "Repay with collateral",
  withdraw_and_swap: "Withdraw and swap",
  supply_from_swap: "Supply from a swap",
};
