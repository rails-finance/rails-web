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
  wholeUsd,
  type AaveV3EconomicsOpts,
} from "@/lib/aave-v3/economics-explanation";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
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

/** Per debt asset over the rows: what was borrowed and repaid, in tokens and
 *  at each event's price. */
interface DebtHistory {
  symbol: string;
  borrowed: number;
  borrowedUsd: number;
  repaid: number;
  repaidUsd: number;
  /** Every event carried a price. */
  priced: boolean;
  /** Any event priced it more than 2% away from a dollar. */
  moves: boolean;
}

function debtHistories(events: readonly BaseActivityEvent[]): DebtHistory[] {
  const by = new Map<string, DebtHistory>();
  const get = (symbol: string) => {
    let h = by.get(symbol);
    if (!h) {
      h = { symbol, borrowed: 0, borrowedUsd: 0, repaid: 0, repaidUsd: 0, priced: true, moves: false };
      by.set(symbol, h);
    }
    return h;
  };
  for (const e of events) {
    if (!isSparkEvent(e)) continue;
    const d = e.context.data;
    const t = d.eventType;
    if (t !== "borrow" && t !== "repay" && t !== "liquidation") continue;
    const amount = Math.abs(Number(t === "liquidation" ? d.debtToCover : d.assetsDelta)) || 0;
    const price = t === "liquidation" ? d.debtPrice?.usd : d.price?.usd;
    const h = get(d.reserveSymbol);
    if (price == null) h.priced = false;
    else if (Math.abs(price - 1) > 0.02) h.moves = true;
    if (t === "borrow") {
      h.borrowed += amount;
      h.borrowedUsd += amount * (price ?? 0);
    } else {
      h.repaid += amount;
      h.repaidUsd += amount * (price ?? 0);
    }
  }
  return [...by.values()];
}

const tokens = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** The (i)'s lines on the wallet's other debts and the debt side's price
 *  change, from the page's rows (the whole history only). */
function debtItems(data: AaveV3TowerData, events: readonly BaseActivityEvent[], heldDebts: string[]): ReactNode[] {
  const all = debtHistories(events);
  const others = all.filter((h) => !heldDebts.includes(h.symbol)).map((h) => h.symbol);
  const items: ReactNode[] = [];
  if (others.length > 0 && heldDebts.length > 0)
    items.push(
      <span key="other-debts">
        Besides {heldDebts.join(" and ")}, the wallet has borrowed {joinWords(others)}, all since repaid; the Borrowed,
        Repaid and interest rows count them too.
      </span>,
    );
  const move = data.valued ? (data.debt.priceChange?.usd ?? 0) : 0;
  const movers = all.filter((h) => h.moves && h.priced && h.borrowed > 0);
  if (Math.abs(move) >= 0.5 && movers.length > 0)
    items.push(
      <span key="debt-price">
        The debt side&apos;s price change comes from debt in an asset whose price moves:{" "}
        {movers.map((h, i) => (
          <span key={h.symbol}>
            {i > 0 ? "; " : null}
            {tokens(h.borrowed)} {h.symbol} borrowed was worth {wholeUsd(h.borrowedUsd)} on the days it was borrowed,
            and the {tokens(h.repaid)} {h.symbol} repaid was worth {wholeUsd(h.repaidUsd)} on the days it was repaid
          </span>
        ))}
        . A dollar stablecoin&apos;s debt adds almost nothing to it.
      </span>,
    );
  return items;
}

const joinWords = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** `gatewayWithdrawals`: the page's rows hold a withdrawal as ETH through the
 *  Spark WETH gateway, which the Withdrawn figure includes. `events`: the whole
 *  history's rows, where the page holds them, for the lines on the wallet's
 *  other debts; `heldDebts` the debts it holds now. */
export function sparkEconomicsExplanation(
  data: AaveV3TowerData,
  gatewayWithdrawals = false,
  events?: readonly BaseActivityEvent[] | null,
  heldDebts: string[] = [],
  pricesReading = false,
): ReactNode {
  return aaveV3EconomicsExplanation(data, {
    ...SPARK_OPTS,
    liquidationOnCard: true,
    fullUsd: data.fullUsdAmounts === true,
    pricesReading,
    withdrawnWords: gatewayWithdrawals
      ? "withdrawn, withdrawals as ETH through the Spark WETH gateway included"
      : undefined,
    extraItems: [...(events ? debtItems(data, events, heldDebts) : []), INTEREST_TWO_WAYS],
  });
}

/** The card and this panel count interest over different spans. */
const INTEREST_TWO_WAYS = (
  <span key="interest-two-ways">
    Interest is counted two ways: the card&apos;s &ldquo;incl. interest since&rdquo; figure counts from the day each
    balance was last opened from nothing, and the interest rows here count the whole life, balances since closed
    included. With no balance ever closed, the two are equal.
  </span>
);

/** The modal names only the rows the panel shows, where it is given the panel's data. */
export function sparkEconomicsContent(data?: AaveV3TowerData): LearnMoreContent {
  return aaveV3EconomicsContent(SPARK_OPTS, data);
}
