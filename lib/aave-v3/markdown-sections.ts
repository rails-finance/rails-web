// Markdown lines the Aave V3 and SparkLend position exports share
// (lib/aave-v3/position-to-markdown.ts, lib/spark/position-to-markdown.ts):
// the borrowed asset's price at liquidation, and the "Protocol changes"
// section, read from the PoolConfigurator log the position chart's markers
// read (/api/chain/aave-v3/config-log, through hooks/useAaveFamilyHealth.ts's
// `useExportConfigLog`, so the page reads the log once).

import type { ChainId } from "@/lib/shared/chains";
import { explorerUrl } from "@/lib/shared/chains";
import { CHANGES_UNAVAILABLE_NOTE, type ChangeLogRead } from "@/lib/shared/change-log-read";
import { aaveReserveChanges, type AaveReserveLog } from "@/lib/shared/aave-reserve-changes";
import { aaveDebtLiquidation } from "@/lib/shared/aave-debt-liquidation";
import { isStableDenominated } from "@/lib/aave-v4/asset-class";
import { num, usd, fmtUtc } from "@/lib/shared/position-markdown";
import type { AaveConfigLogAnswer } from "./config-changes";

interface Reserve {
  symbol: string;
  address: string;
  amount: number;
}

/** "- **Debt price at liquidation:** …" where the debt is one non-stable
 *  asset; null otherwise. Shaped as the collateral's "Liquidation price" line. */
export function debtLiquidationLine(
  hf: number | null | undefined,
  borrows: readonly Reserve[],
  priceByAddress: Record<string, number> | undefined,
): string | null {
  const read = aaveDebtLiquidation(
    hf,
    borrows.map((r) => ({
      symbol: r.symbol,
      amount: r.amount,
      price: priceByAddress?.[r.address.toLowerCase()] ?? null,
      stable: isStableDenominated(r.symbol),
    })),
  );
  if (!read) return null;
  return (
    `- **Debt price at liquidation:** ${usd(read.liqPrice)} / ${read.symbol} ` +
    `(current oracle price ${usd(read.price)} — a ${num(read.risePct, 1)}% rise reaches liquidation, with the collateral's price held)`
  );
}

/** The "Protocol changes" section: every parameter change on a reserve the
 *  position holds or held, from its first touch (`since`) on. Empty where
 *  the market has no change log (`read` absent) or nothing changed. */
export function protocolChangesSection(
  read: ChangeLogRead<AaveConfigLogAnswer> | undefined,
  reserves: readonly { symbol: string; address: string }[],
  since: number | null | undefined,
): string[] {
  if (!read) return [];
  if (read.unavailable) return ["## Protocol changes", "", CHANGES_UNAVAILABLE_NOTE, ""];
  if (!read.log) return ["## Protocol changes", "", "Parameter changes still loading", ""];
  const held = new Map<string, string>();
  for (const r of reserves) if (!held.has(r.address.toLowerCase())) held.set(r.address.toLowerCase(), r.symbol);
  const rows = aaveReserveChanges(read.log.logs as AaveReserveLog[], held, since ?? 0);
  if (rows.length === 0) return [];
  const chain = read.log.chainId as ChainId;
  const out = [
    "## Protocol changes",
    "",
    `Each row is a change to a reserve this position holds, from the ${read.log.configurator} PoolConfigurator's logs since the position's first touch, oldest first.`,
    "",
    "| Date | Reserve | Change | Receipt |",
    "|------|---------|--------|---------|",
  ];
  for (const r of rows) {
    const logs = r.logIndexes.length === 1 ? `log ${r.logIndexes[0]}` : `logs ${r.logIndexes.join(", ")}`;
    out.push(
      `| ${fmtUtc(r.timestamp)} | ${r.symbol} | ${r.words} | block ${r.block.toLocaleString("en-US")}, ` +
        `tx [${r.txHash.slice(0, 10)}…](${explorerUrl(chain, "tx", r.txHash)}), ${logs} in the transaction |`,
    );
  }
  out.push("");
  return out;
}
