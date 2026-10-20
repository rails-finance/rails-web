// The vault card's exports (V2's ⋮: Copy, View as Markdown, Download CSV):
// the four headlines, the family's stats and the "Where the assets are" table,
// as the card and the table print them, with the block they were read at.

import { formatDate } from "@/lib/date";
import { assetText, sharePriceText } from "@/lib/shared/vault-amount-text";
import type { VaultSummary } from "@/lib/vaults/summary";
import { changeText, yieldText, type VaultYield } from "@/lib/vaults/yield";

export interface VaultExportModel {
  /** The stats as printed: label and value in words. */
  stats: [label: string, value: string][];
  /** The table's rows: venue, amount in the asset, share of this vault. */
  rows: [venue: string, amount: string, share: string][];
}

const n = (v: number) => v.toLocaleString("en-US");

function headlines(v: VaultSummary, y: VaultYield | undefined): [string, string][] {
  const unit = v.asset.symbol;
  return [
    ["Total assets", v.totalAssets ? `${assetText(v.totalAssets, v.asset.decimals)} ${unit}` : "not read"],
    ["Share price", v.sharePrice ? `${sharePriceText(v.sharePrice, v.asset.decimals)} ${unit}` : "not read"],
    [
      "Yield",
      y && "yearly" in y
        ? `${yieldText(y.yearly)} (share price ${changeText(y.change)} over the ${y.days} days to block ${n(y.to.block)}${y.jump ? `, ${changeText(y.jump.change)} of it on ${formatDate(new Date(y.jump.day * 86_400_000))}` : ""})`
        : "no figure",
    ],
    [
      "Holders",
      v.census ? `${n(v.census.holders)} (${n(v.census.live)} open at block ${n(v.census.atBlock)})` : "no census",
    ],
  ];
}

export function vaultCardMarkdown(v: VaultSummary, y: VaultYield | undefined, m: VaultExportModel): string {
  const name = v.name ?? v.catalogName ?? v.symbol ?? v.address;
  const lines = [
    `# ${name}`,
    "",
    `${v.releaseLabel} · \`${v.address}\` · chain ${v.chainId} · read at block ${n(v.readAt.block)}`,
    "",
    "| Figure | Value |",
    "|---|---|",
    ...[...headlines(v, y), ...m.stats].map(([l, t]) => `| ${l} | ${t} |`),
    "",
    "## Where the assets are",
    "",
    `| Venue | Amount · ${v.asset.symbol} | Share of this vault |`,
    "|---|---:|---:|",
    ...m.rows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
    "",
    `Exported ${new Date().toISOString()}.`,
  ];
  return lines.join("\n");
}

const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function vaultCardCsv(v: VaultSummary, y: VaultYield | undefined, m: VaultExportModel): string {
  const rows: string[][] = [
    ["section", "label", "value", "share_of_this_vault"],
    ...[...headlines(v, y), ...m.stats].map(([l, t]) => ["figure", l, t, ""]),
    ...m.rows.map(([a, b, c]) => ["where the assets are", a, b, c]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}
