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
import { vaultHealth, type HealthInput } from "@/lib/vaults/health";
import { healthLines } from "@/lib/vaults/health-words";
import { tooSmallToMeasure } from "@/lib/vaults/yield";
import { loadVaultHealthSeries } from "@/lib/vaults/health-read";

export interface VaultHealthSectionProps {
  chainId: ChainId;
  family: VaultFamily;
  vault: { address: string; name: string; assetSymbol: string; decimals: number };
  /** `totalAssets()` at the page block, raw; null where unread. */
  totalAssetsRaw: string | null;
  /** Why no amount in the asset is printed (its decimals disagree, ui-jobs
   *  664): the Size line says so in place of the totals. */
  amountsWithheld?: string;
  block: number;
  readBy?: ServerRead | null;
  /** The holder's claim and `maxWithdraw` at the block, raw. */
  holder?: HealthInput["holder"];
  exit: HealthInput["exit"];
  paused?: boolean;
  shutdown?: boolean;
  /** The illiquid test's sentence, where it catches a market. */
  caught?: string | null;
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
  const health = vaultHealth({
    family: p.family,
    price: series?.price ?? null,
    assets: series?.assets ?? null,
    tooSmall: p.totalAssetsRaw != null && tooSmallToMeasure(p.totalAssetsRaw),
    holder: p.holder ?? null,
    exit: p.exit,
    paused: p.paused,
    shutdown: p.shutdown,
    caught: p.caught ?? null,
    ...(p.lostAssets !== undefined ? { lostAssets: p.lostAssets } : {}),
    steward: p.steward,
  });
  const lines = healthLines(
    health,
    {
      family: p.family,
      assetSymbol: p.vault.assetSymbol,
      decimals: p.vault.decimals,
      amountsWithheld: p.amountsWithheld,
    },
    WORDS,
  );
  return (
    <VaultHealth
      lines={lines}
      health={health}
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
