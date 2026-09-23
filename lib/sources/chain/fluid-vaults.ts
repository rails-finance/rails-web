// Fluid protocol view — the whole vault roster, read at one head block.
// ----------------------------------------------------------------------------
// Fluid has no market catalog: the VaultFactory mints one vault per pair, and
// the roster is whatever it has minted (181 at build time). `getVaultsEntireData()`
// returns every one of them in a SINGLE eth_call — the same VaultEntireData
// block positionByNftId returns as its second output, arrayed. That is the whole
// read; the only other traffic is one cached ERC-20 multicall to name the legs.
//
// What the view claims (the protocol's own shape, not a template): each vault
// carries its OWN three-rung ladder — borrow up to collateralFactor, liquidate
// from liquidationThreshold, and past liquidationMaxLimit the vault ABSORBS the
// position onto its own book. That last rung is why Fluid's absorb rows pay no
// bonus and answer to no penalty constant (see the forensics lane); this is the
// protocol-level statement of the same fact the liquidation cards prove one row
// at a time.
//
// Two shapes the roster actually contains, both stated rather than smoothed:
//  * 8 vaults are MINTED BUT NEVER CONFIGURED — zero ladder, zero oracle, zero
//    funds. They get `configured: false` and no ladder, because rendering a 0%
//    rung would assert a risk parameter the vault does not have.
//  * A configured vault can still have an oracle that answers 0 (2 do, both on
//    the same feed, and both hold real supply and debt). Price is null there —
//    the same guard the position lane uses. A vault with debt and no price is a
//    fact about the protocol, not a gap to paper over.
//
// Smart vaults (80 of 181) hold Fluid DEX pool shares on a leg. Those shares are
// resolved into the tokens they are MADE OF, through the DexResolver at head —
// the pool states its own per-share composition and we render that figure rather
// than re-derive one from reserves ÷ totalShares. It is composition, not price:
// pro-rata is the protocol's own redemption mechanic (withdrawPerfect), and no
// USD is implied — Fluid still runs no USD feed.
//
// The DexResolver is HEAD-ONLY (no bytecode before ~2.52e7), which is why this
// unblocks the roster and the position display but NOT smart-vault forensics:
// a liquidation's fire block predates the resolver entirely, the same trap that
// forced the forensics lane onto raw vault storage.
//
// A smart leg's RATE stays null regardless — the resolver's rate figure there is
// only the vault's own rewards/fee component, not the full rate (the convention
// lib/sources/chain/fluid-position.ts already ships).
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import {
  FLUID_ADDRESSES,
  fluidOraclePriceScale,
  isFluidEthSentinel,
  vaultKindOf,
  type FluidVaultKind,
} from "@/lib/fluid/asset-catalog";
import { FLUID_VAULT_RESOLVER_ABI } from "@/lib/fluid/vault-resolver-abi";
import { FLUID_DEX_RESOLVER_ABI } from "@/lib/fluid/dex-resolver-abi";

const ZERO = BigInt(0);
const SHARES_DECIMALS = 18; // smart-vault legs are DEX shares, 1e18 like the API lane

/** DexResolver — mainnet row of Instadapp/fluid-contracts-public
 *  deployments/deployments.md. HEAD-ONLY: it has no bytecode before ~block
 *  2.52e7, so it can never answer at a historical liquidation block. */
const FLUID_DEX_RESOLVER_ADDRESS = "0x11D80CfF056Cef4F9E6d23da8672fE9873e5cC07";

interface DexPool {
  token0: string;
  token1: string;
  /** The pool's OWN per-share composition, 1e18-scaled: how much of each token
   *  one share is. The resolver states these itself — we do not re-derive them
   *  from reserves ÷ totalShares. Supply and borrow shares are DIFFERENT
   *  instruments backed by different reserves, so each leg reads its own pair. */
  perSupplyShare: [bigint, bigint];
  perBorrowShare: [bigint, bigint];
}

/** One token inside a smart leg's DEX pool, and how much of it the leg's shares
 *  correspond to at head. */
export interface LegToken {
  symbol: string | null;
  amount: number;
}

export interface FluidVaultRow {
  vault: string;
  vaultId: number;
  vaultType: number;
  kind: FluidVaultKind;
  isSmartCol: boolean;
  isSmartDebt: boolean;
  /** Leg identity. Null on a smart leg (DEX shares, not a token) and on a token
   *  whose symbol() didn't answer — same convention as the position lane. */
  supplySymbol: string | null;
  borrowSymbol: string | null;
  supplyDecimals: number;
  borrowDecimals: number;

  /** On a smart leg, the two tokens of the Fluid DEX pool whose shares the leg
   *  holds — the vault names them itself (supplyToken/borrowToken carry token0
   *  AND token1 there). Null on a token leg. */
  supplyPool: [string, string] | null;
  borrowPool: [string, string] | null;

  /** What a smart leg's shares ARE, resolved through the DexResolver at head:
   *  the leg's pro-rata slice of the pool's own reserves. Pro-rata is the
   *  protocol's own redemption mechanic (withdrawPerfect), so this is a
   *  chain-derived fact about composition — NOT a price and NOT a USD claim.
   *  Null when the leg is a plain token, or when the pool holds no reserves to
   *  divide (some do — a share of nothing is nothing, and saying "0 of each" is
   *  more honest than implying a position). */
  supplyLegTokens: LegToken[] | null;
  borrowLegTokens: LegToken[] | null;

  /** False when the vault was minted but never given a ladder or an oracle.
   *  Everything below is null on such a vault. */
  configured: boolean;

  /** The three rungs, as fractions of collateral value (0.85 = 85%).
   *  borrow up to `collateralFactor` · liquidate from `liquidationThreshold` ·
   *  absorb past `liquidationMaxLimit`. */
  collateralFactor: number | null;
  liquidationThreshold: number | null;
  liquidationMaxLimit: number | null;
  /** The premium floor the engine guarantees a liquidator (0.01 = 1%). */
  liquidationPenalty: number | null;
  withdrawalGap: number | null;

  /** The vault's own oracle and its debt-per-col prices. Price is null when the
   *  oracle answers 0 — it is set but not speaking. */
  oracle: string | null;
  oraclePriceOperate: number | null;
  oraclePriceLiquidate: number | null;

  /** Vault totals. On a smart leg these are DEX shares, not tokens. */
  totalSupply: number;
  totalBorrow: number;

  /** Annual percent. Null on a smart leg (see header). */
  supplyRatePct: number | null;
  borrowRatePct: number | null;

  /** The vault's aggregate borrowed share, in the engine's own ratio space:
   *  totalBorrow ÷ (totalSupply × the liquidate price). This is the same axis
   *  the ladder's rungs sit on, so the two can be read against each other.
   *
   *  It is the VAULT's aggregate, not any position's — a vault well under its
   *  own threshold can still hold individual positions being liquidated, and
   *  the page says so. Null on a smart vault (the legs are DEX shares and the
   *  price relates shares to shares, so the quotient is not a borrowed share of
   *  anything nameable), and null without collateral or a speaking oracle. */
  aggregateRatio: number | null;
}

export interface FluidVaultsChainResponse {
  blockNumber: number;
  vaults: FluidVaultRow[];
  summary: {
    total: number;
    configured: number;
    /** Minted but never configured — no ladder, no oracle, no funds. */
    shells: number;
    tokenPair: number;
    smart: number;
    /** Configured vaults whose oracle answers 0. */
    oracleSilent: number;
  };
  /** True when the chain read failed and we returned an empty roster. */
  chainStale: boolean;
}

function empty(): FluidVaultsChainResponse {
  return {
    blockNumber: 0,
    vaults: [],
    summary: { total: 0, configured: 0, shells: 0, tokenPair: 0, smart: 0, oracleSilent: 0 },
    chainStale: true,
  };
}

const isZeroAddr = (a: string | undefined) => !a || BigInt(a) === ZERO;

export async function loadFluidVaultsFromChain(): Promise<FluidVaultsChainResponse> {
  try {
    const client = alchemyClient();
    const [blockNumber, all] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({
        address: FLUID_ADDRESSES.VAULT_RESOLVER as `0x${string}`,
        abi: FLUID_VAULT_RESOLVER_ABI,
        functionName: "getVaultsEntireData",
      }),
    ]);

    // Name every token leg in one cached multicall — skip smart legs (DEX
    // shares, not a token: null symbol by convention) and skip native ETH,
    // whose sentinel implements no symbol() and would otherwise leave the most
    // common collateral on the protocol rendering as a truncated address.
    const wanted: string[] = [];
    for (const vd of all) {
      const kind = vaultKindOf(Number(vd.constantVariables.vaultType));
      const smartCol = vd.isSmartCol || kind === "smart-col" || kind === "smart";
      const smartDebt = vd.isSmartDebt || kind === "smart-debt" || kind === "smart";
      const sup = vd.constantVariables.supplyToken;
      const bor = vd.constantVariables.borrowToken;
      // Token legs: name token0. Smart legs: name BOTH sides of the pool, so
      // the row can say which pair's shares it holds.
      for (const [leg, smart] of [
        [sup, smartCol],
        [bor, smartDebt],
      ] as const) {
        const addrs = smart ? [leg.token0, leg.token1] : [leg.token0];
        for (const a of addrs) if (a && !isFluidEthSentinel(a) && BigInt(a) !== ZERO) wanted.push(a);
      }
    }
    const meta = await resolveErc20Meta(wanted);

    // Resolve every smart leg's shares into the tokens they are a slice OF.
    // The vaults name their own pools (constantVariables.supply/borrow points at
    // the DEX rather than the Liquidity layer), so we ask the DexResolver for
    // exactly those and never enumerate: getAllDexEntireDatas() is a floor — it
    // misses pools that answer perfectly well when asked for by address.
    const pools = [
      ...new Set(
        all
          .flatMap((vd) => [vd.constantVariables.supply, vd.constantVariables.borrow])
          .filter((a) => a.toLowerCase() !== FLUID_ADDRESSES.LIQUIDITY.toLowerCase()),
      ),
    ];
    const dex = new Map<string, DexPool>();
    if (pools.length > 0) {
      try {
        // Cast the decode: the fragment's struct is deep enough that viem's
        // inference gives up (it lands on `never`), and only these five fields
        // are read. The shape is pinned by the verified ABI, not by this type.
        const datas = (await client.readContract({
          address: FLUID_DEX_RESOLVER_ADDRESS as `0x${string}`,
          abi: FLUID_DEX_RESOLVER_ABI,
          functionName: "getDexEntireDatas",
          args: [pools],
        })) as unknown as {
          dex: string;
          constantViews: { token0: string; token1: string };
          dexState: {
            token0PerSupplyShare: bigint;
            token1PerSupplyShare: bigint;
            token0PerBorrowShare: bigint;
            token1PerBorrowShare: bigint;
          };
        }[];
        for (const d of datas) {
          dex.set(d.dex.toLowerCase(), {
            token0: d.constantViews.token0,
            token1: d.constantViews.token1,
            perSupplyShare: [d.dexState.token0PerSupplyShare, d.dexState.token1PerSupplyShare],
            perBorrowShare: [d.dexState.token0PerBorrowShare, d.dexState.token1PerBorrowShare],
          });
        }
      } catch (e) {
        // The conversion is an enrichment, not the roster: a DexResolver failure
        // must leave every vault rendering its shares, not blank the page.
        console.error("Fluid DexResolver read failed — smart legs stay as shares:", e);
      }
    }

    /** One token's display name: the ETH sentinel answers for itself, everything
     *  else comes from the multicall (null when symbol() didn't answer). */
    const nameOf = (token: string): string | null => {
      if (isFluidEthSentinel(token)) return "ETH";
      const m = meta.get(token.toLowerCase());
      return m?.named ? m.symbol : null;
    };

    /** A smart leg's shares, resolved into the tokens they are made of, using the
     *  pool's OWN per-share figures (1e18-scaled) rather than a pro-rata we
     *  recompute from reserves ÷ totalShares. Same principle as Maple's rate:
     *  render the protocol's own answer, don't re-derive one that has to agree.
     *
     *  A supply leg and a debt leg are different instruments backed by different
     *  reserves, so each reads its own pair — using the collateral figures for a
     *  smart-DEBT leg silently resolves nothing on debt-only pools.
     *
     *  Null when the pool states 0 for both: 6 of the 40 pools hold nothing, and
     *  "0 of each" would imply a position that isn't there — the share count is
     *  the honest statement. Kept in BigInt to the final scale so a 1e25-share
     *  numerator can't lose precision through a float.
     *
     *  This is composition, NOT price: pro-rata is the protocol's own redemption
     *  mechanic (withdrawPerfect), and no USD is implied anywhere. */
    const legTokens = (poolAddr: string, sharesRaw: bigint, leg: "supply" | "borrow"): LegToken[] | null => {
      const p = dex.get(poolAddr.toLowerCase());
      if (!p) return null;
      const per = leg === "supply" ? p.perSupplyShare : p.perBorrowShare;
      if (per[0] === ZERO && per[1] === ZERO) return null;
      const E18 = BigInt("1000000000000000000");
      return ([p.token0, p.token1] as const).map((tok, i) => {
        const m = meta.get(tok.toLowerCase());
        const decimals = isFluidEthSentinel(tok) ? 18 : (m?.decimals ?? 18);
        return {
          symbol: isFluidEthSentinel(tok) ? "ETH" : m?.named ? m.symbol : null,
          amount: scaleRaw((sharesRaw * per[i]) / E18, decimals),
        };
      });
    };

    /** Leg identity: DEX shares → null symbol at 18dp (plus the pool's pair, so
     *  the row can name what the shares are OF), native ETH → the sentinel's own
     *  answer, everything else → the multicall's. */
    const legMeta = (
      leg: { token0: string; token1: string },
      smart: boolean,
    ): { symbol: string | null; decimals: number; pool: [string, string] | null } => {
      if (smart) {
        const a = nameOf(leg.token0);
        const b = nameOf(leg.token1);
        return { symbol: null, decimals: SHARES_DECIMALS, pool: a && b ? [a, b] : null };
      }
      if (isFluidEthSentinel(leg.token0)) return { symbol: "ETH", decimals: 18, pool: null };
      const m = meta.get(leg.token0.toLowerCase());
      return { symbol: m?.named ? m.symbol : null, decimals: m?.decimals ?? SHARES_DECIMALS, pool: null };
    };

    const vaults: FluidVaultRow[] = all.map((vd) => {
      const vaultType = Number(vd.constantVariables.vaultType);
      const kind = vaultKindOf(vaultType);
      const smartCol = vd.isSmartCol || kind === "smart-col" || kind === "smart";
      const smartDebt = vd.isSmartDebt || kind === "smart-debt" || kind === "smart";

      const supplyMeta = legMeta(vd.constantVariables.supplyToken, smartCol);
      const borrowMeta = legMeta(vd.constantVariables.borrowToken, smartDebt);
      const supplyDecimals = supplyMeta.decimals;
      const borrowDecimals = borrowMeta.decimals;

      const c = vd.configs;
      // A vault with no collateralFactor has never been configured: the factory
      // minted it and governance never set a ladder or an oracle on it.
      const configured = c.collateralFactor > 0;

      const priceScale = fluidOraclePriceScale(supplyDecimals, borrowDecimals);
      const priceOperate = c.oraclePriceOperate > ZERO ? Number(c.oraclePriceOperate) / priceScale : null;
      const priceLiquidate = c.oraclePriceLiquidate > ZERO ? Number(c.oraclePriceLiquidate) / priceScale : null;

      const r = vd.exchangePricesAndRates;

      const totalSupply = scaleRaw(vd.totalSupplyAndBorrow.totalSupplyVault, supplyDecimals);
      const totalBorrow = scaleRaw(vd.totalSupplyAndBorrow.totalBorrowVault, borrowDecimals);
      // Only where every term is a token quantity the price actually relates:
      // a smart vault's legs are DEX shares, so the quotient would be a number
      // without a referent.
      const smartEither = smartCol || smartDebt;
      const colValue = priceLiquidate != null && totalSupply > 0 ? totalSupply * priceLiquidate : null;
      const aggregateRatio = !smartEither && colValue != null && colValue > 0 ? totalBorrow / colValue : null;

      return {
        vault: getAddress(vd.vault).toLowerCase(),
        vaultId: Number(vd.constantVariables.vaultId),
        vaultType,
        kind,
        isSmartCol: smartCol,
        isSmartDebt: smartDebt,
        supplySymbol: supplyMeta.symbol,
        borrowSymbol: borrowMeta.symbol,
        supplyDecimals,
        borrowDecimals,
        supplyPool: supplyMeta.pool,
        borrowPool: borrowMeta.pool,
        supplyLegTokens: smartCol
          ? legTokens(vd.constantVariables.supply, vd.totalSupplyAndBorrow.totalSupplyVault, "supply")
          : null,
        borrowLegTokens: smartDebt
          ? legTokens(vd.constantVariables.borrow, vd.totalSupplyAndBorrow.totalBorrowVault, "borrow")
          : null,

        configured,
        collateralFactor: configured ? Number(c.collateralFactor) / 1e4 : null,
        liquidationThreshold: configured ? Number(c.liquidationThreshold) / 1e4 : null,
        liquidationMaxLimit: configured ? Number(c.liquidationMaxLimit) / 1e4 : null,
        liquidationPenalty: configured ? Number(c.liquidationPenalty) / 1e4 : null,
        withdrawalGap: configured ? Number(c.withdrawalGap) / 1e4 : null,

        oracle: isZeroAddr(c.oracle) ? null : getAddress(c.oracle).toLowerCase(),
        oraclePriceOperate: priceOperate,
        oraclePriceLiquidate: priceLiquidate,

        totalSupply,
        totalBorrow,

        supplyRatePct: smartCol ? null : Number(r.supplyRateVault) / 100,
        borrowRatePct: smartDebt ? null : Number(r.borrowRateVault) / 100,

        aggregateRatio,
      };
    });

    // Roster order: the factory's own minting order. vaultId IS the sequence, so
    // it needs no sort key of ours — but the resolver's array order is its own
    // business, so pin it explicitly rather than inherit it.
    vaults.sort((a, b) => a.vaultId - b.vaultId);

    return {
      blockNumber,
      vaults,
      summary: {
        total: vaults.length,
        configured: vaults.filter((v) => v.configured).length,
        shells: vaults.filter((v) => !v.configured).length,
        tokenPair: vaults.filter((v) => !v.isSmartCol && !v.isSmartDebt).length,
        smart: vaults.filter((v) => v.isSmartCol || v.isSmartDebt).length,
        oracleSilent: vaults.filter((v) => v.configured && v.oraclePriceLiquidate == null).length,
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Fluid vaults chain read failed:", error);
    return empty();
  }
}
