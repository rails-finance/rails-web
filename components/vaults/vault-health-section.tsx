// The holder pages' "How the vault is doing" (V7; rails-ops ui-jobs 553): the
// readout's 130 days of share price and total assets from the daily store
// (lib/vaults/yield-read.ts), and what the page read at its block, worked into
// the five lines (lib/vaults/health.ts) on the server. Streamed behind its own
// Suspense boundary by each page, so the card paints first.
//
// SERVER-ONLY: the series read uses the bearer token.

import { VaultHealth } from "@/components/vaults/vault-health";
import type { ReadContract } from "@/components/shared/read-stamp";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { formatDate } from "@/lib/date";
import { formatCompact } from "@/lib/shared/format-compact";
import type { ChainId } from "@/lib/shared/chains";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { VaultFamily } from "@/lib/vaults/families";
import { healthLines, vaultHealth, type HealthInput } from "@/lib/vaults/health";
import { tooSmallToMeasure } from "@/lib/vaults/yield";
import { loadVaultHealthSeries } from "@/lib/vaults/health-read";

export interface VaultHealthSectionProps {
  chainId: ChainId;
  family: VaultFamily;
  vault: { address: string; name: string; assetSymbol: string; decimals: number };
  /** `totalAssets()` at the page block, raw; null where unread. */
  totalAssetsRaw: string | null;
  block: number;
  readBy?: ServerRead | null;
  exit: HealthInput["exit"];
  lostAssets?: HealthInput["lostAssets"];
  steward: HealthInput["steward"];
  contracts: ReadContract[];
  links?: SectionMenuLink[];
}

const WORDS = {
  amount: formatCompact,
  day: (day: number) => formatDate(new Date(day * 86_400_000)),
};

export async function VaultHealthSection(p: VaultHealthSectionProps) {
  const address = p.vault.address.toLowerCase();
  const series = (await loadVaultHealthSeries([{ chainId: p.chainId, address }])).get(`${p.chainId}:${address}`);
  const health = vaultHealth(
    {
      family: p.family,
      assetSymbol: p.vault.assetSymbol,
      decimals: p.vault.decimals,
      price: series?.price ?? null,
      assets: series?.assets ?? null,
      tooSmall: p.totalAssetsRaw != null && tooSmallToMeasure(p.totalAssetsRaw),
      exit: p.exit,
      ...(p.lostAssets !== undefined ? { lostAssets: p.lostAssets } : {}),
      steward: p.steward,
    },
    WORDS,
  );
  return (
    <VaultHealth
      lines={healthLines(health)}
      vault={{
        ...p.vault,
        address,
        priceKey: series?.priceKey ?? `vault:${p.chainId}:${address}`,
        assetsKey: series?.assetsKey ?? `vault-assets:${p.chainId}:${address}`,
      }}
      chainId={p.chainId}
      block={p.block}
      readBy={p.readBy}
      contracts={p.contracts}
      links={p.links}
    />
  );
}
