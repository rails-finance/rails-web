"use client";

// The SparkLend position card's risk detail (ui-jobs 209): the distance bar
// under Health factor in the card's opened layer. The health factor is traced
// by the card's HF stat; the bar adds no receipts.

import { SparkRunway } from "@/components/protocol/spark/spark-runway";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

/** The opened card's distance bar under Health factor, beside its
 *  "Liquidates on a N% drop". The card carries no loan-to-value or e-mode
 *  line: the Explanation states the ratio, the borrow cap, the threshold and
 *  the e-mode category. */
export function SparkRiskDetail({ chain }: { chain: SparkPositionChainResponse }) {
  if (chain.healthFactor == null || chain.healthFactor <= 0) return null;
  return (
    <div className="mt-1.5 max-w-72">
      <SparkRunway compact barOnly healthFactor={chain.healthFactor} />
    </div>
  );
}
