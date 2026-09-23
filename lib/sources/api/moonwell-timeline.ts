// Moonwell timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed mv_moonwell_events rows (migration 098:
// supply-principal + exact-mToken running balances, emitted-accountBorrows debt,
// router-resolved owners); this transform maps each to a BaseActivityEvent +
// MoonwellContext. Moonwell's four markets are a fixed catalog, so there is NO
// per-request ERC20 resolution — symbols/decimals come from the catalog. The
// replay lives server-side in the MV; only presentation lives here.
//
// Per-event historic USD is NOT enriched here — the same deliberate gap as the
// other template protocols; per-event USD is a later layer.
//
// SERVER-ONLY — imported from the /api/moonwell/* route handlers.

import type { BaseActivityEvent, AssetFlow, MoonwellContext, MoonwellEventType } from "@/lib/shared/types/event-shape";
import {
  MOONWELL_MARKET_BY_KEY,
  MOONWELL_ADDRESSES,
  MTOKEN_DECIMALS,
  type MoonwellMarket,
} from "@/lib/moonwell/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/** What differs between the deployments this transform serves. The Ethereum
 *  route passes nothing and gets the fixed catalog, mainnet links and the
 *  mainnet router — byte-identical to before this seam existed. The Base sweep
 *  (lib/sources/chain/moonwell-events.ts) passes its own resolver, chain and
 *  router, because its market keys are mToken addresses and none of the
 *  Ethereum constants describe it. */
export interface MoonwellTimelineDeployment {
  /** Market key → catalog entry; a key it cannot name falls back to a
   *  placeholder so a malformed row still renders as SOMETHING traceable. */
  marketOf?: (key: string) => MoonwellMarket | undefined;
  chainId?: ChainId;
  /** The WETH Router whose emitted minter/redeemer means "routed, owner
   *  resolved from the same-tx transfer leg". */
  router?: string;
}

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";

export interface MoonwellTimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the route attaches it;
   *  absent on a response from before this field existed. */
  cutoffBlock?: number | null;
}

/** One row of mv_moonwell_events, exactly as the rails /api/moonwell/timeline
 *  route projects it. numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  action: string;
  wallet: string;
  caller: string | null;
  market: string;
  asset: string;
  amount: string | null;
  mtokens: string | null;
  account_borrows: string | null;
  collateral_market: string | null;
  seize_tokens: string | null;
  liquidator: string | null;
  supply_before: string;
  supply_after: string;
  mtokens_before: string;
  mtokens_after: string;
  debt_before: string | null;
  debt_after: string | null;
  /** The Comptroller's own state at the row's block (mig 195 on Base; the
   *  Ethereum route gains the same field when its lane ships): raw uints as
   *  strings, null elements where the oracle answered 0 or the read reverted,
   *  the whole object null where the block has no row yet. */
  oracle_at_block?: MvOracleAtBlock | null;
}

export interface MvOracleAtBlock {
  oracle: string;
  incentive: string;
  close_factor: string;
  price_raw: string | null;
  exchange_rate_raw: string | null;
  collateral_price_raw: string | null;
  collateral_exchange_rate_raw: string | null;
}

/** Exact-ish raw → float: a BigInt whole/frac split, so a 1e30-scale oracle
 *  price or a 1e26-scale exchange rate survives without Number overflow. */
function rawToNum(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const div = BigInt(10) ** BigInt(decimals);
  return Number(raw / div) + Number(raw % div) / Number(div);
}

const LABELS: Record<MoonwellEventType, string> = {
  mint: "Supply",
  redeem: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Received",
  transfer_out: "Sent",
};

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for the given decimals (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

function scaledStr(raw: string | null, decimals: number): string | undefined {
  if (raw == null) return undefined;
  return fmtUnits(bigintOf(raw), decimals);
}

// Raw-integer passthrough for ctx.raw (pg NUMERIC(78,0) → bare integer string);
// null → undefined so the key drops out of the JSON.
function rawVal(v: string | null): string | undefined {
  return v == null ? undefined : String(v).split(".")[0];
}

function flowFor(token: string, symbol: string, decimals: number, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag, decimals)),
    direction,
  };
}

/**
 * Transform raw mv_moonwell_events rows → { wallet, events, totalEvents }. The
 * replay lives in the MV; only chain-direct presentation (symbols, signs) here.
 */
export function buildMoonwellTimeline(
  rows: MvRow[],
  walletRaw: string,
  deployment: MoonwellTimelineDeployment = {},
): MoonwellTimelineResult {
  const wallet = walletRaw.toLowerCase();
  const chainId = deployment.chainId ?? MAINNET_CHAIN_ID;
  const router = (deployment.router ?? MOONWELL_ADDRESSES.WETH_ROUTER).toLowerCase();
  const fallbackMarket = (key: string): MoonwellMarket => ({
    key,
    symbol: key.toUpperCase(),
    mSymbol: `m${key.toUpperCase()}`,
    mtoken: "0x0000000000000000000000000000000000000000",
    underlying: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    collateralFactor: 0,
  });
  const marketOf = (key: string): MoonwellMarket =>
    (deployment.marketOf ? deployment.marketOf(key) : MOONWELL_MARKET_BY_KEY[key]) ?? fallbackMarket(key);

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const kind = r.action as MoonwellEventType;
    const m = marketOf(r.market);
    const amt = bigintOf(r.amount);
    const mtk = bigintOf(r.mtokens);

    const base = {
      id: `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet,
      etherscanUrl: explorerUrl(chainId, "tx-logs", tx),
    };

    const isSupplySide = kind === "mint" || kind === "redeem" || kind === "transfer_in" || kind === "transfer_out";
    const caller = r.caller?.toLowerCase();
    const routerProxied = (kind === "mint" || kind === "redeem") && caller === router && wallet !== caller;

    const ctx: MoonwellContext = {
      eventType: kind,
      market: m.key,
      marketSymbol: m.symbol,
      side: isSupplySide ? "supply" : "debt",
      isOpen: idx === 0,
      ...(caller ? { caller } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      ...(routerProxied ? { routerProxied: true } : {}),
      raw: {},
    };

    let flows: AssetFlow[] = [];

    switch (kind) {
      case "mint":
      case "redeem": {
        const signed = kind === "mint" ? amt : -amt;
        const mSigned = kind === "mint" ? mtk : -mtk;
        ctx.assetsDelta = fmtUnits(signed, m.decimals);
        ctx.mTokensDelta = fmtUnits(mSigned, MTOKEN_DECIMALS);
        ctx.supplyBefore = scaledStr(r.supply_before, m.decimals);
        ctx.supplyAfter = scaledStr(r.supply_after, m.decimals);
        ctx.mTokensBefore = scaledStr(r.mtokens_before, MTOKEN_DECIMALS);
        ctx.mTokensAfter = scaledStr(r.mtokens_after, MTOKEN_DECIMALS);
        ctx.raw = {
          amount: rawVal(r.amount),
          mTokens: rawVal(r.mtokens),
          supplyBefore: rawVal(r.supply_before),
          supplyAfter: rawVal(r.supply_after),
          mTokensBefore: rawVal(r.mtokens_before),
          mTokensAfter: rawVal(r.mtokens_after),
        };
        // Underlying moves toward the protocol on a mint, toward the wallet on a redeem.
        flows = amt !== ZERO ? [flowFor(m.underlying, m.symbol, m.decimals, amt, kind === "mint" ? "out" : "in")] : [];
        break;
      }
      case "borrow":
      case "repay": {
        const signed = kind === "borrow" ? amt : -amt;
        ctx.assetsDelta = fmtUnits(signed, m.decimals);
        ctx.accountBorrows = scaledStr(r.account_borrows, m.decimals);
        ctx.debtBefore = scaledStr(r.debt_before, m.decimals);
        ctx.debtAfter = scaledStr(r.debt_after, m.decimals);
        ctx.raw = {
          amount: rawVal(r.amount),
          accountBorrows: rawVal(r.account_borrows),
          debtBefore: rawVal(r.debt_before),
          debtAfter: rawVal(r.debt_after),
        };
        flows =
          amt !== ZERO ? [flowFor(m.underlying, m.symbol, m.decimals, amt, kind === "borrow" ? "in" : "out")] : [];
        break;
      }
      case "liquidation": {
        const collMarket = r.collateral_market ? marketOf(r.collateral_market) : null;
        const seize = bigintOf(r.seize_tokens);
        ctx.assetsDelta = fmtUnits(-amt, m.decimals); // debt repaid by the liquidator
        ctx.collateralMarket = collMarket?.key;
        ctx.collateralSymbol = collMarket?.symbol;
        ctx.seizeTokens = collMarket ? fmtUnits(seize, MTOKEN_DECIMALS) : undefined;
        ctx.liquidator = r.liquidator?.toLowerCase() ?? undefined;
        ctx.raw = { amount: rawVal(r.amount), seizeTokens: rawVal(r.seize_tokens) };
        flows = [
          ...(amt !== ZERO ? [flowFor(m.underlying, m.symbol, m.decimals, amt, "out")] : []),
          ...(collMarket && seize !== ZERO
            ? [flowFor(collMarket.mtoken, collMarket.mSymbol, MTOKEN_DECIMALS, seize, "out")]
            : []),
        ];
        break;
      }
      case "transfer_in":
      case "transfer_out": {
        const signed = kind === "transfer_in" ? mtk : -mtk;
        ctx.mTokensDelta = fmtUnits(signed, MTOKEN_DECIMALS);
        ctx.mTokensBefore = scaledStr(r.mtokens_before, MTOKEN_DECIMALS);
        ctx.mTokensAfter = scaledStr(r.mtokens_after, MTOKEN_DECIMALS);
        ctx.counterparty = caller;
        ctx.raw = {
          mTokens: rawVal(r.mtokens),
          mTokensBefore: rawVal(r.mtokens_before),
          mTokensAfter: rawVal(r.mtokens_after),
        };
        flows =
          mtk !== ZERO
            ? [flowFor(m.mtoken, m.mSymbol, MTOKEN_DECIMALS, mtk, kind === "transfer_in" ? "in" : "out")]
            : [];
        break;
      }
    }

    // The oracle at the block (mig 195). Scaled here, where the decimals are
    // known: getUnderlyingPrice is 1e(36 − underlyingDecimals), the exchange
    // rate 1e(18 + underlyingDecimals − 8) — so seized mTokens (8 dp) ×
    // rate ÷ 1e18 is the underlying in its own raw units. A zero or missing
    // price leaves the field absent: the card renders token-only.
    const ob = r.oracle_at_block;
    if (ob) {
      ctx.oracleAtBlock = ob.oracle;
      ctx.raw = { ...(ctx.raw ?? {}), incentiveRaw: ob.incentive, closeFactorRaw: ob.close_factor };
      try {
        ctx.incentiveAtBlock = rawToNum(BigInt(ob.incentive), 18);
        if (ob.price_raw && ob.price_raw !== "0") {
          ctx.priceAtBlock = { usd: rawToNum(BigInt(ob.price_raw), 36 - m.decimals) };
          ctx.raw.priceRaw = ob.price_raw;
        }
        if (ob.exchange_rate_raw) ctx.raw.exchangeRateRaw = ob.exchange_rate_raw;
        if (kind === "liquidation" && r.collateral_market) {
          const collMarket = marketOf(r.collateral_market);
          if (collMarket && ob.collateral_price_raw && ob.collateral_price_raw !== "0") {
            ctx.collateralPriceAtBlock = { usd: rawToNum(BigInt(ob.collateral_price_raw), 36 - collMarket.decimals) };
            ctx.raw.collateralPriceRaw = ob.collateral_price_raw;
          }
          if (collMarket && ob.collateral_exchange_rate_raw && r.seize_tokens) {
            const seizedRaw =
              (bigintOf(r.seize_tokens) * BigInt(ob.collateral_exchange_rate_raw)) / BigInt(10) ** BigInt(18);
            ctx.seizedUnderlyingAtBlock = fmtUnits(seizedRaw, collMarket.decimals);
            ctx.raw.collateralExchangeRateRaw = ob.collateral_exchange_rate_raw;
          }
        }
      } catch {
        // A malformed integer from the wire prices nothing rather than
        // something wrong; the raw twins already set stay as receipts.
        delete ctx.priceAtBlock;
        delete ctx.collateralPriceAtBlock;
        delete ctx.seizedUnderlyingAtBlock;
      }
    }

    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "moonwell", data: ctx },
    };
  });

  return { wallet, events, totalEvents: events.length };
}
