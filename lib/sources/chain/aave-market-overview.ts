// Live Aave-V3-architecture market overview — the whole-market counterpart of
// lib/sources/chain/aave-v3-position.ts. One reader serves Aave V3 Core,
// SparkLend (an Aave V3 fork with the same Pool/oracle surface) and Aave V3 on
// Base — the source names its own chain, and nothing else here changes: the Pool
// own reserve roster (getReservesList), each reserve's getReserveData (rates,
// config bits, token addresses), the aToken / variableDebtToken totalSupply
// (market size + utilisation), the market's IAaveOracle price, each reserve's
// normalized income (the supply-cap check's index), each rate strategy's kink,
// and on SparkLend the CapAutomator's maximum caps — a handful of multicall
// bursts at the live head.
//
// Every figure is the Pool's own statement: rates and risk params decode from
// the same `configuration` word the Pool enforces with, USD comes from the
// oracle the Pool liquidates with. Nothing here is modeled or cached off-chain.
//
// One risk param is not in that word alone. A reserve's liquidation threshold is
// replaced by an efficiency-mode category's for wallets in that category, so the
// reader also sweeps the Pool's eMode categories and records which reserves each
// one covers — see EMODE_ABI. Without it a reserve at a zero threshold reads as
// "can never be collateral" when wallets are in fact borrowing against it.
//
// SERVER-ONLY — imported from /api/chain/* route handlers only (it calls
// Alchemy via lib/sources/chain/rpc).

import { parseAbi, getAddress } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import type { AaveMarketOverviewResponse, AaveMarketReserve } from "@/lib/api/fetch-aave-market-overview";

const POOL_ABI = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
  "function getReserveNormalizedIncome(address asset) view returns (uint256)",
]);
// The rate model's kink — the utilisation at which the borrow-rate curve turns
// steep. Two generations again: the V3.2+ strategy is one contract serving every
// reserve and answers per asset; the V3.0/3.1 strategy is one contract per
// reserve and answers a constant. Both are ray-scaled. Some strategies answer
// neither (a rate set by governance rather than a curve), and then the reserve
// has no kink to draw.
const RATE_STRATEGY_ABI = parseAbi([
  "function getOptimalUsageRatio(address reserve) view returns (uint256)",
  "function OPTIMAL_USAGE_RATIO() view returns (uint256)",
]);
// SparkLend's CapAutomator (sparkdotfi/sparklend-cap-automator). SparkLend keeps
// each live cap a short gap above current use and lets anyone raise it, after a
// cooldown, up to a governance-set maximum. The live cap is therefore a moving
// step and the maximum is the ceiling the market is sized to; `max` is in whole
// tokens, and 0 means the automator manages nothing for that reserve.
const CAP_AUTOMATOR_ABI = parseAbi([
  "function supplyCapConfigs(address asset) view returns (uint48 max, uint48 gap, uint48 increaseCooldown, uint48 lastUpdateBlock, uint48 lastIncreaseTime)",
  "function borrowCapConfigs(address asset) view returns (uint48 max, uint48 gap, uint48 increaseCooldown, uint48 lastUpdateBlock, uint48 lastIncreaseTime)",
]);
// Efficiency-mode categories, in the two generations this reader meets. A
// category's threshold replaces the reserve's own for the reserves it counts as
// collateral, so a reserve's own LT is only half the answer — syrupUSDC on Aave
// V3 Base carries a reserve threshold of zero and a 92% one inside the
// SyrupUSDC__USDC_GHO category, and a table printing only the first would say
// the reserve can never back a loan while wallets are borrowing against it.
//
//   • LIQUID (V3.2+): each category holds a bitmap of member reserves, indexed
//     by reserve id, and a reserve may belong to several.
//   • LEGACY (V3.0/V3.1 forks — SparkLend, Seamless): each reserve names one
//     category in its own config word, bits 168-175.
//
// Which generation a Pool speaks is asked of the Pool (does the bitmap getter
// answer?), never configured per deployment. On a liquid Pool the legacy field
// survives in storage but is stale — it disagrees with the bitmaps on 8 of 15
// reserves on Base — so it is read only where no bitmap answered.
const EMODE_ABI = parseAbi([
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryLtvzeroBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus))",
  "function getEModeCategoryLabel(uint8 id) view returns (string)",
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
]);
// How far up the category ids to look. There is no count to ask the Pool for,
// so this is a sweep — and a FIXED ceiling would quietly truncate as governance
// adds categories (Aave V3 Core was already at id 48 on 2026-08-24, and gains
// one with every new Pendle maturity it lists). So it sweeps in waves and stops
// only when a whole wave comes back empty: the roster ends where the Pool stops
// answering, not where a constant guessed it would. A wave is wide enough that
// only a 32-id hole in a sequentially-allocated id space could end it early.
const EMODE_WAVE = 32;
const EMODE_MAX_ID = 255; // category ids are uint8
const ORACLE_ABI = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);
const SUPPLY_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

const RAY = 1e27; // rates are ray-scaled APR fractions (1e27 = 100%)
const PRECISION_BPS = 1e4; // LT / LTV / reserve factor are basis points
const PRICE_SCALE = 1e8; // IAaveOracle base currency = 8-decimal USD

const MASK16 = BigInt(0xffff);
const MASK8 = BigInt(0xff);
const MASK36 = (BigInt(1) << BigInt(36)) - BigInt(1);
const MASK40 = (BigInt(1) << BigInt(40)) - BigInt(1);
const RAY_BIG = BigInt(10) ** BigInt(27);
const bitSet = (config: bigint, i: number) => ((config >> BigInt(i)) & BigInt(1)) === BigInt(1);

interface ReserveData {
  configuration: bigint;
  currentLiquidityRate: bigint;
  currentVariableBorrowRate: bigint;
  /** The reserve's own index in the Pool — the bit position an eMode category's
   *  collateral bitmap uses for it. */
  id: number;
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  interestRateStrategyAddress: string;
  /** Scaled (divided by the liquidity index) amount owed to the treasury and
   *  not yet minted to it as aTokens. */
  accruedToTreasury: bigint;
}

/** One eMode category as this surface states it: the threshold it lends the
 *  reserves it covers, under the name the Pool gives it. */
interface EModeCategory {
  id: number;
  label: string;
  lt: number;
  /** The loan-to-value the category lends this reserve. Zero where the
   *  category counts the reserve toward the threshold but backs no new
   *  borrowing with it (a V3.5+ Pool's ltvzero bitmap). */
  ltv: number;
}

/**
 * Which eMode categories count each reserve as collateral, keyed by reserve id.
 * Pinned to the same block as everything else. Any failure degrades to "no
 * categories" — a reserve then reads as its own threshold alone, which is what
 * the table said before this existed, rather than a wrong one.
 */
async function loadEModeMembership(
  client: ReturnType<typeof chainClient>,
  poolAddr: `0x${string}`,
  atBlock: { blockNumber: bigint },
  reserves: { id: number; configuration: bigint }[],
): Promise<Map<number, EModeCategory[]>> {
  const byReserve = new Map<number, EModeCategory[]>();
  const add = (reserveId: number, cat: EModeCategory) => {
    const list = byReserve.get(reserveId);
    if (list) list.push(cat);
    else byReserve.set(reserveId, [cat]);
  };
  try {
    // Wave 1 doubles as the generation test: a Pool that answers the bitmap
    // getter at all is a liquid-eMode Pool, whatever the answers say.
    const bitmapOf = new Map<number, bigint>();
    let isLiquid = false;
    for (let start = 1; start <= EMODE_MAX_ID; start += EMODE_WAVE) {
      const wave = Array.from({ length: Math.min(EMODE_WAVE, EMODE_MAX_ID - start + 1) }, (_, i) => start + i);
      const bitmaps = (await client.multicall({
        allowFailure: true,
        ...atBlock,
        contracts: wave.map(
          (id) =>
            ({
              address: poolAddr,
              abi: EMODE_ABI,
              functionName: "getEModeCategoryCollateralBitmap",
              args: [id],
            }) as const,
        ),
      })) as { status: string; result?: unknown }[];

      if (!bitmaps.some((b) => b.status === "success")) break; // legacy Pool
      isLiquid = true;
      let found = 0;
      wave.forEach((id, i) => {
        if (bitmaps[i]?.status !== "success") return;
        const bm = bitmaps[i].result as bigint;
        if (bm === BigInt(0)) return;
        bitmapOf.set(id, bm);
        found++;
      });
      if (found === 0) break;
    }
    const live = [...bitmapOf.keys()];

    if (isLiquid) {
      if (live.length === 0) return byReserve;
      const params = (await client.multicall({
        allowFailure: true,
        ...atBlock,
        contracts: [
          ...live.map(
            (id) =>
              ({
                address: poolAddr,
                abi: EMODE_ABI,
                functionName: "getEModeCategoryCollateralConfig",
                args: [id],
              }) as const,
          ),
          ...live.map(
            (id) => ({ address: poolAddr, abi: EMODE_ABI, functionName: "getEModeCategoryLabel", args: [id] }) as const,
          ),
          // V3.5+ only; an older liquid Pool fails this call and every member
          // keeps the category's loan-to-value.
          ...live.map(
            (id) =>
              ({
                address: poolAddr,
                abi: EMODE_ABI,
                functionName: "getEModeCategoryLtvzeroBitmap",
                args: [id],
              }) as const,
          ),
        ],
      })) as { status: string; result?: unknown }[];

      const isMember = (bitmap: bigint, reserveId: number) => ((bitmap >> BigInt(reserveId)) & BigInt(1)) === BigInt(1);
      live.forEach((id, i) => {
        const cfg = params[i];
        if (cfg?.status !== "success") return;
        const { liquidationThreshold: ltBps, ltv: ltvBps } = cfg.result as {
          liquidationThreshold: number;
          ltv: number;
        };
        if (ltBps <= 0) return;
        const labelRes = params[live.length + i];
        const zeroRes = params[live.length * 2 + i];
        const ltvZero = zeroRes?.status === "success" ? (zeroRes.result as bigint) : BigInt(0);
        const label = (labelRes?.status === "success" ? (labelRes.result as string) : "") || `eMode ${id}`;
        const bitmap = bitmapOf.get(id)!;
        for (const r of reserves) {
          if (!isMember(bitmap, r.id)) continue;
          add(r.id, {
            id,
            label,
            lt: ltBps / PRECISION_BPS,
            ltv: isMember(ltvZero, r.id) ? 0 : ltvBps / PRECISION_BPS,
          });
        }
      });
      return byReserve;
    }

    // Legacy: membership is the category each reserve names for itself.
    const claimed = [
      ...new Set(reserves.map((r) => Number((r.configuration >> BigInt(168)) & MASK8)).filter((c) => c > 0)),
    ];
    if (claimed.length === 0) return byReserve;
    const cats = (await client.multicall({
      allowFailure: true,
      ...atBlock,
      contracts: claimed.map(
        (id) => ({ address: poolAddr, abi: EMODE_ABI, functionName: "getEModeCategoryData", args: [id] }) as const,
      ),
    })) as { status: string; result?: unknown }[];

    claimed.forEach((id, i) => {
      if (cats[i]?.status !== "success") return;
      const data = cats[i].result as { liquidationThreshold: number; ltv: number; label: string };
      if (data.liquidationThreshold <= 0) return;
      const cat: EModeCategory = {
        id,
        label: data.label || `eMode ${id}`,
        lt: data.liquidationThreshold / PRECISION_BPS,
        ltv: data.ltv / PRECISION_BPS,
      };
      for (const r of reserves) {
        if (Number((r.configuration >> BigInt(168)) & MASK8) === id) add(r.id, cat);
      }
    });
    return byReserve;
  } catch {
    return byReserve;
  }
}

export interface AaveMarketSource {
  /** The market's Pool proxy. */
  pool: string;
  /** The market's IAaveOracle — the one the Pool prices collateral with. */
  oracle: string;
  /** Lowercased address → canonical display symbol (curated catalog overrides
   *  the on-chain ERC20 symbol; everything else resolves from chain). */
  symbolByAddr?: Record<string, string>;
  /** Which chain the Pool is on. Defaults to Ethereum, so the two existing
   *  call sites (Aave V3 Core, SparkLend) read exactly as before. */
  chainId?: ChainId;
  /** SparkLend's CapAutomator, whose per-reserve maximum is the cap the market
   *  is sized to (see CAP_AUTOMATOR_ABI). Absent on every other market. */
  capAutomator?: string;
}

function stub(pool: string, oracle: string): AaveMarketOverviewResponse {
  return { pool, oracle, blockNumber: 0, chainStale: true, reserves: [] };
}

/** Read one market's full reserve overview at the live head. Returns a
 *  `chainStale` stub on RPC failure so the surface shows a retry state rather
 *  than asserting an empty market. */
export async function loadAaveMarketOverview(src: AaveMarketSource): Promise<AaveMarketOverviewResponse> {
  const poolAddr = getAddress(src.pool);
  const oracleAddr = getAddress(src.oracle);
  const poolLower = poolAddr.toLowerCase();
  const oracleLower = oracleAddr.toLowerCase();

  const chainId = src.chainId ?? MAINNET_CHAIN_ID;
  const automatorAddr = src.capAutomator ? getAddress(src.capAutomator) : null;

  try {
    const client = chainClient(chainId);

    // Every read below is pinned to the block this response names. Resolving
    // the head FIRST and pinning to it is the difference between a receipt a
    // reader can re-run and one that answers a block later than the number
    // printed beside it — on Base that is two seconds of drift, and the roster
    // itself could change between the phases.
    const blockNumber = Number(await client.getBlockNumber());
    const atBlock = { blockNumber: BigInt(blockNumber) };

    // Phase 0 — the Pool's own reserve roster.
    const reservesList = (await client.readContract({
      address: poolAddr,
      abi: POOL_ABI,
      functionName: "getReservesList",
      ...atBlock,
    })) as readonly string[];
    const reserves = [...new Set(reservesList.map((a) => a.toLowerCase()))];
    if (reserves.length === 0) return { ...stub(poolLower, oracleLower), chainStale: false };

    // Phase 1 — per-reserve getReserveData + oracle price, one multicall, with
    // the ERC20 symbol sweep in parallel. Prices ride allowFailure: an unpriced
    // reserve degrades to token-only, never a throw.
    const [mixed, metas] = await Promise.all([
      client.multicall({
        allowFailure: true,
        ...atBlock,
        contracts: [
          ...reserves.map(
            (a) =>
              ({
                address: poolAddr,
                abi: POOL_ABI,
                functionName: "getReserveData",
                args: [a as `0x${string}`],
              }) as const,
          ),
          ...reserves.map(
            (a) =>
              ({
                address: oracleAddr,
                abi: ORACLE_ABI,
                functionName: "getAssetPrice",
                args: [a as `0x${string}`],
              }) as const,
          ),
          ...reserves.map(
            (a) =>
              ({
                address: poolAddr,
                abi: POOL_ABI,
                functionName: "getReserveNormalizedIncome",
                args: [a as `0x${string}`],
              }) as const,
          ),
          ...(automatorAddr
            ? (["supplyCapConfigs", "borrowCapConfigs"] as const).flatMap((fn) =>
                reserves.map(
                  (a) =>
                    ({
                      address: automatorAddr,
                      abi: CAP_AUTOMATOR_ABI,
                      functionName: fn,
                      args: [a as `0x${string}`],
                    }) as const,
                ),
              )
            : []),
        ],
      }) as Promise<{ status: string; result?: unknown }[]>,
      resolveErc20Meta(reserves, chainId),
    ]);

    const data = new Map<string, ReserveData>();
    const priceOf = new Map<string, number>();
    const incomeOf = new Map<string, bigint>();
    const automatorMax = new Map<string, { supply: number | null; borrow: number | null }>();
    const n = reserves.length;
    // An automator answer of max 0 means "no config" — the live cap stands.
    const maxOf = (res: { status: string; result?: unknown } | undefined): number | null => {
      if (res?.status !== "success" || res.result == null) return null;
      const max = Number((res.result as readonly [number | bigint])[0]);
      return max > 0 ? max : null;
    };
    reserves.forEach((addr, i) => {
      const dRes = mixed[i];
      if (dRes?.status === "success" && dRes.result != null) data.set(addr, dRes.result as ReserveData);
      const pRes = mixed[n + i];
      if (pRes?.status === "success" && pRes.result != null) {
        const usd = Number(pRes.result as bigint) / PRICE_SCALE;
        if (usd > 0) priceOf.set(addr, usd);
      }
      const iRes = mixed[2 * n + i];
      if (iRes?.status === "success" && iRes.result != null) incomeOf.set(addr, iRes.result as bigint);
      if (automatorAddr) automatorMax.set(addr, { supply: maxOf(mixed[3 * n + i]), borrow: maxOf(mixed[4 * n + i]) });
    });

    // Phase 2 — market size: aToken + variableDebtToken totalSupply per reserve,
    // and (in parallel, same block) which eMode categories cover which reserve.
    const sized = reserves.filter((a) => data.has(a));
    const emodeByReserve = loadEModeMembership(
      client,
      poolAddr,
      atBlock,
      sized.map((a) => ({ id: data.get(a)!.id, configuration: data.get(a)!.configuration })),
    );
    // Both kink getters for every reserve in one burst; the first that answers
    // is the generation the strategy speaks.
    const kinkReads = client.multicall({
      allowFailure: true,
      ...atBlock,
      contracts: sized.flatMap((a) => {
        const strategy = data.get(a)!.interestRateStrategyAddress as `0x${string}`;
        return [
          {
            address: strategy,
            abi: RATE_STRATEGY_ABI,
            functionName: "getOptimalUsageRatio",
            args: [a as `0x${string}`],
          } as const,
          { address: strategy, abi: RATE_STRATEGY_ABI, functionName: "OPTIMAL_USAGE_RATIO" } as const,
        ];
      }),
    });
    const totals = (await client.multicall({
      allowFailure: false,
      ...atBlock,
      contracts: sized.flatMap((a) => {
        const d = data.get(a)!;
        return [
          { address: d.aTokenAddress as `0x${string}`, abi: SUPPLY_ABI, functionName: "totalSupply" } as const,
          {
            address: d.variableDebtTokenAddress as `0x${string}`,
            abi: SUPPLY_ABI,
            functionName: "totalSupply",
          } as const,
        ];
      }),
    })) as bigint[];
    const emodeMembership = await emodeByReserve;
    const kinks = (await kinkReads) as { status: string; result?: unknown }[];

    const out: AaveMarketReserve[] = [];
    sized.forEach((addr, i) => {
      const d = data.get(addr)!;
      const config = d.configuration;
      // Reserve config word — the same bit layout the Pool enforces with
      // (ReserveConfiguration.sol): LTV bits 0-15, LT 16-31, liquidation bonus
      // 32-47, decimals 48-55, frozen 57, borrowing 58, paused 60, siloed
      // borrowing 62, reserve factor 64-79, borrowCap 80-115, supplyCap 116-151
      // (caps in whole tokens; 0 = uncapped), debt ceiling 212-251 (isolation
      // mode when nonzero, in hundredths of a dollar).
      const ltvBps = Number(config & MASK16);
      const ltBps = Number((config >> BigInt(16)) & MASK16);
      const bonusBps = Number((config >> BigInt(32)) & MASK16);
      const decimals = Number((config >> BigInt(48)) & MASK8);
      const reserveFactor = Number((config >> BigInt(64)) & MASK16) / PRECISION_BPS;
      const borrowCapWhole = Number((config >> BigInt(80)) & MASK36);
      const supplyCapWhole = Number((config >> BigInt(116)) & MASK36);
      const debtCeiling = Number((config >> BigInt(212)) & MASK40) / 100;

      const meta = metas.get(addr);
      const supplied = scaleRaw(totals[i * 2], decimals);
      const borrowed = scaleRaw(totals[i * 2 + 1], decimals);
      // The Pool's supply-cap check counts the treasury's unminted share too:
      // (aToken scaled supply + accruedToTreasury) × the reserve's normalized
      // income. accruedToTreasury is scaled, so it takes the same index.
      const income = incomeOf.get(addr);
      const treasury = income != null ? scaleRaw((d.accruedToTreasury * income) / RAY_BIG, decimals) : 0;
      const kinkRes = kinks[i * 2]?.status === "success" ? kinks[i * 2] : kinks[i * 2 + 1];
      const kinkMethod =
        kinks[i * 2]?.status === "success"
          ? "getOptimalUsageRatio"
          : kinks[i * 2 + 1]?.status === "success"
            ? "OPTIMAL_USAGE_RATIO"
            : null;
      const kinkRaw = kinkMethod ? (kinkRes!.result as bigint) : null;

      out.push({
        address: addr,
        symbol: src.symbolByAddr?.[addr] ?? meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        decimals,
        supplied,
        borrowed,
        priceUsd: priceOf.get(addr) ?? null,
        lt: ltBps > 0 ? ltBps / PRECISION_BPS : null,
        ltv: ltvBps > 0 ? ltvBps / PRECISION_BPS : null,
        supplyApr: Number(d.currentLiquidityRate) / RAY,
        borrowApr: Number(d.currentVariableBorrowRate) / RAY,
        reserveFactor,
        utilization: supplied > 0 ? borrowed / supplied : null,
        supplyCap: supplyCapWhole > 0 ? supplyCapWhole : null,
        borrowCap: borrowCapWhole > 0 ? borrowCapWhole : null,
        supplyCapMax: automatorMax.get(addr)?.supply ?? null,
        borrowCapMax: automatorMax.get(addr)?.borrow ?? null,
        accruedToTreasury: treasury,
        liquidationBonus: bonusBps > PRECISION_BPS ? (bonusBps - PRECISION_BPS) / PRECISION_BPS : null,
        bps: { ltv: ltvBps, lt: ltBps, bonus: bonusBps },
        siloed: bitSet(config, 62),
        debtCeiling: debtCeiling > 0 ? debtCeiling : null,
        rateStrategy: d.interestRateStrategyAddress.toLowerCase(),
        kink: kinkRaw != null && kinkRaw > BigInt(0) ? Number(kinkRaw) / RAY : null,
        kinkRaw: kinkRaw != null && kinkRaw > BigInt(0) ? kinkRaw.toString() : null,
        kinkMethod: kinkRaw != null && kinkRaw > BigInt(0) ? kinkMethod : null,
        borrowEnabled: bitSet(config, 58),
        frozen: bitSet(config, 57),
        paused: bitSet(config, 60),
        emodeCategories: emodeMembership.get(d.id) ?? [],
      });
    });

    return {
      pool: poolLower,
      oracle: oracleLower,
      blockNumber,
      chainStale: false,
      reserves: out,
      ...(automatorAddr ? { capAutomator: automatorAddr.toLowerCase() } : {}),
    };
  } catch {
    return stub(poolLower, oracleLower);
  }
}
