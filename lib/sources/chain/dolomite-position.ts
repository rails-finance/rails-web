// Live Dolomite per-account position — the chain detail reader. The grain is
// Account.Info = (owner, uint256 accountNumber), the core's own key: every
// view below takes it, and no read here aggregates an owner (accounts are
// independently liquidated).
//
// Two multicalls at head:
//   1. The account: getAccountBalances (par + wei per nonzero market — the wei
//      is par × the CURRENT index, which accrues on read), getAccountValues,
//      getAdjustedAccountValues, getAccountStatus, and the risk frame —
//      getMarginRatio, getLiquidationSpread, getMarginRatioForAccount and
//      ⚠️ getAccountRiskOverrideByAccount (the carve-out: overridden accounts
//      get marginRatio 11.11% / spread 4% and SKIP the premiums; (0,0) for
//      normal accounts). The threshold shipped is the override when nonzero,
//      else the global — and getMarginRatioForAccount is the core's own
//      statement of exactly that choice.
//   2. The touched markets: getMarketPrice, getMarketMarginPremium,
//      getMarketInterestRate, getMarketTotalPar + getMarketCurrentIndex (for
//      utilisation → supply APR), getMarketIsClosing, plus ERC-20 identity via
//      the shared cached resolver.
//
// The verdict is the protocol's own (the Moonwell pattern): both legs of the
// collateralization ratio are the core's own adjusted values; the division and
// the comparison against (1 + marginRatioForAccount) are arithmetic over them,
// and the receipts say so.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import {
  DOLOMITE_ADDRESSES,
  DOLOMITE_BASE,
  DOLOMITE_VALUE_SCALE,
  SECONDS_PER_YEAR,
  normalizeAccountNumber,
} from "@/lib/dolomite/asset-catalog";
import type { DolomiteChainBalance, DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";

const MARGIN_ABI = parseAbi([
  "struct Info { address owner; uint256 number; }",
  "function getAccountBalances(Info account) view returns (uint256[] marketIds, address[] tokens, (bool sign, uint128 value)[] pars, (bool sign, uint256 value)[] weis)",
  "function getAccountValues(Info account) view returns ((uint256 value) supplyValue, (uint256 value) borrowValue)",
  "function getAdjustedAccountValues(Info account) view returns ((uint256 value) supplyValue, (uint256 value) borrowValue)",
  "function getAccountStatus(Info account) view returns (uint8)",
  "function getAccountRiskOverrideByAccount(Info account) view returns ((uint256 value) marginRatioOverride, (uint256 value) liquidationSpreadOverride)",
  "function getMarginRatioForAccount(Info account) view returns ((uint256 value))",
  "function getMarginRatio() view returns ((uint256 value))",
  "function getLiquidationSpread() view returns ((uint256 value))",
  "function getEarningsRate() view returns ((uint256 value))",
  "function getMarketPrice(uint256 marketId) view returns ((uint256 value))",
  "function getMarketMarginPremium(uint256 marketId) view returns ((uint256 value))",
  "function getMarketInterestRate(uint256 marketId) view returns ((uint256 value))",
  "function getMarketTotalPar(uint256 marketId) view returns ((uint128 borrow, uint128 supply))",
  "function getMarketCurrentIndex(uint256 marketId) view returns ((uint112 borrow, uint112 supply, uint32 lastUpdate))",
  "function getMarketIsClosing(uint256 marketId) view returns (bool)",
]);

const MARGIN = DOLOMITE_ADDRESSES.MARGIN as `0x${string}`;
const ZERO = BigInt(0);
const BASE = BigInt("1000000000000000000");

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const STATUS_LABEL: Record<number, "Normal" | "Liquid" | "Vapor"> = { 0: "Normal", 1: "Liquid", 2: "Vapor" };

function stub(owner: string, accountNumber: string): DolomiteChainResponse {
  return {
    owner,
    accountNumber,
    blockNumber: 0,
    balances: [],
    supplyValueUsd: 0,
    borrowValueUsd: 0,
    adjSupplyValueUsd: 0,
    adjBorrowValueUsd: 0,
    rawValues: { supply: "0", borrow: "0", adjSupply: "0", adjBorrow: "0" },
    marginRatio: 0,
    liquidationSpread: 0,
    override: { active: false, marginRatio: null, liquidationSpread: null },
    marginRatioForAccount: 0,
    requiredCollateralization: 0,
    collateralization: null,
    accountStatus: 0,
    accountStatusLabel: "Normal",
    chainStale: true,
  };
}

/**
 * Read one Dolomite account (Account.Info) live from the core. Returns a
 * `chainStale` stub on RPC failure so callers fall back to their event-derived
 * numbers (the risk surfaces just stay off).
 */
export async function loadDolomitePositionFromChain(
  ownerRaw: string,
  accountNumberRaw: string,
): Promise<DolomiteChainResponse> {
  const owner = getAddress(ownerRaw);
  const accountNumber = normalizeAccountNumber(accountNumberRaw);
  if (accountNumber == null) return stub(owner.toLowerCase(), accountNumberRaw);
  const account = { owner, number: BigInt(accountNumber) };

  try {
    const client = alchemyClient();

    const [blockNumber, first] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAccountBalances", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAccountValues", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAdjustedAccountValues", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAccountStatus", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getAccountRiskOverrideByAccount", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarginRatioForAccount", args: [account] },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarginRatio" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getLiquidationSpread" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getEarningsRate" },
        ] as const,
      }) as Promise<Res[]>,
    ]);

    type ParLeg = { sign: boolean; value: bigint };
    type WeiLeg = { sign: boolean; value: bigint };
    const bals = ok<readonly [readonly bigint[], readonly string[], readonly ParLeg[], readonly WeiLeg[]]>(first[0]);
    const values = ok<readonly [{ value: bigint }, { value: bigint }]>(first[1]);
    const adjusted = ok<readonly [{ value: bigint }, { value: bigint }]>(first[2]);
    if (!bals || !values || !adjusted) return stub(owner.toLowerCase(), accountNumber);

    const status = ok<number>(first[3]) ?? 0;
    const overrideRaw = ok<readonly [{ value: bigint }, { value: bigint }]>(first[4]);
    const ratioForAccountRaw = ok<{ value: bigint }>(first[5]);
    const marginRatio = Number(ok<{ value: bigint }>(first[6])?.value ?? ZERO) / DOLOMITE_BASE;
    const liquidationSpread = Number(ok<{ value: bigint }>(first[7])?.value ?? ZERO) / DOLOMITE_BASE;
    const earningsRate = Number(ok<{ value: bigint }>(first[8])?.value ?? ZERO) / DOLOMITE_BASE;

    // The carve-out: nonzero override ⇒ the account's threshold is the
    // override's ratio (111.11% observed) and the premiums are skipped.
    const overrideActive = overrideRaw != null && overrideRaw[0].value > ZERO;
    const override = {
      active: overrideActive,
      marginRatio: overrideActive ? Number(overrideRaw[0].value) / DOLOMITE_BASE : null,
      liquidationSpread: overrideActive && overrideRaw != null ? Number(overrideRaw[1].value) / DOLOMITE_BASE : null,
    };
    // The core's own effective ratio — falls back to override-else-global if
    // the getter ever fails.
    const marginRatioForAccount =
      ratioForAccountRaw != null
        ? Number(ratioForAccountRaw.value) / DOLOMITE_BASE
        : (override.marginRatio ?? marginRatio);

    // Pass 2 — the touched markets only.
    const marketIds = bals[0].map((id) => Number(id));
    const PER_MARKET = 6;
    let second: Res[] = [];
    if (marketIds.length > 0) {
      second = (await client.multicall({
        allowFailure: true,
        contracts: marketIds.flatMap(
          (id) =>
            [
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketPrice", args: [BigInt(id)] },
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketMarginPremium", args: [BigInt(id)] },
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketInterestRate", args: [BigInt(id)] },
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketTotalPar", args: [BigInt(id)] },
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketCurrentIndex", args: [BigInt(id)] },
              { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketIsClosing", args: [BigInt(id)] },
            ] as const,
        ),
      })) as Res[];
    }
    const tokens = bals[1].map((t) => getAddress(t).toLowerCase());
    const meta = await resolveErc20Meta(tokens);

    const balances: DolomiteChainBalance[] = marketIds.map((marketId, i) => {
      const base = i * PER_MARKET;
      const token = tokens[i];
      const m = meta.get(token);
      const symbol = m?.symbol ?? `market #${marketId}`;
      const decimals = m?.decimals ?? 18;

      // Solo sign convention: zero is sign=false — a (false, 0) leg is zero,
      // not negative-zero (getAccountBalances answers nonzero markets only,
      // but the guard costs nothing).
      const par = bals[2][i];
      const wei = bals[3][i];
      const parSigned = (par.sign ? par.value : -par.value).toString();
      const weiSignedRaw = wei.sign ? wei.value : -wei.value;
      const weiScaled = Number(weiSignedRaw) / 10 ** decimals;

      const priceRaw = ok<{ value: bigint }>(second[base]);
      const priceUsd =
        priceRaw != null && priceRaw.value > ZERO ? Number(priceRaw.value) / 10 ** (36 - decimals) : null;
      const premium = Number(ok<{ value: bigint }>(second[base + 1])?.value ?? ZERO) / DOLOMITE_BASE;
      const rateRaw = ok<{ value: bigint }>(second[base + 2]);
      const borrowAprPct = rateRaw != null ? (Number(rateRaw.value) / DOLOMITE_BASE) * SECONDS_PER_YEAR * 100 : null;

      const totalPar = ok<{ borrow: bigint; supply: bigint }>(second[base + 3]);
      const index = ok<{ borrow: bigint; supply: bigint; lastUpdate: number }>(second[base + 4]);
      const supplyTotal = totalPar != null && index != null ? (totalPar.supply * index.supply) / BASE : ZERO;
      const borrowTotal = totalPar != null && index != null ? (totalPar.borrow * index.borrow) / BASE : ZERO;
      const utilisation = supplyTotal > ZERO ? Number(borrowTotal) / Number(supplyTotal) : null;
      const supplyAprPct =
        borrowAprPct != null && utilisation != null ? borrowAprPct * utilisation * earningsRate : null;

      return {
        marketId,
        token,
        symbol,
        decimals,
        parRaw: parSigned,
        weiRaw: weiSignedRaw.toString(),
        wei: weiScaled,
        priceUsd,
        valueUsd: priceUsd != null ? Math.abs(weiScaled) * priceUsd : null,
        marginPremium: premium,
        borrowAprPct,
        supplyAprPct,
        isClosing: ok<boolean>(second[base + 5]) ?? false,
      };
    });

    const supplyValueUsd = Number(values[0].value) / DOLOMITE_VALUE_SCALE;
    const borrowValueUsd = Number(values[1].value) / DOLOMITE_VALUE_SCALE;
    const adjSupplyValueUsd = Number(adjusted[0].value) / DOLOMITE_VALUE_SCALE;
    const adjBorrowValueUsd = Number(adjusted[1].value) / DOLOMITE_VALUE_SCALE;

    return {
      owner: owner.toLowerCase(),
      accountNumber,
      blockNumber,
      balances,
      supplyValueUsd,
      borrowValueUsd,
      adjSupplyValueUsd,
      adjBorrowValueUsd,
      rawValues: {
        supply: values[0].value.toString(),
        borrow: values[1].value.toString(),
        adjSupply: adjusted[0].value.toString(),
        adjBorrow: adjusted[1].value.toString(),
      },
      marginRatio,
      liquidationSpread,
      override,
      marginRatioForAccount,
      requiredCollateralization: 1 + marginRatioForAccount,
      collateralization: adjBorrowValueUsd > 0 ? adjSupplyValueUsd / adjBorrowValueUsd : null,
      accountStatus: status,
      accountStatusLabel: STATUS_LABEL[status] ?? "Normal",
      chainStale: false,
    };
  } catch {
    return stub(owner.toLowerCase(), accountNumber);
  }
}
