// The /start asset step's read (G9; rails-ops ui-jobs 553, door 2): one
// coin's vaults from the vault index, each with the readout's figures
// (lib/vaults/health.ts) over the daily store's 130 days, for the step's cards.
// ----------------------------------------------------------------------------
// The candidates are the coin's vaults that held something at the last read,
// largest first. Vaults the chain shows as illiquid (ui-jobs 540) or with lost
// assets (543) are hidden until the reader asks for them; the step says how
// many. The series are read for the 40 largest of either set, so the other
// two orders rank among vaults of some size. The step owns no page: each
// card opens the vault's page under its protocol (decision 0028 point 8).
//
// SERVER-ONLY: the index and the series read use the bearer token.

import { loadVaultIndex } from "@/lib/vaults/index-read";
import { chainName, vaultIndexHref } from "@/lib/vaults/index-rosters";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import { vaultHealth, shareOf } from "@/lib/vaults/health";
import { ASSET_DOOR, pctText, shortHex, stewardRole } from "@/lib/vaults/health-words";
import { loadVaultHealthSeries } from "@/lib/vaults/health-read";
import { tooSmallToMeasure } from "@/lib/vaults/yield";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortAddress } from "@/lib/shared/vault-amount-text";

/** How many candidates the series are read for, in each set. */
export const ASSET_DOOR_POOL = 40;

/** One card, ready to draw: plain values, the order keys beside them. */
export interface AssetCard {
  key: string;
  href: string;
  name: string;
  family: string;
  chain: string;
  hidden: boolean;
  /** The vault summary the card's icon reads. */
  vault: VaultSummary;
  yieldText: string | null;
  rangeText: string;
  sizeText: string;
  changeText: string;
  steward: { address: string; role: string } | null;
  withdrawals: { value: string; sub: string | null } | null;
  /** Order keys: what the vault holds, the 30-day yield, the 90-day range. */
  held: number;
  yearly30: number | null;
  range: number | null;
}

export interface AssetDoorRead {
  symbol: string;
  cards: AssetCard[];
  /** Vaults hidden by default that hold something. */
  hiddenCount: number;
}

const held = (v: VaultSummary) => (v.totalAssets?.value ?? 0) - (v.lostAssets?.value ?? 0);

/** Hidden by default: a chain reading the index already shows as a pill. */
const hiddenByDefault = (v: VaultSummary) => Boolean(v.illiquid) || v.standing.includes("lost-assets");

function withdrawalsText(v: VaultSummary): AssetCard["withdrawals"] {
  const w = ASSET_DOOR.card;
  if (v.standing.includes("paused")) return { value: w.paused, sub: null };
  if (v.family === "umbrella-stake") return { value: w.cooldown, sub: w.cooldownSub };
  if (v.withdrawable)
    return {
      value: w.withdrawable(Math.min(1, shareOf(v.withdrawable.withdrawable, v.withdrawable.queueAssets))),
      sub: w.withdrawableSub,
    };
  return null;
}

export async function readAssetDoor(symbol: string): Promise<AssetDoorRead> {
  const { vaults } = await loadVaultIndex();
  const mine = vaults.filter((v) => v.asset.named && v.asset.symbol.toLowerCase() === symbol.toLowerCase());
  const funded = mine.filter((v) => held(v) > 0).sort((a, b) => held(b) - held(a));
  const shown = funded.filter((v) => !hiddenByDefault(v));
  const pool = [...new Set([...shown.slice(0, ASSET_DOOR_POOL), ...funded.slice(0, ASSET_DOOR_POOL)])];
  const series = await loadVaultHealthSeries(pool);
  const w = ASSET_DOOR.card;
  const cards = pool.map((v): AssetCard => {
    const s = series.get(`${v.chainId}:${v.address}`);
    const h = vaultHealth({
      family: v.family,
      price: s?.price ?? null,
      assets: s?.assets ?? null,
      tooSmall: v.totalAssets != null && tooSmallToMeasure(v.totalAssets.raw),
      exit: null,
      steward: null,
    });
    const y = h.yield.kind === "yield" ? h.yield : null;
    const size = h.size.kind === "size" ? h.size : null;
    return {
      key: `${v.chainId}:${v.address}`,
      href: vaultIndexHref(v),
      name: vaultDisplayName(v) ?? shortAddress(v.address),
      family: VAULT_FAMILIES[v.family].singular,
      chain: chainName(v.chainId),
      hidden: hiddenByDefault(v),
      vault: v,
      yieldText: y ? pctText(y.yearly30) : null,
      rangeText: y && y.low != null && y.high != null ? w.range(y.low, y.high) : w.noRange,
      sizeText: `${formatCompact(held(v))} ${v.asset.symbol}`,
      changeText:
        size && size.change != null ? w.sizeChange(size.change, size.span.to.day - size.span.from.day) : w.noChange,
      steward: v.steward ? { address: shortHex(v.steward.address), role: stewardRole(v.steward.role) } : null,
      withdrawals: withdrawalsText(v),
      held: held(v),
      yearly30: y ? y.yearly30 : null,
      // A share price that did not grow has no yield to range: it sorts last.
      range: y && y.yearly30 > 0 && y.low != null && y.high != null ? y.high - y.low : null,
    };
  });
  return {
    symbol: mine[0]?.asset.symbol ?? symbol,
    cards,
    hiddenCount: funded.length - shown.length,
  };
}
