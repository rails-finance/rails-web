// The vault comparison's read (rails-ops ui-jobs 553, door 3; /vaults/compare).
// ----------------------------------------------------------------------------
// Each chosen vault is a row of the vault index (lib/vaults/index-read.ts) and
// is read again by its family's own loader, the read its page makes, at that
// loader's block: MetaMorpho's legs and liquidity, Yearn's strategies and idle
// assets, the Aave vault's reserve and cooldown, Maple's loan books and cash.
// From those and the daily store's 130 days (lib/vaults/health-read.ts) come
// the readout's five lines (lib/vaults/health.ts), with no holder. Then:
//
//   Fees: MetaMorpho's `fee()` (WAD) at the loader's block; a Yearn vault's
//     accountant's `getVaultConfig(vault)`; the static aTokens and Umbrella
//     stake tokens set none; Savings GHO's and Maple's are not read.
//   Where the money is lent: as the vault's page states it.
//   Who holds it: the census's six largest live holders and its live count
//     (Maple has no census).
//
// No figure here is scored; the page sorts by the figures it states. Like the
// index, the page carries no receipts: each vault's page keeps them.
//
// SERVER-ONLY: the loaders read the chain and the bearer token.

import { parseAbi } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { formatDate } from "@/lib/date";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { ChainId } from "@/lib/shared/chains";
import { vaultHeadClient } from "@/lib/sources/api/head-reads-client";
import { loadMorphoBaseVault, type MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import { loadYearnEthereumVault, type YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";
import { loadAaveEthereumVault, type AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import { resolveMaplePoolState, type MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { VAULT_SHAPE_FACET_LABEL, isVaultPositionShape } from "@/lib/aave-vaults/vault-position";
import type { MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { chainName, vaultIndexHref } from "@/lib/vaults/index-rosters";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import { vaultHealth, shareOf, type HealthInput } from "@/lib/vaults/health";
import { healthLines, shortHex, type HealthLine } from "@/lib/vaults/health-words";
import { loadVaultHealthSeries } from "@/lib/vaults/health-read";
import { illiquidSentence } from "@/lib/vaults/illiquid";
import { tooSmallToMeasure } from "@/lib/vaults/yield";
import { compareKey, isCompareKey, DONUT_HOLDERS, type CompareFigures } from "@/lib/vaults/compare";
import {
  EXPOSURE_SHOWN,
  EXPOSURE_WORDS as X,
  FEE_WORDS,
  HOLDER_WORDS,
  type CompareCell,
  type ExposureRow,
} from "@/lib/vaults/compare-words";

export type CompareExposure = { kind: "rows"; rows: ExposureRow[]; more: number } | { kind: "cell"; cell: CompareCell };

export interface CompareHolder {
  holder: string;
  share: number;
  /** The census's word for what the address is; null where it stored none. */
  shape: string | null;
}

export type CompareHolders = { kind: "donut"; top: CompareHolder[]; live: number } | { kind: "none"; why: string };

/** One column, ready to draw: plain values only. */
export interface CompareColumn {
  key: string;
  href: string;
  name: string;
  family: string;
  chain: string;
  /** The index row, for the column's icon. */
  vault: VaultSummary;
  /** The family loader's block; null where it did not answer. */
  block: number | null;
  /** When that read was taken (ISO); null where it did not answer. */
  readAt: string | null;
  lines: HealthLine[];
  fees: CompareCell;
  exposure: CompareExposure;
  holders: CompareHolders;
  figures: CompareFigures;
}

export interface CompareRead {
  columns: CompareColumn[];
  /** Keys in `?v=` the index does not hold, as given. */
  notFound: string[];
}

const WORDS = {
  amount: formatCompact,
  day: (day: number) => formatDate(new Date(day * 86_400_000)),
};

const held = (v: VaultSummary) => (v.totalAssets?.value ?? 0) - (v.lostAssets?.value ?? 0);

const WAD = 1e18;
const BPS = 10_000;

// ── The family reads ───────────────────────────────────────────────────────

/** What a family's loader gave: the health inputs read at its block, its
 *  fees and where its money is lent. */
interface FamilyRead {
  block: number | null;
  readAt: string | null;
  health: Pick<HealthInput, "exit" | "paused" | "shutdown" | "caught" | "lostAssets" | "steward">;
  fees: CompareCell;
  exposure: CompareExposure;
}

const UNANSWERED: Omit<FamilyRead, "health"> = {
  block: null,
  readAt: null,
  fees: FEE_WORDS.unanswered,
  exposure: { kind: "cell", cell: { headline: null, sentence: X.unanswered, read: false } },
};

/** The index row's own readings, where the family's loader did not answer. */
function fromSummary(v: VaultSummary): FamilyRead {
  const steward = v.steward
    ? {
        role: v.family === "umbrella-stake" && v.steward.role === "owner" ? ("umbrellaOwner" as const) : v.steward.role,
        address: v.steward.address,
        block: v.readAt.block,
      }
    : null;
  return {
    ...UNANSWERED,
    readAt: v.readAt.timestamp,
    health: {
      exit: v.withdrawable ? { kind: "queue", ...v.withdrawable } : null,
      paused: v.standing.includes("paused"),
      shutdown: v.standing.includes("shut-down"),
      caught: v.illiquid ? illiquidSentence(v.illiquid) : null,
      ...(v.family === "metamorpho"
        ? { lostAssets: v.lostAssets ? { raw: v.lostAssets.raw, block: v.readAt.block } : null }
        : {}),
      steward,
    },
  };
}

/** The top five places, then how many more. */
function topRows(rows: ExposureRow[]): CompareExposure {
  const sorted = [...rows].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  return { kind: "rows", rows: sorted.slice(0, EXPOSURE_SHOWN), more: Math.max(0, sorted.length - EXPOSURE_SHOWN) };
}

const FEE_ABI = parseAbi(["function fee() view returns (uint96)"]);

async function metaMorpho(v: VaultSummary): Promise<FamilyRead> {
  const d: MorphoBaseVaultResponse = await loadMorphoBaseVault(v.address, undefined, {
    chainId: v.chainId as MetaMorphoChainId,
  });
  if (d.chainStale) return fromSummary(v);
  const fee = await vaultHeadClient(v.chainId as ChainId)
    .readContract({
      address: v.address as `0x${string}`,
      abi: FEE_ABI,
      functionName: "fee",
      blockNumber: BigInt(d.blockNumber),
    })
    .then((raw) => Number(raw) / WAD)
    .catch(() => null);
  const l = d.liquidity;
  return {
    block: d.blockNumber,
    readAt: new Date().toISOString(),
    health: {
      exit: l ? { kind: "queue", block: l.block, queueAssets: l.queueAssets, withdrawable: l.withdrawable } : null,
      caught: l?.illiquid ? illiquidSentence(l.illiquid) : null,
      lostAssets: d.lostAssets ? { raw: d.lostAssets.raw, block: d.blockNumber } : null,
      steward: d.vault.curator
        ? { role: "curator", address: d.vault.curator, block: d.blockNumber }
        : { role: "owner", address: d.vault.owner, block: d.blockNumber },
    },
    fees: fee == null ? FEE_WORDS.unanswered : FEE_WORDS.metamorpho(fee),
    exposure:
      d.legs.length === 0
        ? { kind: "cell", cell: { headline: null, sentence: X.none, read: true } }
        : topRows(
            d.legs.map((leg) => ({
              label: leg.isIdle ? X.idleMarket : (leg.collateralSymbol ?? shortHex(leg.collateralToken)),
              sub: leg.isIdle ? X.idleMarketSub : X.lltv(leg.lltv),
              share: leg.shareOfAllocated ?? 0,
            })),
          ),
  };
}

const ACCOUNTANT_ABI = parseAbi([
  "function getVaultConfig(address vault) view returns ((uint16 managementFee, uint16 performanceFee, uint16 refundRatio, uint16 maxFee, uint16 maxGain, uint16 maxLoss, bool custom))",
]);

async function yearn(v: VaultSummary): Promise<FamilyRead> {
  const d: YearnVaultResponse = await loadYearnEthereumVault(v.address);
  if (d.chainStale) return fromSummary(v);
  const { totalIdle, totalAssets, accountant } = d.vault;
  let fees: CompareCell = FEE_WORDS.yearnNoAccountant;
  if (accountant) {
    const config = await vaultHeadClient(1)
      .readContract({
        address: accountant as `0x${string}`,
        abi: ACCOUNTANT_ABI,
        functionName: "getVaultConfig",
        args: [v.address as `0x${string}`],
        blockNumber: BigInt(d.blockNumber),
      })
      .catch(() => null);
    // An accountant of another kind answers nothing here: its fees are not read.
    fees = config ? FEE_WORDS.yearn(config.performanceFee / BPS, config.managementFee / BPS) : FEE_WORDS.notRead;
  }
  const total = totalAssets?.raw;
  const outside =
    d.vault.totalDebt && d.strategies.every((s) => s.currentDebt)
      ? BigInt(d.vault.totalDebt.raw) - d.strategies.reduce((a, s) => a + BigInt(s.currentDebt!.raw), BigInt(0))
      : null;
  const rows: ExposureRow[] =
    total == null
      ? []
      : [
          ...d.strategies.map((s) => ({
            label: s.name ?? shortHex(s.address),
            sub: s.name ? shortHex(s.address) : null,
            share: s.currentDebt ? shareOf(s.currentDebt.raw, total) : 0,
          })),
          ...(totalIdle ? [{ label: X.yearnIdle, sub: X.yearnIdleSub, share: shareOf(totalIdle.raw, total) }] : []),
          // What the vault records as lent beyond its default queue's debts, as its page states it.
          ...(outside != null && outside > BigInt(0)
            ? [{ label: X.yearnOutside, sub: X.yearnOutsideSub, share: shareOf(outside.toString(), total) }]
            : []),
        ];
  return {
    block: d.blockNumber,
    readAt: new Date().toISOString(),
    health: {
      exit:
        totalIdle && totalAssets
          ? { kind: "idle", block: d.blockNumber, idle: totalIdle.raw, total: totalAssets.raw }
          : null,
      shutdown: d.vault.shutdown === true,
      steward: d.vault.roleManager ? { role: "roleManager", address: d.vault.roleManager, block: d.blockNumber } : null,
    },
    fees,
    exposure:
      rows.length === 0
        ? { kind: "cell", cell: { headline: null, sentence: X.unanswered, read: false } }
        : topRows(rows),
  };
}

async function aave(v: VaultSummary): Promise<FamilyRead> {
  const d: AaveEthereumVaultResponse = await loadAaveEthereumVault(v.address);
  if (d.chainStale || !d.served) return fromSummary(v);
  const block = d.blockNumber;
  if (v.family === "sgho")
    return {
      block,
      readAt: new Date().toISOString(),
      health: { exit: null, paused: d.sgho?.paused === true, steward: null },
      fees: FEE_WORDS.notRead,
      exposure: { kind: "cell", cell: { ...X.sgho, read: true } },
    };
  if (v.family === "umbrella-stake") {
    const u = d.umbrella;
    return {
      block,
      readAt: new Date().toISOString(),
      health: {
        exit:
          u?.cooldownSeconds != null && u.unstakeWindowSeconds != null
            ? { kind: "cooldown", block, cooldownSeconds: u.cooldownSeconds, windowSeconds: u.unstakeWindowSeconds }
            : null,
        steward: u?.owner ? { role: "umbrellaOwner", address: u.owner, block } : null,
      },
      fees: FEE_WORDS.umbrella,
      exposure: u?.reserve
        ? {
            kind: "rows",
            rows: [
              { label: X.umbrellaReserve(u.reserve.symbol), sub: X.umbrellaSub(u.wrapper?.symbol ?? null), share: 1 },
            ],
            more: 0,
          }
        : { kind: "cell", cell: { headline: null, sentence: X.unanswered, read: false } },
    };
  }
  return {
    block,
    readAt: new Date().toISOString(),
    health: { exit: null, steward: null },
    fees: FEE_WORDS.stata,
    exposure: {
      kind: "rows",
      rows: [{ label: X.stataReserve(d.vault.asset.symbol), sub: X.stataSub, share: 1 }],
      more: 0,
    },
  };
}

async function maple(v: VaultSummary): Promise<FamilyRead> {
  const pool = MAPLE_POOLS.find((p) => p.pool === v.address);
  const s: MaplePoolState | undefined = pool ? (await resolveMaplePoolState()).get(pool.key) : undefined;
  if (!s) return fromSummary(v);
  const w = X.maple;
  const parts = [
    { label: w.openTerm, sub: w.openTermSub, amount: s.openTermAum },
    { label: w.fixedTerm, sub: w.fixedTermSub, amount: s.fixedTermAum },
    { label: w.strategies, sub: w.strategiesSub, amount: s.strategiesAum },
    { label: w.cash, sub: w.cashSub, amount: s.cash },
  ].filter((p) => p.amount > 0);
  const sum = parts.reduce((a, p) => a + p.amount, 0);
  return {
    block: s.blockNumber,
    readAt: new Date().toISOString(),
    health: {
      exit: null,
      steward: s.poolDelegate ? { role: "poolDelegate", address: s.poolDelegate, block: s.blockNumber } : null,
    },
    fees: FEE_WORDS.notRead,
    exposure:
      sum > 0
        ? topRows(parts.map((p) => ({ label: p.label, sub: p.sub, share: p.amount / sum })))
        : { kind: "cell", cell: { headline: null, sentence: X.none, read: true } },
  };
}

async function familyRead(v: VaultSummary): Promise<FamilyRead> {
  try {
    if (v.family === "metamorpho") return await metaMorpho(v);
    if (v.family === "yearn-v3") return await yearn(v);
    if (v.family === "maple-pool") return await maple(v);
    return await aave(v);
  } catch (error) {
    console.error(`vault compare: ${v.family} ${v.address} did not answer`, error);
    return fromSummary(v);
  }
}

// ── The census ─────────────────────────────────────────────────────────────

const CENSUS_TIMEOUT_MS = 5000;

/** The census's largest live holders, read from rails-server direct with the
 *  bearer token, as the index reads the census header. */
async function holdersOf(v: VaultSummary): Promise<CompareHolders> {
  const none = { kind: "none" as const, why: HOLDER_WORDS.noCensus(v.family) };
  const base = process.env.RAILS_API_URL;
  const family = VAULT_FAMILIES[v.family].census;
  if (!base || !v.census || family == null) return none;
  const qs = new URLSearchParams({
    chain: String(v.chainId),
    vault: v.address,
    status: "live",
    sortBy: "share",
    sortOrder: "desc",
    limit: String(DONUT_HOLDERS),
    overlay: "0",
  });
  // Each family's own census word: a chain-1 read without it answers Aave's three.
  qs.set("families", family);
  try {
    const res = await fetch(
      `${base}/api/vaults/positions?${qs.toString()}`,
      createAuthFetchOptions({ next: { revalidate: 3600 }, signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS) }),
    );
    if (!res.ok) throw new Error(`rails-server answered ${res.status}`);
    const j = (await res.json()) as { data?: { holder: string; sharePpm?: string | null; shape?: string | null }[] };
    const top = (j.data ?? [])
      .map((r) => ({
        holder: r.holder.toLowerCase(),
        share: Number(r.sharePpm ?? 0) / 1e6,
        shape: r.shape && isVaultPositionShape(r.shape) ? VAULT_SHAPE_FACET_LABEL[r.shape] : null,
      }))
      .filter((h) => h.share > 0);
    return { kind: "donut", top, live: v.census.live };
  } catch (error) {
    console.error(`vault compare: the census did not answer for ${v.address}`, error);
    return none;
  }
}

// ── The page's read ────────────────────────────────────────────────────────

export async function readCompare(keys: readonly string[]): Promise<CompareRead> {
  const { vaults } = await loadVaultIndex();
  const byKey = new Map(vaults.map((v) => [compareKey(v.chainId, v.address), v]));
  const chosen: VaultSummary[] = [];
  const notFound: string[] = [];
  for (const k of keys) {
    const v = isCompareKey(k) ? byKey.get(k) : undefined;
    if (v) chosen.push(v);
    else notFound.push(k);
  }
  if (chosen.length === 0) return { columns: [], notFound };
  const [series, reads, holders] = await Promise.all([
    loadVaultHealthSeries(chosen),
    Promise.all(chosen.map(familyRead)),
    Promise.all(chosen.map(holdersOf)),
  ]);
  const columns = chosen.map((v, i): CompareColumn => {
    const key = compareKey(v.chainId, v.address);
    const s = series.get(key);
    const r = reads[i];
    const health = vaultHealth({
      family: v.family,
      price: s?.price ?? null,
      assets: s?.assets ?? null,
      tooSmall: v.totalAssets != null && tooSmallToMeasure(v.totalAssets.raw),
      holder: null,
      ...r.health,
      exit: r.health.exit,
      steward: r.health.steward,
    });
    const y = health.yield.kind === "yield" ? health.yield : null;
    const w = health.withdrawals.kind === "withdrawals" ? health.withdrawals : null;
    return {
      key,
      href: vaultIndexHref(v),
      name: vaultDisplayName(v) ?? shortAddress(v.address),
      family: VAULT_FAMILIES[v.family].singular,
      chain: chainName(v.chainId),
      vault: v,
      block: r.block,
      readAt: r.readAt,
      lines: healthLines(
        health,
        { family: v.family, assetSymbol: v.asset.symbol, decimals: v.asset.decimals, attestationSaid: true },
        WORDS,
      ),
      fees: r.fees,
      exposure: r.exposure,
      holders: holders[i],
      figures: {
        asset: v.asset.symbol,
        held: v.totalAssets ? held(v) : null,
        yearly30: y ? y.yearly30 : null,
        range: y && y.yearly30 > 0 && y.low != null && y.high != null ? y.high - y.low : null,
        withdrawable: w == null ? null : w.paused ? 0 : w.share,
      },
    };
  });
  return { columns, notFound };
}
