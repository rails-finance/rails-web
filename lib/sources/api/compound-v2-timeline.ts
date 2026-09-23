// Compound V2 timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed mv_compound_v2_events rows (migration
// 119: supply-principal + exact-cToken running balances, emitted-accountBorrows
// debt); this transform maps each to a BaseActivityEvent + CompoundV2Context.
// The twenty markets are a fixed catalog, so there is NO per-request ERC20
// resolution — symbols/decimals come from the catalog (there is no `asset`
// column: the market key IS the resolved identity). The replay lives
// server-side in the MV; only presentation lives here.
//
// Two shapes Moonwell never had, both from mig 119:
//   • ONE liquidation = ONE row. The MV merges the repay leg the liquidation
//     itself emitted into the liquidation row, which therefore carries the
//     debt before→after states (the close-factor halving reads like a repay).
//     There is NO separate repay row to pair it with.
//   • The seizure legs arrive NAMED — seize_out / seize_in / seize_burn —
//     and render as collateral being TAKEN (or, for the liquidator, received),
//     never as transfers: "sent X to 0x…" about seized collateral would state
//     an act the borrower did not perform. seize_burn is the protocol's own
//     cut (protocolSeizeShare, 2.8%), burned — no wallet receives it.
//     Tolerated absences: pre-2021 liquidations have no seize_burn leg
//     (protocolSeizeShare didn't exist), and a liquidation row can arrive
//     with no sibling seize rows at all when the collateral market isn't in
//     the index.
//
// Per-event historic USD is NOT enriched here — the same deliberate gap as the
// other template protocols; per-event USD is a later layer.
//
// SERVER-ONLY — imported from the /api/compound-v2/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  CompoundV2Context,
  CompoundV2EventType,
} from "@/lib/shared/types/event-shape";
import { COMPOUND_V2_MARKET_BY_KEY, CTOKEN_DECIMALS, type CompoundV2Market } from "@/lib/compound-v2/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface CompoundV2TimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  /** The wallet's WHOLE history as the backend counts it — not the page. */
  totalEvents: number;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the answer whenever
   *  `recent` was not asked for, and also when the wallet holds fewer events
   *  than the window. */
  cutoffBlock?: number | null;
}

/** One row of mv_compound_v2_events, exactly as the rails
 *  /api/compound-v2/timeline route projects it. numeric/bigint columns arrive
 *  as strings from pg. */
export interface CompoundV2MvRow {
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
  amount: string | null;
  ctokens: string | null;
  account_borrows: string | null;
  collateral_market: string | null;
  seize_tokens: string | null;
  liquidator: string | null;
  /** Unique per row — the React render key. */
  event_key: string;
  supply_before: string;
  supply_after: string;
  ctokens_before: string;
  ctokens_after: string;
  debt_before: string | null;
  debt_after: string | null;
  /** Liquidation forensics — oracle-at-block prices for BOTH legs (mig 151).
   *  {debt,collateral}_price_native is the market's getUnderlyingPrice at the
   *  event block, ETH-denominated before block 10,678,764 and USD after;
   *  collateral_exchange_rate values the seized cTokens; price_numeraire says
   *  which unit both legs are in; incentive (1e18) is the premium's self-audit
   *  reference. Null until the price walk reaches the block — the card then
   *  renders token-only, which is a safe partial-fill state. */
  debt_price_native: string | null;
  collateral_price_native: string | null;
  collateral_exchange_rate: string | null;
  price_numeraire: string | null;
  incentive: string | null;
}

const LABELS: Record<CompoundV2EventType, string> = {
  mint: "Supply",
  redeem: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Received",
  transfer_out: "Sent",
  seize_out: "Collateral seized",
  seize_in: "Seized collateral received",
  seize_burn: "Protocol seize share",
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
 * Transform raw mv_compound_v2_events rows → { wallet, events, totalEvents }.
 * The replay lives in the MV; only chain-direct presentation (symbols, signs)
 * here. `totalEvents` defaults to rows.length; the proxy overrides it with the
 * backend's whole-history count when paging.
 */
export function buildCompoundV2Timeline(
  rows: CompoundV2MvRow[],
  walletRaw: string,
  totalEvents?: number,
): CompoundV2TimelineResult {
  const wallet = walletRaw.toLowerCase();
  const fallbackMarket = (key: string): CompoundV2Market => ({
    key,
    symbol: key.toUpperCase(),
    cSymbol: `c${key.toUpperCase()}`,
    ctoken: "0x0000000000000000000000000000000000000000",
    underlying: "0x0000000000000000000000000000000000000000",
    decimals: 18,
  });
  const marketOf = (key: string): CompoundV2Market => COMPOUND_V2_MARKET_BY_KEY[key] ?? fallbackMarket(key);

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const kind = r.action as CompoundV2EventType;
    const m = marketOf(r.market);
    const amt = bigintOf(r.amount);
    const ctk = bigintOf(r.ctokens);

    const base = {
      id: r.event_key || `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
    };

    const isSupplySide =
      kind === "mint" ||
      kind === "redeem" ||
      kind === "transfer_in" ||
      kind === "transfer_out" ||
      kind === "seize_out" ||
      kind === "seize_in" ||
      kind === "seize_burn";
    const caller = r.caller?.toLowerCase();

    const ctx: CompoundV2Context = {
      eventType: kind,
      market: m.key,
      marketSymbol: m.symbol,
      side: isSupplySide ? "supply" : "debt",
      isOpen: idx === 0,
      ...(caller ? { caller } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      raw: {},
    };

    let flows: AssetFlow[] = [];
    const underlyingToken = m.underlying ?? m.ctoken; // cETH: no token contract — key flows on the market itself.

    switch (kind) {
      case "mint":
      case "redeem": {
        const signed = kind === "mint" ? amt : -amt;
        const cSigned = kind === "mint" ? ctk : -ctk;
        ctx.assetsDelta = fmtUnits(signed, m.decimals);
        ctx.cTokensDelta = fmtUnits(cSigned, CTOKEN_DECIMALS);
        ctx.supplyBefore = scaledStr(r.supply_before, m.decimals);
        ctx.supplyAfter = scaledStr(r.supply_after, m.decimals);
        ctx.cTokensBefore = scaledStr(r.ctokens_before, CTOKEN_DECIMALS);
        ctx.cTokensAfter = scaledStr(r.ctokens_after, CTOKEN_DECIMALS);
        ctx.raw = {
          amount: rawVal(r.amount),
          cTokens: rawVal(r.ctokens),
          supplyBefore: rawVal(r.supply_before),
          supplyAfter: rawVal(r.supply_after),
          cTokensBefore: rawVal(r.ctokens_before),
          cTokensAfter: rawVal(r.ctokens_after),
        };
        // Underlying moves toward the protocol on a mint, toward the wallet on a redeem.
        flows =
          amt !== ZERO ? [flowFor(underlyingToken, m.symbol, m.decimals, amt, kind === "mint" ? "out" : "in")] : [];
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
          amt !== ZERO ? [flowFor(underlyingToken, m.symbol, m.decimals, amt, kind === "borrow" ? "in" : "out")] : [];
        break;
      }
      case "liquidation": {
        // ONE row per liquidation: the MV merged the repay leg the liquidation
        // emitted, so the debt states ride HERE (the close-factor halving
        // reads before→after like a repay). The collateral movement lives on
        // the sibling seize_* rows — which can be absent (see header).
        const collMarket = r.collateral_market ? marketOf(r.collateral_market) : null;
        const seize = bigintOf(r.seize_tokens);
        ctx.assetsDelta = fmtUnits(-amt, m.decimals); // debt repaid by the liquidator
        ctx.accountBorrows = scaledStr(r.account_borrows, m.decimals);
        ctx.debtBefore = scaledStr(r.debt_before, m.decimals);
        ctx.debtAfter = scaledStr(r.debt_after, m.decimals);
        ctx.collateralMarket = collMarket?.key;
        ctx.collateralSymbol = collMarket?.symbol;
        ctx.seizeTokens = seize !== ZERO ? fmtUnits(seize, CTOKEN_DECIMALS) : undefined;
        ctx.liquidator = r.liquidator?.toLowerCase() ?? undefined;
        // Oracle-at-block forensics inputs (mig 151) — raw as the oracle read
        // them, valued in the detail card. Absent until the price walk lands.
        ctx.debtPriceNative = r.debt_price_native ?? undefined;
        ctx.collateralPriceNative = r.collateral_price_native ?? undefined;
        ctx.collateralExchangeRate = r.collateral_exchange_rate ?? undefined;
        ctx.priceNumeraire = r.price_numeraire === "ETH" || r.price_numeraire === "USD" ? r.price_numeraire : undefined;
        ctx.incentive = r.incentive ?? undefined;
        ctx.raw = {
          amount: rawVal(r.amount),
          seizeTokens: rawVal(r.seize_tokens),
          accountBorrows: rawVal(r.account_borrows),
          debtBefore: rawVal(r.debt_before),
          debtAfter: rawVal(r.debt_after),
        };
        flows = [
          ...(amt !== ZERO ? [flowFor(underlyingToken, m.symbol, m.decimals, amt, "out")] : []),
          ...(collMarket && seize !== ZERO
            ? [flowFor(collMarket.ctoken, collMarket.cSymbol, CTOKEN_DECIMALS, seize, "out")]
            : []),
        ];
        break;
      }
      case "transfer_in":
      case "transfer_out": {
        const signed = kind === "transfer_in" ? ctk : -ctk;
        ctx.cTokensDelta = fmtUnits(signed, CTOKEN_DECIMALS);
        ctx.cTokensBefore = scaledStr(r.ctokens_before, CTOKEN_DECIMALS);
        ctx.cTokensAfter = scaledStr(r.ctokens_after, CTOKEN_DECIMALS);
        ctx.counterparty = caller;
        ctx.raw = {
          cTokens: rawVal(r.ctokens),
          cTokensBefore: rawVal(r.ctokens_before),
          cTokensAfter: rawVal(r.ctokens_after),
        };
        flows =
          ctk !== ZERO
            ? [flowFor(m.ctoken, m.cSymbol, CTOKEN_DECIMALS, ctk, kind === "transfer_in" ? "in" : "out")]
            : [];
        break;
      }
      case "seize_out":
      case "seize_in":
      case "seize_burn": {
        // A seizure's own legs, named for what they are. seize_out: this
        // wallet's collateral taken by the liquidator (caller). seize_in: the
        // liquidator's receipt (caller = the borrower it came from).
        // seize_burn: the protocol's cut — burned, no counterparty exists.
        const signed = kind === "seize_in" ? ctk : -ctk;
        ctx.cTokensDelta = fmtUnits(signed, CTOKEN_DECIMALS);
        ctx.cTokensBefore = scaledStr(r.ctokens_before, CTOKEN_DECIMALS);
        ctx.cTokensAfter = scaledStr(r.ctokens_after, CTOKEN_DECIMALS);
        ctx.liquidator = r.liquidator?.toLowerCase() ?? undefined;
        if (kind !== "seize_burn") ctx.counterparty = caller;
        ctx.raw = {
          cTokens: rawVal(r.ctokens),
          cTokensBefore: rawVal(r.ctokens_before),
          cTokensAfter: rawVal(r.ctokens_after),
        };
        flows =
          ctk !== ZERO ? [flowFor(m.ctoken, m.cSymbol, CTOKEN_DECIMALS, ctk, kind === "seize_in" ? "in" : "out")] : [];
        break;
      }
    }

    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "compound-v2", data: ctx },
    };
  });

  return { wallet, events, totalEvents: totalEvents ?? events.length };
}
