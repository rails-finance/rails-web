// Prose for SparkLend's ChainTruthTower Explanation pane and its "?" modal.
// SparkLend's ledger is Aave V3's reduction under SparkLend's classifier
// (lib/spark/economics.ts), so its prose is Aave V3's with SparkLend's names:
// the Spark treasury takes a liquidation's fee, spTokens are the position
// token, and the links are Spark's docs.

import type { ReactNode } from "react";
import type { AaveV3TowerData } from "@/lib/aave-v3/chain-truth-tower";
import {
  aaveV3EconomicsContent,
  aaveV3EconomicsExplanation,
  type AaveV3EconomicsOpts,
} from "@/lib/aave-v3/economics-explanation";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const SPARK_DOCS = {
  SPARKLEND: "https://docs.spark.fi/products/sparklend",
  LIQUIDATIONS: "https://docs.spark.fi/products/sparklend/guides/liquidations",
  FAQ: "https://docs.spark.fi/faq",
} as const;

const SPARK_OPTS: AaveV3EconomicsOpts = {
  label: "SparkLend",
  treasury: "Spark",
  oracle: "SparkLend",
  token: "spToken",
  swaps: false,
  links: [
    { label: "SparkLend docs", url: SPARK_DOCS.SPARKLEND },
    { label: "Liquidations", url: SPARK_DOCS.LIQUIDATIONS },
    { label: "Spark FAQ", url: SPARK_DOCS.FAQ },
  ],
};

/** `gatewayWithdrawals`: the page's rows hold a withdrawal as ETH through the
 *  Spark WETH gateway, which the Withdrawn figure includes. */
export function sparkEconomicsExplanation(data: AaveV3TowerData, gatewayWithdrawals = false): ReactNode {
  return aaveV3EconomicsExplanation(data, {
    ...SPARK_OPTS,
    liquidationOnCard: true,
    withdrawnWords: gatewayWithdrawals
      ? "withdrawn, withdrawals as ETH through the Spark WETH gateway included"
      : undefined,
  });
}

/** The modal names only the rows the panel shows, where it is given the panel's data. */
export function sparkEconomicsContent(data?: AaveV3TowerData): LearnMoreContent {
  return aaveV3EconomicsContent(SPARK_OPTS, data);
}
