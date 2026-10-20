// Live Aave V3 pooled-account position for the chain data-source — the exact-at-T
// detail reader. V3 is one cross-collateralised account per (wallet, market) —
// each market (Core / Prime / EtherFi) is a separate `Pool` — so this reads the
// wallet's whole position on ONE market's Pool in a burst of eth_calls
// (Alchemy via lib/sources/chain/rpc): the aggregate getUserAccountData (HF / LT /
// LTV / oracle-priced USD totals) plus, for each of the Pool's own reserves
// (getReservesList — chain-derived candidates, so Prime/EtherFi need no curated
// list), the getReserveData → aToken/variableDebtToken balanceOf and the
// collateral bitmap from getUserConfiguration, collapsed into one viem multicall
// pass and pinned to T.
//
// The read also resolves the wallet's efficiency mode, because a reserve's own
// liquidation threshold is NOT the one the Pool judges an eMode wallet by — see
// EMODE_ABI below for the two generations of that and how they are told apart.
//
// SERVER-ONLY.

import { parseAbi, getAddress } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { AAVE_V3_POOL, V3_LT_BY_ADDR } from "@/lib/aave-v3/asset-catalog";
import { resolveV3Tokens } from "./aave-v3-tokens";
import { notCollateralReserves } from "@/lib/aave-v3/collateral-split";
import { assertDecimalsRead } from "./erc20-meta";
import type { AaveV3ChainReserve, AaveV3EMode, AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
// eMode, in both the generations this reader meets.
//
// A wallet sits in at most one efficiency-mode category, and while it does, that
// category's liquidation threshold replaces the reserve's own for every reserve
// the category counts as collateral. What differs between generations is where
// that membership is written:
//
//   • LEGACY (V3.0/V3.1 and the forks frozen on them — Seamless, SparkLend):
//     each reserve names one category in its own configuration word (bits
//     168-175), and `getEModeCategoryData` returns the category's parameters.
//   • LIQUID (V3.2+, late 2024 — Aave V3 Core/Prime/EtherFi and Aave V3 Base):
//     each CATEGORY carries a bitmap of member reserves, indexed by reserve id,
//     and a reserve may belong to many. The old per-reserve field survives in
//     storage but the Pool no longer enforces with it — on Aave V3 Base it
//     disagrees with the bitmaps on 8 of 15 reserves, and on Core on 24 of 67.
//     Reading it there would print a confident wrong threshold.
//
// Which generation a Pool speaks is asked of the Pool itself (does the bitmap
// getter answer?) rather than configured per deployment, so a fork that upgrades
// is followed without a code change. Verified against the deployed
// implementations 2026-08-24: Aave V3 Core/Prime/EtherFi/Base answer the bitmap
// getters; Seamless and SparkLend revert on them.
//
// The rule itself is the Pool's own — GenericLogic.calculateUserAccountData in
// the deployed V3 implementation: `userEModeCategory != 0 &&
// isReserveEnabledOnBitmap(bitmap, i)` → the category threshold, else the
// reserve's. A supplied reserve OUTSIDE the category is still counted in the
// collateral total; it simply keeps its own threshold.
const EMODE_ABI = parseAbi([
  "function getUserEMode(address user) view returns (uint256)",
  // Liquid (V3.2+).
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus))",
  "function getEModeCategoryLabel(uint8 id) view returns (string)",
  // Legacy (V3.0/V3.1).
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

const PRECISION_BASE = 1e8; // V3 base currency = 8-decimal USD (Chainlink oracle precision)
const PRECISION_BPS = 1e4; // currentLiquidationThreshold / ltv are basis points
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
const ZERO = BigInt(0);

interface ReserveData {
  configuration: bigint;
  /** Supply APR as a ray (1e27 = 100%). */
  currentLiquidityRate: bigint;
  /** Variable borrow APR as a ray (1e27 = 100%). */
  currentVariableBorrowRate: bigint;
  id: number;
  aTokenAddress: string;
  variableDebtTokenAddress: string;
}

const RAY = 1e27; // Aave rates are ray-scaled APR fractions (1e27 = 100%)

function stub(wallet: string, pool: string, atBlock: number): AaveV3PositionChainResponse {
  return {
    wallet,
    pool,
    blockNumber: atBlock,
    healthFactor: null,
    avgLiquidationThreshold: 0,
    ltv: 0,
    totalCollateralUsd: 0,
    totalDebtUsd: 0,
    availableBorrowsUsd: 0,
    supplyAssetCount: 0,
    debtAssetCount: 0,
    chainStale: true,
    reserves: [],
  };
}

/**
 * Read a wallet's live V3 position straight from chain, on one market's Pool
 * (`pool`, default Core). The candidate reserve set is the Pool's OWN
 * getReservesList — chain-derived, so every market self-describes. `atBlock`
 * pins every read to T (omit → live tip). Returns a `chainStale` stub on RPC
 * failure so the caller falls back to its event-derived numbers.
 *
 * `chainId` names the chain the Pool is on and defaults to Ethereum, so the
 * existing Core / Prime / EtherFi call sites read exactly as before. Aave
 * deployed the same Pool interface on Base, so the whole reader carries over
 * untouched — the only thing that had to be parameterised was which RPC it
 * asks and whether the Ethereum symbol catalog applies (it does not).
 */
export async function loadAaveV3PositionFromChain(
  walletRaw: string,
  pool: string = AAVE_V3_POOL,
  atBlock?: number,
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<AaveV3PositionChainResponse> {
  const wallet = getAddress(walletRaw);
  const poolAddr = getAddress(pool);

  try {
    const client = chainClient(chainId);

    // Every read below is pinned to ONE block — the one the response names. A
    // caller-supplied `atBlock` pins to that; otherwise the head is resolved
    // FIRST and then pinned to, rather than read alongside an unpinned batch.
    // On a two-second chain the unpinned shape routinely answers one block
    // later than the number printed beside it, so a receipt saying "re-run this
    // call at block N" would not reproduce.
    const blockNumber = atBlock ?? Number(await client.getBlockNumber());
    const blockOpt = { blockNumber: BigInt(blockNumber) };

    // Phase 0 — the Pool's own reserve roster (the chain-derived candidate set).
    const reservesList = (await client.readContract({
      address: poolAddr,
      abi: POOL_ABI,
      functionName: "getReservesList",
      ...blockOpt,
    })) as readonly string[];
    const reserves = [...new Set(reservesList.map((a) => a.toLowerCase()))];

    // Phase 1 — aggregate account data + collateral bitmap (two scalar reads),
    // the wallet's eMode category, and the homogeneous per-reserve
    // getReserveData multicall, in parallel.
    const [account, userConfig, userEModeId, reserveStructs] = await Promise.all([
      client.readContract({
        address: poolAddr,
        abi: POOL_ABI,
        functionName: "getUserAccountData",
        args: [wallet],
        ...blockOpt,
      }),
      client.readContract({
        address: poolAddr,
        abi: POOL_ABI,
        functionName: "getUserConfiguration",
        args: [wallet],
        ...blockOpt,
      }),
      client
        .readContract({
          address: poolAddr,
          abi: EMODE_ABI,
          functionName: "getUserEMode",
          args: [wallet],
          ...blockOpt,
        })
        .then((v) => Number(v))
        .catch(() => 0),
      reserves.length === 0
        ? Promise.resolve([] as ReserveData[])
        : (client.multicall({
            allowFailure: false,
            ...blockOpt,
            contracts: reserves.map(
              (a) =>
                ({
                  address: poolAddr,
                  abi: POOL_ABI,
                  functionName: "getReserveData",
                  args: [a as `0x${string}`],
                }) as const,
            ),
          }) as Promise<ReserveData[]>),
    ]);

    const reserveData = reserves.map((addr, i) => ({ addr, data: reserveStructs[i] }));

    // The category's own parameters and its membership, read only when the
    // wallet is actually in one. The collateral bitmap is asked for first
    // because its answer is also the generation test: a Pool that returns one
    // is a liquid-eMode Pool and every later read takes that shape; a Pool that
    // reverts is a pre-3.2 one, where membership is the reserve's own config
    // field instead. Every failure here degrades to "no eMode" — the reserve's
    // own threshold, which understates nothing — rather than to a wrong LT.
    let emode: AaveV3EMode | null = null;
    let emodeBitmap: bigint | null = null;
    if (userEModeId > 0) {
      const readCat = (
        fn:
          | "getEModeCategoryCollateralBitmap"
          | "getEModeCategoryCollateralConfig"
          | "getEModeCategoryLabel"
          | "getEModeCategoryData",
      ) =>
        client
          .readContract({ address: poolAddr, abi: EMODE_ABI, functionName: fn, args: [userEModeId], ...blockOpt })
          .catch(() => null);

      emodeBitmap = (await readCat("getEModeCategoryCollateralBitmap")) as bigint | null;
      if (emodeBitmap != null) {
        const [cfg, label] = (await Promise.all([
          readCat("getEModeCategoryCollateralConfig"),
          readCat("getEModeCategoryLabel"),
        ])) as [{ ltv: number; liquidationThreshold: number } | null, string | null];
        if (cfg && cfg.liquidationThreshold > 0) {
          emode = {
            id: userEModeId,
            label: label || `eMode ${userEModeId}`,
            lt: cfg.liquidationThreshold / PRECISION_BPS,
            ltv: cfg.ltv / PRECISION_BPS,
          };
        }
      } else {
        const cat = (await readCat("getEModeCategoryData")) as {
          ltv: number;
          liquidationThreshold: number;
          label: string;
        } | null;
        if (cat && cat.liquidationThreshold > 0) {
          emode = {
            id: userEModeId,
            label: cat.label,
            lt: cat.liquidationThreshold / PRECISION_BPS,
            ltv: cat.ltv / PRECISION_BPS,
          };
        }
      }
    }

    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      currentLiquidationThreshold,
      ltv,
      healthFactorRaw,
    ] = account;

    // Phase 2 — per reserve: the wallet's aToken + variableDebtToken balanceOf
    // (its position), plus each token's totalSupply (the pool aggregates that
    // give reserve utilization = total variable debt ÷ total supplied). Four
    // calls per reserve, one multicall.
    const balCalls = reserveData.flatMap(({ data }) => [
      {
        address: data.aTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      } as const,
      {
        address: data.variableDebtTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet],
      } as const,
      {
        address: data.aTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      } as const,
      {
        address: data.variableDebtTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      } as const,
    ]);
    const balances = (await client.multicall({ allowFailure: false, ...blockOpt, contracts: balCalls })) as bigint[];

    // Symbols/decimals for the reserves with any balance.
    const metas = await resolveV3Tokens(reserves, chainId);
    // A held reserve whose decimals did not load would scale by the 18 stand-in:
    // the read fails whole instead, and the caller keeps its indexed figures.
    assertDecimalsRead(
      metas,
      reserveData.filter((_, i) => balances[i * 4] > ZERO || balances[i * 4 + 1] > ZERO).map((r) => r.addr),
    );

    const out: AaveV3ChainReserve[] = [];
    let supplyAssetCount = 0;
    let debtAssetCount = 0;
    reserveData.forEach(({ addr, data }, i) => {
      const supplied = balances[i * 4];
      const debt = balances[i * 4 + 1];
      const aTokenTotal = balances[i * 4 + 2]; // total supplied (available + borrowed)
      const variableDebtTotal = balances[i * 4 + 3]; // total variable debt
      // bit 2*id+1 of the user config bitmap = useAsCollateral
      const isCollateral = ((userConfig >> BigInt(2 * data.id + 1)) & BigInt(1)) === BigInt(1);
      if (supplied === ZERO && debt === ZERO && !isCollateral) return;

      // LT from the live reserve configuration (bits 16-31, bps); fall back to the
      // curated catalog, then null.
      const ltBps = Number((data.configuration >> BigInt(16)) & BigInt(0xffff));
      const lt =
        ltBps > 0 ? ltBps / PRECISION_BPS : chainId === MAINNET_CHAIN_ID ? (V3_LT_BY_ADDR[addr] ?? null) : null;
      // Reserve factor — config bits 64-79 (bps); the protocol's cut of borrow
      // interest. Reserve economics, all read at T from the same getReserveData.
      const reserveFactor = Number((data.configuration >> BigInt(64)) & BigInt(0xffff)) / PRECISION_BPS;
      // Does the wallet's active category count THIS reserve as collateral? On a
      // liquid-eMode Pool that is a bit in the category's bitmap, indexed by the
      // reserve's own id (the index GenericLogic walks); on a pre-3.2 Pool it is
      // the category named in the reserve's config word, bits 168-175. The stale
      // config field is never consulted on a Pool that answered with a bitmap.
      const emodeCollateral =
        emode == null
          ? false
          : emodeBitmap != null
            ? ((emodeBitmap >> BigInt(data.id)) & BigInt(1)) === BigInt(1)
            : Number((data.configuration >> BigInt(168)) & BigInt(0xff)) === emode.id;
      // Supply / variable-borrow APR — ray-scaled APR fractions (1e27 = 100%).
      const supplyApr = Number(data.currentLiquidityRate) / RAY;
      const borrowApr = Number(data.currentVariableBorrowRate) / RAY;
      // Reserve utilization = total variable debt ÷ total supplied. aToken total
      // supply already equals available liquidity + amount borrowed, so it's the
      // denominator directly (stable debt is ~nil on V3 mainnet).
      const utilization = aTokenTotal > ZERO ? Number(variableDebtTotal) / Number(aTokenTotal) : 0;
      const meta = metas.get(addr);
      const hasBorrow = debt > ZERO;
      if (supplied > ZERO) supplyAssetCount++;
      if (hasBorrow) debtAssetCount++;

      out.push({
        address: addr,
        symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        decimals: meta?.decimals ?? 18,
        supplyBalanceRaw: supplied.toString(),
        debtBalanceRaw: debt.toString(),
        isCollateral,
        hasBorrow,
        lt,
        supplyApr,
        borrowApr,
        reserveFactor,
        utilization,
        emodeCollateral,
        ...(ltBps === 0 ? { ltZero: true as const } : {}),
      });
    });

    // Order by combined raw balance desc.
    out.sort((a, b) => {
      const av = BigInt(a.supplyBalanceRaw) + BigInt(a.debtBalanceRaw);
      const bv = BigInt(b.supplyBalanceRaw) + BigInt(b.debtBalanceRaw);
      return bv > av ? 1 : bv < av ? -1 : 0;
    });

    const noDebt = totalDebtBase === ZERO;
    return {
      wallet: wallet.toLowerCase(),
      pool: poolAddr.toLowerCase(),
      blockNumber,
      healthFactor: noDebt || healthFactorRaw >= UINT_MAX ? null : Number(healthFactorRaw) / 1e18,
      avgLiquidationThreshold: Number(currentLiquidationThreshold) / PRECISION_BPS,
      ltv: Number(ltv) / PRECISION_BPS,
      totalCollateralUsd: Number(totalCollateralBase) / PRECISION_BASE,
      totalDebtUsd: Number(totalDebtBase) / PRECISION_BASE,
      availableBorrowsUsd: Number(availableBorrowsBase) / PRECISION_BASE,
      supplyAssetCount,
      debtAssetCount,
      emode,
      chainStale: false,
      reserves: out,
    };
  } catch {
    return stub(wallet.toLowerCase(), poolAddr.toLowerCase(), atBlock ?? 0);
  }
}

/**
 * The listing's collateral split: for each open account, the lowercased
 * supplied reserves that back no borrowing (`notCollateralReserves`, the rule
 * the position page reads from `loadAaveV3PositionFromChain`). Per Pool, one
 * multicall for the accounts' collateral bitmaps and e-mode categories and the
 * reserves' configurations, then one for the categories' thresholds and
 * membership, read in the Pool's own e-mode generation. An account any of
 * whose reads failed is absent from the answer, and its row keeps no split.
 */
export async function readAaveV3NotCollateral(
  accounts: readonly { wallet: string; pool: string; supplied: readonly string[] }[],
  chainId: ChainId = MAINNET_CHAIN_ID,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const byPool = new Map<string, { wallet: string; supplied: string[] }[]>();
  for (const a of accounts) {
    if (a.supplied.length === 0) continue;
    const key = a.pool.toLowerCase();
    byPool.set(key, [
      ...(byPool.get(key) ?? []),
      { wallet: a.wallet, supplied: a.supplied.map((r) => r.toLowerCase()) },
    ]);
  }
  if (byPool.size === 0) return out;
  const client = chainClient(chainId);
  await Promise.all(
    [...byPool].map(async ([pool, asked]) => {
      try {
        const poolAddr = getAddress(pool);
        const reserves = [...new Set(asked.flatMap((a) => a.supplied))];
        const results = await client.multicall({
          allowFailure: true,
          contracts: [
            ...asked.flatMap(
              (a) =>
                [
                  {
                    address: poolAddr,
                    abi: POOL_ABI,
                    functionName: "getUserConfiguration",
                    args: [getAddress(a.wallet)],
                  },
                  { address: poolAddr, abi: EMODE_ABI, functionName: "getUserEMode", args: [getAddress(a.wallet)] },
                ] as const,
            ),
            ...reserves.map(
              (r) =>
                ({
                  address: poolAddr,
                  abi: POOL_ABI,
                  functionName: "getReserveData",
                  args: [r as `0x${string}`],
                }) as const,
            ),
          ],
        });
        const reserveData = new Map<string, ReserveData>();
        reserves.forEach((r, i) => {
          const got = results[asked.length * 2 + i];
          if (got.status === "success") reserveData.set(r, got.result as unknown as ReserveData);
        });
        const userOf = (i: number) => {
          const cfg = results[i * 2];
          const em = results[i * 2 + 1];
          return cfg.status === "success" && em.status === "success"
            ? { config: cfg.result as bigint, emodeId: Number(em.result as bigint) }
            : null;
        };
        // Each category's threshold and which reserves it counts as
        // collateral: a liquid-eMode Pool (V3.2+) answers with a bitmap, a
        // pre-3.2 Pool names the category in the reserve's own config word.
        const emodeIds = [...new Set(asked.map((_, i) => userOf(i)?.emodeId ?? 0).filter((id) => id > 0))];
        const emodeOf = new Map<number, { lt: number; bitmap: bigint | null }>();
        if (emodeIds.length > 0) {
          const cats = await client.multicall({
            allowFailure: true,
            contracts: emodeIds.flatMap(
              (id) =>
                [
                  { address: poolAddr, abi: EMODE_ABI, functionName: "getEModeCategoryCollateralBitmap", args: [id] },
                  { address: poolAddr, abi: EMODE_ABI, functionName: "getEModeCategoryCollateralConfig", args: [id] },
                  { address: poolAddr, abi: EMODE_ABI, functionName: "getEModeCategoryData", args: [id] },
                ] as const,
            ),
          });
          emodeIds.forEach((id, i) => {
            const [bitmap, cfg, legacy] = [cats[i * 3], cats[i * 3 + 1], cats[i * 3 + 2]];
            if (bitmap.status === "success" && cfg.status === "success")
              emodeOf.set(id, {
                lt: (cfg.result as { liquidationThreshold: number }).liquidationThreshold / PRECISION_BPS,
                bitmap: bitmap.result as bigint,
              });
            else if (legacy.status === "success")
              emodeOf.set(id, {
                lt: (legacy.result as { liquidationThreshold: number }).liquidationThreshold / PRECISION_BPS,
                bitmap: null,
              });
          });
        }
        asked.forEach((a, i) => {
          const user = userOf(i);
          if (!user) return;
          const emode = user.emodeId > 0 ? emodeOf.get(user.emodeId) : undefined;
          if (user.emodeId > 0 && !emode) return;
          const reads = [];
          for (const addr of a.supplied) {
            const data = reserveData.get(addr);
            if (!data) return;
            const inEmode =
              emode == null
                ? false
                : emode.bitmap != null
                  ? ((emode.bitmap >> BigInt(data.id)) & BigInt(1)) === BigInt(1)
                  : Number((data.configuration >> BigInt(168)) & BigInt(0xff)) === user.emodeId;
            reads.push({
              address: addr,
              isCollateral: ((user.config >> BigInt(2 * data.id + 1)) & BigInt(1)) === BigInt(1),
              lt: Number((data.configuration >> BigInt(16)) & BigInt(0xffff)) / PRECISION_BPS,
              inEmode,
            });
          }
          out.set(`${pool}:${a.wallet.toLowerCase()}`, notCollateralReserves(reads, emode?.lt));
        });
      } catch {
        // The RPC is down: no row on this Pool keeps a split.
      }
    }),
  );
  return out;
}
