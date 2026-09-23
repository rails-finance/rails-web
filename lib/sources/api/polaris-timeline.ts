// Polaris timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns one CDP's history oldest-first: every CDPUpdated on the
// market's cdpManager (the twelve emitted fields verbatim, plus the previous
// row's `_newColl`/`_newDebt` as lag columns, the market's primary rate IN
// FORCE at the row — its last PrimaryRateSet at or before it, null before the
// first — and on a liquidation the joined Liquidation + LiquidationGasComp
// legs) and every cdp NFT Transfer whose `from` is not the zero address (the
// mint IS the open and the burn coincides with the close, so neither leg is a
// row of its own). `event_key` is unique per row — the React key.
//
// The row also carries the coordinates of that same PrimaryRateSet log (block,
// log index, tx hash, tx sender, timestamp) plus an ordinal — the count of the
// market's PrimaryRateSet rows at or before it — so a rate-step market note's
// receipt can name the actual log a touch's rate was read from, not merely
// restate the number (plan §3; null exactly where `primary_rate` is null).
//
// CLASSIFICATION is the emitted `_operation` (0 open · 1 adjust · 2 close · 3
// liquidate — proven in the scoping doc: the first row per id is always 0, op
// 2 zeroes both sides, op 3 only ever rides a Liquidation tx) or the row's
// event_type for a transfer. Nothing is inferred from a diff.
//
// FLOWS are the holder's own movements: `_collChange` (pETH in/out) and
// `_debtChange` (the stablecoin out/in). Interest, stability-pool gains,
// reward pETH and the PSM's pro-rata adjustments are ledger legs, not flows —
// they ride the context and the detail grid, and the economics sums them by
// leg. A liquidation carries no holder flow (the pool took it); a transfer
// carries none (custody).
//
// SERVER-ONLY — imported from the /api/polaris/* route handlers.

import type { BaseActivityEvent, AssetFlow, PolarisContext, PolarisEventType } from "@/lib/shared/types/event-shape";
import { explorerUrl } from "@/lib/shared/chains";
import { PETH, POLARIS_CHAIN_ID, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";

export interface PolarisTimelineResult {
  market: PolarisMarket;
  cdpId: string;
  events: BaseActivityEvent[];
  /** The CDP's whole history as the backend counts it. */
  totalEvents: number;
}

/** One row as the rails /api/polaris/timeline route projects it (§3 of the
 *  build plan). Numerics are decimal strings in raw 1e18 units. */
export interface PolarisTimelineRow {
  event_key: string;
  event_type: "cdp_updated" | "nft_transfer";
  action: string;
  operation: number | null;
  block_number: string | number;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  block_timestamp: string | number;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  new_coll: string | null;
  new_debt: string | null;
  coll_change: string | null;
  debt_change: string | null;
  mint_redeem_coll_gain: string | null;
  mint_redeem_debt_gain: string | null;
  accrued_interest: string | null;
  stable_gain: string | null;
  stables_minted_to_ensure_zero_debt: string | null;
  bc_token_gain: string | null;
  coll_before: string | null;
  debt_before: string | null;
  primary_rate: string | null;
  // The PrimaryRateSet log `primary_rate` was read from — the backend's
  // per-row as-of join (plan §3). All six null exactly where `primary_rate`
  // is. block/timestamp arrive as strings (pg bigint), log_index/ordinal as
  // numbers (pg int) — coerced with Number() below either way.
  primary_rate_block: string | number | null;
  primary_rate_log_index: number | null;
  primary_rate_tx_hash: string | null;
  primary_rate_tx_from: string | null;
  primary_rate_timestamp: string | number | null;
  primary_rate_ordinal: number | null;
  liquidator: string | null;
  coll_liquidated: string | null;
  debt_liquidated: string | null;
  debt_redistributed: string | null;
  coll_redistributed: string | null;
  coll_surplus: string | null;
  flat_comp: string | null;
  collateral_comp: string | null;
  from_addr: string | null;
  to_addr: string | null;
  // The oracle-at-block lane's join (plan §5): the row's own market's
  // previewPrice() at this block, the three legs behind it, and whether the
  // lane has filled the block at all. Strings/null per §3 of the build plan.
  price_at_block_raw: string | null;
  eth_in_usdp_raw: string | null;
  curve_raw: string | null;
  eth_usd_raw: string | null;
  xau_usd_raw: string | null;
  price_at_block_filled: boolean;
}

const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");

function bigintOf(raw: string | null | undefined): bigint | null {
  if (raw == null || raw === "") return null;
  try {
    return BigInt(String(raw).split(".")[0]);
  } catch {
    return null;
  }
}

/** Exact raw → decimal string at 18dp (trims trailing zeros). */
function fmt18(raw: bigint): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  const whole = (a / E18).toString();
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

const human = (raw: string | null): string | undefined => {
  const v = bigintOf(raw);
  return v == null ? undefined : fmt18(v);
};

/** Same as `human`, as a number (null on a failed/absent leg) — the
 *  oracle-at-block legs, which are point figures rather than exact-precision
 *  ledger amounts. */
const numOrNull = (raw: string | null): number | null => {
  const h = human(raw);
  return h == null ? null : Number(h);
};

const rawVal = (raw: string | null): string | undefined =>
  raw == null || raw === "" ? undefined : String(raw).split(".")[0];

const OPERATION_TYPE: Record<number, PolarisEventType> = { 0: "open", 1: "adjust", 2: "close", 3: "liquidate" };

/** Per-axis verbs for an adjust — the classifier's label is "Adjust", and the
 *  header carries each axis's own verb; the row label names the axes moved so
 *  the filter menu and the markdown table read "Deposit + Borrow" rather than
 *  a bare "Adjust". An adjust that moved neither (an interest touch) keeps the
 *  bare label. */
function adjustLabel(dColl: bigint | null, dDebt: bigint | null): string {
  const parts: string[] = [];
  if (dColl != null && dColl !== ZERO) parts.push(dColl > ZERO ? "Deposit" : "Withdraw");
  if (dDebt != null && dDebt !== ZERO) parts.push(dDebt > ZERO ? "Borrow" : "Repay");
  return parts.length > 0 ? parts.join(" + ") : "Adjust";
}

const LABELS: Record<PolarisEventType, string> = {
  open: "Open CDP",
  adjust: "Adjust",
  close: "Close CDP",
  liquidate: "Liquidation",
  transfer: "Transfer",
};

/**
 * Transform raw rows → { market, cdpId, events, totalEvents }. The replay
 * lives in the rows (each `_newColl`/`_newDebt` is the resulting state, and
 * the lag columns are the previous row's); only classification, flows and
 * presentation live here.
 */
export function buildPolarisTimeline(
  rows: PolarisTimelineRow[],
  market: PolarisMarket,
  cdpId: string,
  totalEvents?: number,
): PolarisTimelineResult {
  const cfg = POLARIS_MARKET_CONFIG[market];
  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const isTransfer = r.event_type === "nft_transfer";
    const op = r.operation != null ? Number(r.operation) : null;
    const kind: PolarisEventType = isTransfer ? "transfer" : (OPERATION_TYPE[op ?? -1] ?? "adjust");

    const gasUsed = r.tx_gas_used != null && r.tx_gas_used !== "" ? Number(r.tx_gas_used) : null;
    const gasPrice = r.tx_gas_price != null && r.tx_gas_price !== "" ? Number(r.tx_gas_price) : null;

    const dColl = bigintOf(r.coll_change);
    const dDebt = bigintOf(r.debt_change);
    const debtRedistributed = bigintOf(r.debt_redistributed);
    const primaryRate = bigintOf(r.primary_rate);

    // The oracle-at-block lane's price for THIS row's own market, at THIS
    // row's own block — absent exactly where the lane hasn't priced it.
    const priceAtBlockHuman = human(r.price_at_block_raw);
    const priceAtBlock =
      priceAtBlockHuman != null
        ? {
            pethInDebt: Number(priceAtBlockHuman),
            raw: rawVal(r.price_at_block_raw) ?? String(r.price_at_block_raw),
            ethInDebt: numOrNull(r.eth_in_usdp_raw),
            curve: numOrNull(r.curve_raw),
            ethUsd: numOrNull(r.eth_usd_raw),
            xauUsd: numOrNull(r.xau_usd_raw),
          }
        : undefined;

    // The PrimaryRateSet log `primaryRate` was read from — present exactly
    // when the six columns are (null exactly where `primary_rate` is null).
    const rateSet =
      r.primary_rate_block != null &&
      r.primary_rate_log_index != null &&
      r.primary_rate_tx_hash != null &&
      r.primary_rate_tx_from != null &&
      r.primary_rate_timestamp != null &&
      r.primary_rate_ordinal != null
        ? {
            block: Number(r.primary_rate_block),
            logIndex: Number(r.primary_rate_log_index),
            txHash: r.primary_rate_tx_hash.startsWith("0x")
              ? r.primary_rate_tx_hash.toLowerCase()
              : `0x${r.primary_rate_tx_hash.toLowerCase()}`,
            txFrom: r.primary_rate_tx_from.toLowerCase(),
            timestamp: Number(r.primary_rate_timestamp),
            ordinal: Number(r.primary_rate_ordinal),
          }
        : undefined;

    const ctx: PolarisContext = {
      eventType: kind,
      market,
      cdpId,
      stableSymbol: cfg.stable.symbol,
      ...(op != null && !isTransfer ? { operation: op } : {}),
      ...(isTransfer
        ? {}
        : {
            newColl: human(r.new_coll),
            newDebt: human(r.new_debt),
            collChange: human(r.coll_change),
            debtChange: human(r.debt_change),
            mintRedeemCollGain: human(r.mint_redeem_coll_gain),
            mintRedeemDebtGain: human(r.mint_redeem_debt_gain),
            accruedInterest: human(r.accrued_interest),
            stableGain: human(r.stable_gain),
            stablesMintedToEnsureZeroDebt: human(r.stables_minted_to_ensure_zero_debt),
            bcTokenGain: human(r.bc_token_gain),
            collBefore: human(r.coll_before) ?? "0",
            debtBefore: human(r.debt_before) ?? "0",
          }),
      ...(primaryRate != null ? { primaryRate: Number(fmt18(primaryRate)) } : {}),
      ...(rateSet ? { rateSet } : {}),
      ...(priceAtBlock ? { priceAtBlock } : {}),
      ...(kind === "liquidate"
        ? {
            ...(r.liquidator ? { liquidator: r.liquidator.toLowerCase() } : {}),
            collLiquidated: human(r.coll_liquidated),
            debtLiquidated: human(r.debt_liquidated),
            debtRedistributed: human(r.debt_redistributed),
            collRedistributed: human(r.coll_redistributed),
            collSurplus: human(r.coll_surplus),
            flatComp: human(r.flat_comp),
            collateralComp: human(r.collateral_comp),
            // Pool-absorbed when nothing was redistributed (scoping doc §1.4).
            ...(debtRedistributed != null ? { spAbsorbed: debtRedistributed === ZERO } : {}),
          }
        : {}),
      ...(isTransfer
        ? {
            ...(r.from_addr ? { fromAddr: r.from_addr.toLowerCase() } : {}),
            ...(r.to_addr ? { toAddr: r.to_addr.toLowerCase() } : {}),
          }
        : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      raw: {
        newColl: rawVal(r.new_coll),
        newDebt: rawVal(r.new_debt),
        collChange: rawVal(r.coll_change),
        debtChange: rawVal(r.debt_change),
        mintRedeemCollGain: rawVal(r.mint_redeem_coll_gain),
        mintRedeemDebtGain: rawVal(r.mint_redeem_debt_gain),
        accruedInterest: rawVal(r.accrued_interest),
        stableGain: rawVal(r.stable_gain),
        stablesMintedToEnsureZeroDebt: rawVal(r.stables_minted_to_ensure_zero_debt),
        bcTokenGain: rawVal(r.bc_token_gain),
        collBefore: rawVal(r.coll_before),
        debtBefore: rawVal(r.debt_before),
        primaryRate: rawVal(r.primary_rate),
        collLiquidated: rawVal(r.coll_liquidated),
        debtLiquidated: rawVal(r.debt_liquidated),
        debtRedistributed: rawVal(r.debt_redistributed),
        collRedistributed: rawVal(r.coll_redistributed),
        collSurplus: rawVal(r.coll_surplus),
        flatComp: rawVal(r.flat_comp),
        collateralComp: rawVal(r.collateral_comp),
        priceAtBlock: priceAtBlock?.raw,
      },
      isOpen: idx === 0,
    };

    // The holder's own movements only — open / adjust / close.
    const flows: AssetFlow[] = [];
    if (kind === "open" || kind === "adjust" || kind === "close") {
      if (dColl != null && dColl !== ZERO) {
        const mag = dColl < ZERO ? -dColl : dColl;
        flows.push({
          token: PETH.address,
          tokenSymbol: PETH.symbol,
          tokenDecimals: 18,
          amount: mag.toString(),
          amountFormatted: Number(fmt18(mag)),
          direction: dColl > ZERO ? "in" : "out",
        });
      }
      if (dDebt != null && dDebt !== ZERO) {
        const mag = dDebt < ZERO ? -dDebt : dDebt;
        flows.push({
          token: cfg.stable.address,
          tokenSymbol: cfg.stable.symbol,
          tokenDecimals: 18,
          amount: mag.toString(),
          amountFormatted: Number(fmt18(mag)),
          // A borrow sends the stablecoin OUT to the holder; a repay brings it in.
          direction: dDebt > ZERO ? "out" : "in",
        });
      }
    }

    return {
      id: r.event_key || `${tx}:${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet: r.tx_from ? r.tx_from.toLowerCase() : "",
      etherscanUrl: explorerUrl(POLARIS_CHAIN_ID, "tx-logs", tx),
      // The transaction's own gas — `tx_gas_used × tx_gas_price ÷ 1e18` ETH.
      // No USD leg: Sepolia ETH has no price, and the explainer's formatter
      // drops the parenthetical below a cent. The card decides WHO paid before
      // showing it — a liquidation's gas is the liquidator's, a transfer's is
      // the sender's — so the figure travels on every row and the clause is
      // withheld at the card.
      ...(gasUsed != null && gasPrice != null
        ? { gas: { gasUsed, gasCostEth: (gasUsed * gasPrice) / 1e18, gasCostUsd: 0 } }
        : {}),
      actionType: kind,
      actionLabel: kind === "adjust" ? adjustLabel(dColl, dDebt) : LABELS[kind],
      flows,
      context: { protocol: "polaris" as const, data: ctx },
    };
  });

  return { market, cdpId, events, totalEvents: totalEvents ?? events.length };
}
