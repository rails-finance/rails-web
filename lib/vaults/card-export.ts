// The vault card's exports (V2's ⋮: Copy, View as Markdown, Download CSV):
// the four headlines, the family's stats and the "Where the assets are" table,
// as the card and the table print them, with the block they were read at.

import { formatDate } from "@/lib/date";
import { assetText, sharePriceText } from "@/lib/shared/vault-amount-text";
import type { VaultSummary } from "@/lib/vaults/summary";
import { changeText, jumpTail, yieldPct, YIELD_LABEL, type VaultYield } from "@/lib/vaults/yield";

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
    // An asset whose decimals disagree exports an empty cell (ui-jobs 664).
    [
      "Total assets",
      v.assetScale ? "" : v.totalAssets ? `${assetText(v.totalAssets, v.asset.decimals)} ${unit}` : "not read",
    ],
    [
      "Share price",
      v.assetScale ? "" : v.sharePrice ? `${sharePriceText(v.sharePrice, v.asset.decimals)} ${unit}` : "not read",
    ],
    [
      YIELD_LABEL,
      y && "yearly" in y
        ? `${yieldPct(y.yearly)} (share price ${changeText(y.change)} over the ${y.days} days to block ${n(y.to.block)}${y.jump ? jumpTail(y.jump, (d) => formatDate(new Date(d * 86_400_000))) : ""})`
        : y?.none === "too-small" && v.totalAssets
          ? `too small to measure (the vault holds ${assetText(v.totalAssets, v.asset.decimals)} ${unit} at block ${n(v.readAt.block)})`
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

/** "Where the assets are" alone, for its section's ⋮. */
export function vaultAssetsMarkdown(v: VaultSummary, m: VaultExportModel): string {
  const name = v.name ?? v.catalogName ?? v.symbol ?? v.address;
  return [
    `# Where the assets are: ${name}`,
    "",
    `\`${v.address}\` · chain ${v.chainId} · read at block ${n(v.readAt.block)}`,
    "",
    `| Venue | Amount · ${v.asset.symbol} | Share of this vault |`,
    "|---|---:|---:|",
    ...m.rows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
    "",
    `Exported ${new Date().toISOString()}.`,
  ].join("\n");
}

export function vaultAssetsCsv(v: VaultSummary, m: VaultExportModel): string {
  const rows: string[][] = [
    ["venue", `amount_${v.asset.symbol}`, "share_of_this_vault", "block"],
    ...m.rows.map(([a, b, c]) => [a, b, c, String(v.readAt.block)]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

/** The section ⋮'s exports for "Where the assets are". */
export const vaultAssetsExports = (v: VaultSummary, m: VaultExportModel) => ({
  markdown: { build: () => vaultAssetsMarkdown(v, m), copySubtitle: "The table as Markdown, for an LLM" },
  csv: {
    filename: `${v.symbol ?? v.address}-where-the-assets-are-${v.readAt.block}.csv`,
    build: () => vaultAssetsCsv(v, m),
    subtitle: "One row per venue",
  },
});
