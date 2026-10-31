// Morpho Blue, MakerDAO, Fluid and Liquity V2 on Ethereum, for the wallet view
// (decision 0050, step 3; SERVER-ONLY). Each card is the family's listing row,
// built from the summary row's `card` by the family's listing builder (the
// Liquity V2 TroveSummary is the row as served). The head reads:
//   Morpho Blue  the existing position reader once per open position with
//                debt: LTV against LLTV at the market's own oracle (no
//                dollars). It runs over rails-server's answer first
//                (/api/at-block/morpho/position, every market at the chain's
//                block B), waiting up to 3.5 s (walletApiWait); a position the route
//                does not answer is read on the chain, all of those at one block.
//   MakerDAO     the existing Vat reader once per open vault: the collateral
//                at the OSM price, the debt in DAI, the liquidation price.
//   Fluid        the existing VaultResolver reader once per open NFT with
//                debt: the ratio against the liquidation threshold (no dollars).
//   Liquity V2   one read of the branch prices (/api/oracle/liquity-v2 on the
//                api, the listing's own side-fetch) for every Trove at once.

import {
  buildMorphoPositionRows,
  type MorphoPositionSummary,
  type RawMorphoPositionRow,
} from "@/lib/sources/api/morpho-positions";
import { buildMakerVaultRows, type MakerVaultSummary, type RawMakerVaultRow } from "@/lib/sources/api/makerdao-vaults";
import {
  buildFluidPositionRows,
  type FluidPositionSummary,
  type RawFluidPositionRow,
} from "@/lib/sources/api/fluid-positions";
import { loadMorphoPositionFromChain } from "@/lib/sources/chain/morpho-position";
import { MORPHO_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { withServerHead } from "@/lib/sources/api/lender-position-head";
import { loadMakerVaultStateFromChain } from "@/lib/sources/chain/makerdao-position";
import { loadFluidPositionFromChain } from "@/lib/sources/chain/fluid-position";
import { chainClient } from "@/lib/sources/chain/rpc";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { branchMcr } from "@/lib/liquity/event-safety";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, opt, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const now = () => Math.floor(Date.now() / 1000);

/** Loan tokens whose unit the dust floor may read as a dollar. Ranks only:
 *  the figure is never displayed (decision 0041). */
const DOLLAR_LOANS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "PYUSD",
  "USDE",
  "GHO",
  "CRVUSD",
  "RLUSD",
  "FRXUSD",
  "USD0",
  "USDTB",
]);

/** Settle a list of per-position reads; a read that throws leaves its position "failed". */
async function eachOpen(
  open: WalletPosition[],
  read: (p: WalletPosition) => Promise<WalletPosition | null>,
): Promise<HeadResult> {
  let reads = 0;
  const settled = await Promise.allSettled(
    open.map(async (p) => {
      const out = await read(p);
      if (out !== null) reads++;
      return out ?? p;
    }),
  );
  return {
    reads,
    positions: settled.map((s, i) =>
      s.status === "fulfilled" ? s.value : { ...open[i], headRead: "failed" as const },
    ),
  };
}

// ── Morpho Blue ─────────────────────────────────────────────────────────────

export const morphoEthereum: FamilyModule = {
  id: "morpho",
  name: "Morpho Blue",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "morpho",
  async shape(rows) {
    // The builder leaves out a row whose market it cannot parse, so each card
    // finds its summary row by id.
    const cards = await buildMorphoPositionRows(rows.map((r) => r.card as RawMorphoPositionRow));
    const byId = new Map(rows.map((r) => [r.positionId, r]));
    return cards.flatMap((s): WalletPosition[] => {
      const r = byId.get(s.positionId);
      if (!r) return [];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "morpho",
        familyName: "Morpho Blue",
        market: s.marketLabel,
        positionId: r.positionId,
        href: `/ethereum/morpho/${encodeURIComponent(s.positionId)}`,
        status: r.status,
        card: { kind: "morpho", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return [base];
      const parts = [
        s.peak.collateral > 0 ? amountText(s.peak.collateral, s.collateralSymbol) : null,
        s.peak.borrowed > 0 ? amountText(s.peak.borrowed, s.loanSymbol) : null,
      ].filter(Boolean);
      return [
        {
          ...base,
          history: {
            ...historyBase(r),
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result: s.badDebt > 0 ? `${amountText(s.badDebt, s.loanSymbol)} bad debt` : undefined,
          },
        },
      ];
    });
  },
  async head(open, address, signal, apiMs): Promise<HeadResult> {
    const owing = open.filter((p) => {
      const s = (p.card as { row: MorphoPositionSummary }).row;
      return (s.currentDebt?.amount ?? s.borrowed.amount) > 0 && !s.isIdle;
    });
    if (owing.length === 0) return { positions: open, reads: 0 };
    // The chain's block, read once and only when a position needs the chain.
    let block: Promise<bigint> | null = null;
    const r = await eachOpen(owing, async (p) => {
      const s = (p.card as { row: MorphoPositionSummary }).row;
      const served = await withServerHead(
        {
          kind: "morpho-position",
          deployment: "ethereum",
          market: (s.marketId.startsWith("0x") ? s.marketId : `0x${s.marketId}`).toLowerCase(),
          wallet: address,
        },
        (client) => loadMorphoPositionFromChain(s.marketId, address, MORPHO_DEPLOYMENT, undefined, client),
        { timeoutMs: apiMs, signal },
      ).catch(() => null);
      let live = served?.answer;
      if (!live) {
        block ??= chainClient(MAINNET_CHAIN_ID).getBlockNumber();
        live = await loadMorphoPositionFromChain(s.marketId, address, undefined, await block);
      }
      if (live.chainStale) return { ...p, headRead: "failed" };
      const dollarLoan = DOLLAR_LOANS.has((live.loanSymbol ?? "").toUpperCase());
      return {
        ...p,
        buffer: live.ltv != null && live.lltv > 0 ? 1 - live.ltv / live.lltv : undefined,
        riskFigure: live.ltv != null ? { value: `${pct(live.ltv)} LTV`, label: `LLTV ${pct(live.lltv)}` } : undefined,
        liquidatable: live.healthy === false,
        debtRate: live.borrowApr,
        dustUsd: dollarLoan ? live.collateralValue : undefined,
        headRead: "read",
        readAtBlock: live.blockNumber,
        readAt: live.timestamp,
      };
    });
    const byId = new Map(r.positions.map((p) => [p.positionId, p]));
    return { reads: r.reads, positions: open.map((p) => byId.get(p.positionId) ?? p) };
  },
};

// ── MakerDAO ────────────────────────────────────────────────────────────────

export const makerdao: FamilyModule = {
  id: "makerdao",
  name: "MakerDAO",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "makerdao",
  async shape(rows) {
    const cards = buildMakerVaultRows(rows.map((r) => r.card as RawMakerVaultRow));
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "makerdao",
        familyName: "MakerDAO",
        market: s.ilk,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "makerdao", row: s },
        collateralUsd: opt(r.collateralUsd),
        debtUsd: opt(r.debtUsd),
        usdSource: r.usdSource ?? "MakerDAO OSM price, debt in DAI",
        usdOwnOracle: r.collateralUsd != null || r.debtUsd != null,
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      const parts = [
        s.peak.collateral > 0 ? amountText(s.peak.collateral, s.collateralSymbol) : null,
        s.peak.debtDai != null && s.peak.debtDai > 0 ? amountText(s.peak.debtDai, "DAI") : null,
      ].filter(Boolean);
      return {
        ...base,
        history: {
          ...historyBase(r),
          size: parts.length ? parts.join(" / ") : undefined,
          sizeNote: parts.length ? "highest recorded" : undefined,
          result: s.everLiquidated ? "liquidated by auction" : undefined,
        },
      };
    });
  },
  async head(open): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    return eachOpen(open, async (p) => {
      const s = (p.card as { row: MakerVaultSummary }).row;
      const id = s.cdpId ?? s.urn;
      const st = await loadMakerVaultStateFromChain(id, undefined, s.cdpId ? null : s.ilk);
      if (!st) return { ...p, headRead: "failed" };
      const cr = st.collateralUsd != null && st.debtDai > 0 ? st.collateralUsd / st.debtDai : null;
      return {
        ...p,
        collateralUsd: st.collateralUsd ?? undefined,
        debtUsd: st.debtDai,
        usdSource: "MakerDAO OSM price, debt in DAI",
        usdOwnOracle: st.collateralUsd != null,
        buffer:
          st.liquidationPriceUsd != null && st.priceUsd != null && st.priceUsd > 0
            ? 1 - st.liquidationPriceUsd / st.priceUsd
            : undefined,
        riskFigure:
          cr != null
            ? {
                value: `${(cr * 100).toFixed(1)}% CR`,
                label: st.matRatio != null ? `liquidates below ${(st.matRatio * 100).toFixed(0)}%` : "Collateral ratio",
              }
            : undefined,
        liquidatable: cr != null && st.matRatio != null ? cr < st.matRatio : undefined,
        debtRate: st.debtDai > 0 ? (st.stabilityFeeApr ?? undefined) : undefined,
        headRead: "read",
        readAtBlock: st.atBlock,
        readAt: st.blockTimestamp,
      };
    });
  },
};

// ── Fluid ───────────────────────────────────────────────────────────────────

export const fluid: FamilyModule = {
  id: "fluid",
  name: "Fluid",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "fluid",
  async shape(rows) {
    const cards = buildFluidPositionRows(rows.map((r) => r.card as RawFluidPositionRow));
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const pair = [s.supplySymbol, s.borrowSymbol].filter(Boolean).join(" / ");
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "fluid",
        familyName: "Fluid",
        market: pair || undefined,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "fluid", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      // The peaks arrive as decimal strings in each leg's own units.
      const col = Number(s.peakCol) || 0;
      const debt = Number(s.peakDebt) || 0;
      const parts = [
        col > 0 ? amountText(col, s.supplySymbol) : null,
        debt > 0 ? amountText(debt, s.borrowSymbol) : null,
      ].filter(Boolean);
      return {
        ...base,
        history: {
          ...historyBase(r),
          size: parts.length ? parts.join(" / ") : undefined,
          sizeNote: parts.length ? "highest recorded" : undefined,
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    return eachOpen(open, async (p) => {
      const s = (p.card as { row: FluidPositionSummary }).row;
      const live = await loadFluidPositionFromChain(s.nftId);
      if (!live.found) return { ...p, headRead: "failed" };
      if (live.isSupplyPosition || live.ratio == null || live.liquidationThreshold <= 0) {
        return { ...p, headRead: "read", readAtBlock: live.blockNumber, readAt: now() };
      }
      return {
        ...p,
        buffer: 1 - live.ratio / live.liquidationThreshold,
        riskFigure: { value: `${pct(live.ratio)} ratio`, label: `liquidates above ${pct(live.liquidationThreshold)}` },
        liquidatable: live.ratio > live.liquidationThreshold,
        debtRate: live.borrowRatePct != null ? live.borrowRatePct / 100 : undefined,
        headRead: "read",
        readAtBlock: live.blockNumber,
        // The resolver states its block and no time: the stamp is the read's.
        readAt: now(),
      };
    });
  },
};

// ── Liquity V2 ──────────────────────────────────────────────────────────────

const priceOf = (type: string, p: OraclePricesData | null): number | undefined => {
  if (!p) return undefined;
  const key = type.toLowerCase() as keyof OraclePricesData;
  return p[key] ?? undefined;
};

/** The branch prices the Trove listing side-fetches, from the api. */
async function liquityPrices(signal: AbortSignal): Promise<OraclePricesData | null> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const res = await fetch(`${base}/api/oracle/liquity-v2`, {
    ...createAuthFetchOptions({ signal }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/oracle/liquity-v2 answered ${res.status}`);
  const json = (await res.json()) as OraclePricesResponse;
  return json.success && json.data ? json.data : null;
}

export const liquityV2: FamilyModule = {
  id: "liquity-v2",
  name: "Liquity V2",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "liquity-v2",
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const t = r.card as TroveSummary;
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "liquity-v2",
        familyName: "Liquity V2",
        market: `${t.collateralType} Trove`,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "liquity-v2", row: t, prices: null },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      const parts = [
        t.collateral.peakAmount > 0 ? amountText(t.collateral.peakAmount, t.collateral.symbol) : null,
        t.debt.peak > 0 ? amountText(t.debt.peak, t.assetType) : null,
      ].filter(Boolean);
      const n = t.activity.redemptionCount;
      const txCount = Number(t.activity.transactionCount) - n;
      return {
        ...base,
        history: {
          ...historyBase(r),
          size: parts.length ? parts.join(" / ") : undefined,
          sizeNote: parts.length ? "highest recorded" : undefined,
          result: n > 0 ? plural(n, "redemption") : undefined,
          txCount: Number.isFinite(txCount) ? txCount : undefined,
        },
      };
    });
  },
  async head(open, _address, signal): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const prices = await liquityPrices(signal);
    if (!prices) return { reads: 1, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        const t = (p.card as { row: TroveSummary }).row;
        const price = priceOf(t.collateralType, prices);
        const collateralUsd = price != null ? t.collateral.amount * price : undefined;
        const cr = collateralUsd != null && t.debt.current > 0 ? collateralUsd / t.debt.current : undefined;
        const mcr = branchMcr(t.collateralType);
        return {
          ...p,
          card: { kind: "liquity-v2", row: t, prices },
          collateralUsd,
          debtUsd: t.debt.current,
          usdSource: "Liquity V2 price feed, debt in BOLD",
          usdOwnOracle: collateralUsd != null,
          buffer: cr != null && mcr != null ? 1 - mcr / cr : undefined,
          riskFigure:
            cr != null
              ? {
                  value: `${(cr * 100).toFixed(1)}% CR`,
                  label: mcr != null ? `liquidates below ${(mcr * 100).toFixed(0)}%` : "Collateral ratio",
                }
              : undefined,
          liquidatable: cr != null && mcr != null ? cr < mcr : undefined,
          debtRate: t.debt.current > 0 ? t.metrics.interestRate / 100 : undefined,
          headRead: "read",
          // The price read states no block; the Trove's figures are its last event's.
          readAt: now(),
        };
      }),
    };
  },
};
