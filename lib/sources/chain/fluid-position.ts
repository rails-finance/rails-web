// Live Fluid per-position read — the chain detail reader for /fluid/[nft].
// One VaultResolver.positionByNftId eth_call at the latest block returns the
// position's SETTLED state (the resolver runs the vault's OWN
// fetchLatestPosition settlement math — every liquidation sweep applied — and
// converts raw units through the live exchange prices, so accrued interest is
// included) together with the vault's whole config block:
//
//   • collateralFactor / liquidationThreshold / liquidationMaxLimit /
//     liquidationPenalty — the governance-set risk lines, 1e4-scaled percents.
//   • The vault's own oracle and its two prices. A Fluid oracle prices the
//     COLLATERAL IN THE DEBT TOKEN (debt per col — the resolver source states
//     it), scaled 1e(27 + debtDec − colDec). There is NO USD feed anywhere in
//     the protocol: the ratio the liquidation engine judges is debt ÷
//     (collateral × this price), so every risk figure here lives in the
//     vault's own two-token space. Smart legs price DEX shares the same way
//     (T2: debt token per col share; T3/T4: debt SHARES on the debt leg —
//     valuing those shares in tokens needs the DexResolver, deliberately not
//     asserted at this depth).
//   • Vault rates and totals for context.
//
// Derived on top (chain-derived, same-block inputs): the position's ratio in
// the engine's own space, the liquidation price (the debt-per-col price at
// which the ratio hits the threshold), and the collateral valued in the debt
// token. The decode and the ratio arithmetic are proven against the contract
// by scripts/verify-fluid-chain.mjs.
//
// SERVER-ONLY.

import { getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import { FLUID_ADDRESSES, fluidOraclePriceScale, isFluidEthSentinel, vaultKindOf } from "@/lib/fluid/asset-catalog";
import { FLUID_VAULT_RESOLVER_ABI } from "@/lib/fluid/vault-resolver-abi";

const ZERO = BigInt(0);
const SHARES_DECIMALS = 18; // smart-vault legs are DEX shares, 1e18 like the API lane
/** fetchLatestPosition signals "fully liquidated, nothing left" with tick = type(int).min. */
const INT_MIN = BigInt("-57896044618658097711785492504343953926634992332820282019728792003956564819968");

export interface FluidPositionChainResponse {
  nftId: string;
  blockNumber: number;
  /** False when the factory has never minted this NFT id (resolver returns
   *  the zero vault) — distinct from an RPC failure (`chainStale`). */
  found: boolean;
  vault: string;
  vaultId: number;
  vaultType: number;
  isSmartCol: boolean;
  isSmartDebt: boolean;
  owner: string | null;
  /** The resolver's OWN verdict: the position's tick was swept by a
   *  liquidation and the settled figures reflect it. */
  isLiquidated: boolean;
  /** Supply-only position — no debt leg, no tick, no liquidation surface. */
  isSupplyPosition: boolean;
  /** Both legs settled to zero (closed, or fully liquidated). */
  isEmpty: boolean;
  /** Settled figures at head — the vault's own settlement math with every
   *  liquidation sweep AND accrued interest applied (raw integer strings +
   *  human units in each leg's own token / shares). */
  supplyRaw: string;
  supply: number;
  /** Full-precision human decimal string (raw ÷ 10^decimals, no float). */
  supplyExact: string;
  borrowRaw: string;
  borrow: number;
  borrowExact: string;
  /** Leg identity resolved on chain (ERC-20 symbol/decimals; smart legs are
   *  DEX shares at 18 decimals and carry a null symbol like the API lane). */
  supplySymbol: string | null;
  supplyDecimals: number;
  borrowSymbol: string | null;
  borrowDecimals: number;
  /** What a smart leg's shares are shares OF — the pool's own two sides, which
   *  the vault names itself (constantVariables.{supply,borrow}Token carry
   *  token0 AND token1 there). The quantity stays shares; nothing is
   *  converted. Null on a token leg or when a side's symbol won't resolve. */
  supplyPoolPair: [string, string] | null;
  borrowPoolPair: [string, string] | null;
  /** Governance risk lines, as fractions of 1 (chain 1e4 percents ÷ 1e4):
   *  borrowing gates at collateralFactor; liquidation fires above
   *  liquidationThreshold; above liquidationMaxLimit the position can be
   *  fully absorbed; liquidationPenalty is the liquidator's bonus. */
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationMaxLimit: number;
  liquidationPenalty: number;
  /** The vault's own oracle contract and its prices — DEBT PER COL, human
   *  scale (how much of the debt leg one unit of the collateral leg is worth).
   *  `oraclePriceLiquidate` is the price the liquidation engine judges with. */
  oracle: string;
  oraclePriceOperateRaw: string;
  oraclePriceLiquidateRaw: string;
  oraclePriceDebtPerCol: number | null;
  oraclePriceLiquidateDebtPerCol: number | null;
  /** The position's ratio in the engine's own space: borrow ÷ (supply ×
   *  liquidate price). Null without debt. Compare against the lines above. */
  ratio: number | null;
  /** The debt-per-col price at which the ratio hits liquidationThreshold:
   *  borrow ÷ (supply × threshold) — the liquidation equation rearranged. */
  liqPriceDebtPerCol: number | null;
  /** Collateral valued in the vault's debt leg: supply × operate price.
   *  Null when the debt leg is DEX shares (T3/T4) — shares are not a token
   *  unit and converting them needs the DexResolver. */
  colValueInDebt: number | null;
  /** Vault rates, annual percent. Null on a smart leg — there the resolver
   *  figure is only the vault's own rewards/fee component, not the full rate. */
  supplyRatePct: number | null;
  borrowRatePct: number | null;
  /** Vault context at the same block. */
  vaultTotalPositions: number | null;
  vaultTotalSupply: number | null;
  vaultTotalBorrow: number | null;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

function stub(nftId: string): FluidPositionChainResponse {
  return {
    nftId,
    blockNumber: 0,
    found: false,
    vault: "",
    vaultId: 0,
    vaultType: 0,
    isSmartCol: false,
    isSmartDebt: false,
    owner: null,
    isLiquidated: false,
    isSupplyPosition: false,
    isEmpty: true,
    supplyRaw: "0",
    supply: 0,
    supplyExact: "0",
    borrowRaw: "0",
    borrow: 0,
    borrowExact: "0",
    supplySymbol: null,
    supplyDecimals: SHARES_DECIMALS,
    borrowSymbol: null,
    borrowDecimals: SHARES_DECIMALS,
    supplyPoolPair: null,
    borrowPoolPair: null,
    collateralFactor: 0,
    liquidationThreshold: 0,
    liquidationMaxLimit: 0,
    liquidationPenalty: 0,
    oracle: "",
    oraclePriceOperateRaw: "0",
    oraclePriceLiquidateRaw: "0",
    oraclePriceDebtPerCol: null,
    oraclePriceLiquidateDebtPerCol: null,
    ratio: null,
    liqPriceDebtPerCol: null,
    colValueInDebt: null,
    supplyRatePct: null,
    borrowRatePct: null,
    vaultTotalPositions: null,
    vaultTotalSupply: null,
    vaultTotalBorrow: null,
    chainStale: true,
  };
}

/** Raw integer → full-precision human decimal string (BigInt division; no
 *  float on the way). */
function rawToDecimalString(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * Read one position's live settled state + its vault's risk config straight
 * from the VaultResolver. Returns a `chainStale` stub on RPC failure so the
 * caller falls back to its indexed figures (the risk surfaces just stay off).
 */
export async function loadFluidPositionFromChain(nftIdRaw: string): Promise<FluidPositionChainResponse> {
  const nftId = nftIdRaw.replace(/[^0-9]/g, "");
  if (!nftId) return stub(nftIdRaw);
  try {
    const client = alchemyClient();
    const [blockNumber, result] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({
        address: FLUID_ADDRESSES.VAULT_RESOLVER as `0x${string}`,
        abi: FLUID_VAULT_RESOLVER_ABI,
        functionName: "positionByNftId",
        args: [BigInt(nftId)],
      }),
    ]);
    const [pos, vd] = result;
    if (!vd.vault || BigInt(vd.vault) === ZERO) return { ...stub(nftId), blockNumber, chainStale: false };

    const vaultType = Number(vd.constantVariables.vaultType);
    const kind = vaultKindOf(vaultType);
    const smartCol = vd.isSmartCol || kind === "smart-col" || kind === "smart";
    const smartDebt = vd.isSmartDebt || kind === "smart-debt" || kind === "smart";

    // Leg identity: ERC-20 meta for token legs (cached multicall), DEX shares
    // for smart legs — same convention as the API lane (null symbol, 18 dp).
    // Native ETH rides the sentinel address (no symbol() to call), so it is
    // named directly — the vaults source's exact convention; without it the
    // leg's null symbol reads as DEX shares downstream, mislabeling an ETH
    // figure on a standard vault.
    const supplyToken = vd.constantVariables.supplyToken.token0;
    const borrowToken = vd.constantVariables.borrowToken.token0;
    // Smart legs: the vault also names the pool's second side (token1) — both
    // ride the same cached multicall so the pool pair costs no extra request.
    const supplyToken1 = vd.constantVariables.supplyToken.token1;
    const borrowToken1 = vd.constantVariables.borrowToken.token1;
    const wanted = [
      supplyToken,
      borrowToken,
      ...(smartCol ? [supplyToken1] : []),
      ...(smartDebt ? [borrowToken1] : []),
    ].filter((a) => !isFluidEthSentinel(a) && BigInt(a) !== ZERO);
    const meta = await resolveErc20Meta(wanted);
    const supplyMeta = smartCol ? null : (meta.get(supplyToken.toLowerCase()) ?? null);
    const borrowMeta = smartDebt ? null : (meta.get(borrowToken.toLowerCase()) ?? null);
    const sideName = (addr: string): string | null => {
      if (isFluidEthSentinel(addr)) return "ETH";
      const m = meta.get(addr.toLowerCase());
      return m?.named ? m.symbol : null;
    };
    const poolPair = (t0: string, t1: string): [string, string] | null => {
      if (BigInt(t0) === ZERO || BigInt(t1) === ZERO) return null;
      const a = sideName(t0);
      const b = sideName(t1);
      return a != null && b != null ? [a, b] : null;
    };
    const supplyIsEth = !smartCol && isFluidEthSentinel(supplyToken);
    const borrowIsEth = !smartDebt && isFluidEthSentinel(borrowToken);
    const supplyDecimals = supplyIsEth ? 18 : (supplyMeta?.decimals ?? SHARES_DECIMALS);
    const borrowDecimals = borrowIsEth ? 18 : (borrowMeta?.decimals ?? SHARES_DECIMALS);

    const supply = scaleRaw(pos.supply, supplyDecimals);
    const borrow = scaleRaw(pos.borrow, borrowDecimals);
    const isSupplyPosition = pos.isSupplyPosition;
    const isEmpty = pos.supply === ZERO && pos.borrow === ZERO;

    const c = vd.configs;
    const collateralFactor = Number(c.collateralFactor) / 1e4;
    const liquidationThreshold = Number(c.liquidationThreshold) / 1e4;
    const priceScale = fluidOraclePriceScale(supplyDecimals, borrowDecimals);
    const priceOperate = c.oraclePriceOperate > ZERO ? Number(c.oraclePriceOperate) / priceScale : null;
    const priceLiquidate = c.oraclePriceLiquidate > ZERO ? Number(c.oraclePriceLiquidate) / priceScale : null;

    // The engine's own ratio space: debt ÷ (collateral × the liquidate price).
    const colLiqValue = priceLiquidate != null && supply > 0 ? supply * priceLiquidate : null;
    const ratio = colLiqValue != null && borrow > 0 ? borrow / colLiqValue : null;
    const liqPriceDebtPerCol =
      borrow > 0 && supply > 0 && liquidationThreshold > 0 ? borrow / (supply * liquidationThreshold) : null;

    // Rates: 1e2-precision annual percents. On a smart leg the resolver figure
    // is only the vault's own rewards/fee component — stay silent there.
    const r = vd.exchangePricesAndRates;
    const supplyRatePct = smartCol ? null : Number(r.supplyRateVault) / 100;
    const borrowRatePct = smartDebt ? null : Number(r.borrowRateVault) / 100;

    return {
      nftId,
      blockNumber,
      found: true,
      vault: getAddress(vd.vault).toLowerCase(),
      vaultId: Number(vd.constantVariables.vaultId),
      vaultType,
      isSmartCol: smartCol,
      isSmartDebt: smartDebt,
      owner: pos.owner && BigInt(pos.owner) !== ZERO ? pos.owner.toLowerCase() : null,
      isLiquidated: pos.isLiquidated || pos.tick === INT_MIN,
      isSupplyPosition,
      isEmpty,
      supplyRaw: pos.supply.toString(),
      supply,
      supplyExact: rawToDecimalString(pos.supply, supplyDecimals),
      borrowRaw: pos.borrow.toString(),
      borrow,
      borrowExact: rawToDecimalString(pos.borrow, borrowDecimals),
      supplySymbol: supplyIsEth ? "ETH" : supplyMeta?.named ? supplyMeta.symbol : null,
      supplyDecimals,
      borrowSymbol: borrowIsEth ? "ETH" : borrowMeta?.named ? borrowMeta.symbol : null,
      borrowDecimals,
      supplyPoolPair: smartCol ? poolPair(supplyToken, supplyToken1) : null,
      borrowPoolPair: smartDebt ? poolPair(borrowToken, borrowToken1) : null,
      collateralFactor,
      liquidationThreshold,
      liquidationMaxLimit: Number(c.liquidationMaxLimit) / 1e4,
      liquidationPenalty: Number(c.liquidationPenalty) / 1e4,
      oracle: c.oracle.toLowerCase(),
      oraclePriceOperateRaw: c.oraclePriceOperate.toString(),
      oraclePriceLiquidateRaw: c.oraclePriceLiquidate.toString(),
      oraclePriceDebtPerCol: priceOperate,
      oraclePriceLiquidateDebtPerCol: priceLiquidate,
      ratio,
      liqPriceDebtPerCol,
      colValueInDebt: !smartDebt && priceOperate != null && supply > 0 ? supply * priceOperate : null,
      supplyRatePct,
      borrowRatePct,
      vaultTotalPositions: Number(vd.vaultState.totalPositions),
      vaultTotalSupply: scaleRaw(vd.totalSupplyAndBorrow.totalSupplyVault, supplyDecimals),
      vaultTotalBorrow: scaleRaw(vd.totalSupplyAndBorrow.totalBorrowVault, borrowDecimals),
      chainStale: false,
    };
  } catch {
    return stub(nftIdRaw);
  }
}
