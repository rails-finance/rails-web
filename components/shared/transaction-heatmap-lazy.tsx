"use client";

// Lazy boundary for the transaction heatmap. The heatmap only ever renders
// after a user opens the date-range control, so no detail route should pay for
// it in the initial bundle — importers pull this wrapper and the real module
// arrives as its own chunk on first open. Same props, drop-in swap.

import dynamic from "next/dynamic";

export const TransactionHeatmap = dynamic(() => import("./transaction-heatmap").then((m) => m.TransactionHeatmap), {
  loading: () => null,
});
