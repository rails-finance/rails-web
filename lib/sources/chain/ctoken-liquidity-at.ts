// Why a Compound V2-family account could be liquidated, read from the chain at
// the liquidation's block: the Comptroller's own `getAccountLiquidity` at the
// block before (a shortfall above zero is what lets anyone liquidate) and at
// the block itself (after the liquidation), the close factor in force, and the
// collateral market's `protocolSeizeShareMantissa` (the part of the seized
// cTokens/mTokens the market keeps as reserves).
//
// Archive `eth_call`s, one batch. SERVER-ONLY.

import { parseAbi, type PublicClient } from "viem";
import { chainBatchClient } from "./rpc";
import { COMPOUND_V2_ADDRESSES, COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_ADDRESSES, MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { MOONWELL_BASE_COMPTROLLER } from "@/lib/moonwell-base/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { CTokenLiquidityAt, CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

const COMPTROLLER_ABI = parseAbi([
  "function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  "function getAssetsIn(address account) view returns (address[])",
  "function markets(address cToken) view returns (bool, uint256)",
  "function oracle() view returns (address)",
  "function isDeprecated(address cToken) view returns (bool)",
]);
const CTOKEN_ABI = parseAbi([
  "function protocolSeizeShareMantissa() view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function borrowIndex() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function symbol() view returns (string)",
]);
const ORACLE_ABI = parseAbi(["function getUnderlyingPrice(address cToken) view returns (uint256)"]);

const ADDRESS = /^0x[0-9a-f]{40}$/;

function deployment(protocol: CTokenProtocol): {
  chainId: ChainId;
  comptroller: string;
  token: (key: string) => string | undefined;
  /** The catalog's label for a market address, where the catalog has one. */
  label?: (address: string) => string | undefined;
} {
  if (protocol === "compound-v2")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: COMPOUND_V2_ADDRESSES.COMPTROLLER,
      token: (k) => COMPOUND_V2_MARKET_BY_KEY[k]?.ctoken,
      label: (a) => Object.values(COMPOUND_V2_MARKET_BY_KEY).find((m) => m.ctoken === a.toLowerCase())?.symbol,
    };
  if (protocol === "moonwell")
    return {
      chainId: MAINNET_CHAIN_ID,
      comptroller: MOONWELL_ADDRESSES.COMPTROLLER,
      token: (k) => MOONWELL_MARKET_BY_KEY[k]?.mtoken,
      label: (a) => Object.values(MOONWELL_MARKET_BY_KEY).find((m) => m.mtoken === a.toLowerCase())?.symbol,
    };
  return {
    chainId: BASE_CHAIN_ID,
    comptroller: MOONWELL_BASE_COMPTROLLER,
    // Base keys each market by its mToken address.
    token: (k) => (ADDRESS.test(k) ? k : undefined),
  };
}

const WAD = 1e18;

export async function readCTokenLiquidityAt(
  protocol: CTokenProtocol,
  wallet: string,
  block: number,
  collateral: string,
  debtMarket?: string,
): Promise<CTokenLiquidityAt | null> {
  const d = deployment(protocol);
  const collToken = d.token(collateral.toLowerCase());
  const debtToken = debtMarket ? d.token(debtMarket.toLowerCase()) : undefined;
  const client = chainBatchClient(d.chainId) as PublicClient;
  const comptroller = d.comptroller as `0x${string}`;
  const account = wallet as `0x${string}`;
  const liq = (b: number) =>
    client
      .readContract({
        address: comptroller,
        abi: COMPTROLLER_ABI,
        functionName: "getAccountLiquidity",
        args: [account],
        blockNumber: BigInt(b),
      })
      .then((r) => r as readonly [bigint, bigint, bigint])
      .catch(() => null);
  const read = (address: string | undefined, functionName: "borrowIndex" | "borrowBalanceStored", b: number) =>
    address
      ? client
          .readContract({
            address: address as `0x${string}`,
            abi: CTOKEN_ABI,
            functionName,
            args: functionName === "borrowBalanceStored" ? [account] : [],
            blockNumber: BigInt(b),
          } as never)
          .then((r) => r as bigint)
          .catch(() => null)
      : Promise.resolve(null);
  const [before, after, closeFactor, share, stored, idxBefore, idxAt] = await Promise.all([
    liq(block - 1),
    liq(block),
    client
      .readContract({
        address: comptroller,
        abi: COMPTROLLER_ABI,
        functionName: "closeFactorMantissa",
        blockNumber: BigInt(block - 1),
      })
      .then((r) => Number(r as bigint) / WAD)
      .catch(() => null),
    collToken
      ? client
          .readContract({
            address: collToken as `0x${string}`,
            abi: CTOKEN_ABI,
            functionName: "protocolSeizeShareMantissa",
            blockNumber: BigInt(block),
          })
          .then((r) => Number(r as bigint) / WAD)
          // A cToken whose code has no protocol share (cETH, cUSDC and five
          // other Compound V2 markets) reverts on the getter: its seizures go
          // wholly to the liquidator.
          .catch((e: unknown) => (/revert/i.test(String((e as Error)?.message ?? "")) ? 0 : null))
      : Promise.resolve(null),
    read(debtToken, "borrowBalanceStored", block - 1),
    read(debtToken, "borrowIndex", block - 1),
    read(debtToken, "borrowIndex", block),
  ]);
  // What counted toward the borrow limit at the block before: each entered
  // market (getAssetsIn) with a supply, its collateral factor and its value
  // at the oracle (cTokens × exchangeRateStored × getUnderlyingPrice ÷ 1e54,
  // in the Comptroller's numeraire). Whether the seized market was entered,
  // and whether the borrowed market was deprecated (Compound V2 only).
  const prev = BigInt(block - 1);
  const call = <T>(
    address: string,
    abi: typeof COMPTROLLER_ABI | typeof CTOKEN_ABI | typeof ORACLE_ABI,
    functionName: string,
    args: unknown[],
    b: bigint = prev,
  ) =>
    client
      .readContract({ address: address as `0x${string}`, abi, functionName, args, blockNumber: b } as never)
      .then((r) => r as T)
      .catch(() => null);
  const [assetsIn, oracle, deprecatedRaw] = await Promise.all([
    call<readonly string[]>(comptroller, COMPTROLLER_ABI, "getAssetsIn", [account]),
    call<string>(comptroller, COMPTROLLER_ABI, "oracle", []),
    protocol === "compound-v2" && debtToken
      ? call<boolean>(comptroller, COMPTROLLER_ABI, "isDeprecated", [debtToken])
      : Promise.resolve(null),
  ]);
  const counted = assetsIn
    ? (
        await Promise.all(
          assetsIn.map(async (m) => {
            const [mk, bal, rate, price, sym] = await Promise.all([
              call<readonly [boolean, bigint]>(comptroller, COMPTROLLER_ABI, "markets", [m]),
              call<bigint>(m, CTOKEN_ABI, "balanceOf", [account]),
              call<bigint>(m, CTOKEN_ABI, "exchangeRateStored", []),
              oracle ? call<bigint>(oracle, ORACLE_ABI, "getUnderlyingPrice", [m]) : Promise.resolve(null),
              d.label?.(m) ? Promise.resolve(null) : call<string>(m, CTOKEN_ABI, "symbol", []),
            ]);
            if (!mk || bal == null || bal === BigInt(0)) return null;
            const value =
              rate != null && price != null ? Number((bal * rate * price) / BigInt(10) ** BigInt(36)) / 1e18 : null;
            return {
              market: m.toLowerCase(),
              label: d.label?.(m) ?? (sym ? sym.replace(/^[cm]/, "") : m.slice(0, 6)),
              collateralFactor: Number(mk[1]) / WAD,
              value,
            };
          }),
        )
      ).filter((x): x is NonNullable<typeof x> => x != null)
    : null;
  const collateralEntered =
    assetsIn && collToken ? assetsIn.some((m) => m.toLowerCase() === collToken.toLowerCase()) : null;

  // The debt as the liquidation met it: the stored balance at the block
  // before, carried to the block's own borrow index (interest accrues once
  // per block, before the liquidation reads it).
  const debtBeforeRaw =
    stored != null && idxBefore != null && idxAt != null && idxBefore > BigInt(0)
      ? ((stored * idxAt) / idxBefore).toString()
      : null;
  if (!before && !after) return null;
  const side = (r: readonly [bigint, bigint, bigint] | null) =>
    r && r[0] === BigInt(0) ? { liquidityUsd: Number(r[1]) / WAD, shortfallUsd: Number(r[2]) / WAD } : null;
  return {
    block,
    before: side(before),
    after: side(after),
    closeFactor,
    protocolSeizeShare: share,
    debtBeforeRaw,
    counted,
    collateralMarket: collToken ? collToken.toLowerCase() : null,
    collateralEntered,
    debtMarketDeprecated: deprecatedRaw,
  };
}

/** Whether a market was entered as collateral after a row's block, and the
 *  factor it counted at: Comptroller.checkMembership and markets() at that
 *  block. A supply in a market the account never entered backs no borrowing. */
export async function readCTokenMembershipAt(
  protocol: CTokenProtocol,
  wallet: string,
  block: number,
  market: string,
): Promise<{ block: number; entered: boolean; collateralFactor: number | null } | null> {
  const d = deployment(protocol);
  const token = d.token(market.toLowerCase());
  if (!token) return null;
  const client = chainBatchClient(d.chainId) as PublicClient;
  const at = BigInt(block);
  const [assetsIn, mk] = await Promise.all([
    client
      .readContract({
        address: d.comptroller as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: "getAssetsIn",
        args: [wallet as `0x${string}`],
        blockNumber: at,
      })
      .catch(() => null),
    client
      .readContract({
        address: d.comptroller as `0x${string}`,
        abi: COMPTROLLER_ABI,
        functionName: "markets",
        args: [token as `0x${string}`],
        blockNumber: at,
      })
      .catch(() => null),
  ]);
  if (!assetsIn) return null;
  return {
    block,
    entered: (assetsIn as readonly string[]).some((a) => a.toLowerCase() === token.toLowerCase()),
    collateralFactor: mk ? Number((mk as readonly [boolean, bigint])[1]) / WAD : null,
  };
}
