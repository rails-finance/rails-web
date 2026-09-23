// Fluid timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed mv_fluid_events rows for ONE position
// NFT (migration 101: operate deltas + the liquidation-attribution rows +
// ownership transfers, with the Σ continuity lane); this transform maps each
// to a BaseActivityEvent + FluidContext. Vault identity (pair symbols,
// decimals, vault type) rides on every row from the fluid_vault roster — no
// fixed catalog, no per-request ERC20 resolution.
//
// The `liquidated`/`absorbed` rows are COMPUTED attribution rows (Fluid's
// LogLiquidate carries no position id): their before/after are the vault's
// own settled math read across the liquidation block — exact — while the
// col/debt running lane is the Σ of deltas (impacts included). Smart-vault
// legs (vault_type > 10000) have no ERC20 symbol; they render as DEX shares
// at 18 dp.
//
// SERVER-ONLY — imported from the /api/fluid/* route handlers.

import { fluidOraclePriceScale } from "@/lib/fluid/asset-catalog";
import type { BaseActivityEvent, AssetFlow, FluidContext, FluidEventType } from "@/lib/shared/types/event-shape";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface FluidTimelineResult {
  nftId: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
}

/** One row of mv_fluid_events, exactly as the rails /api/fluid/timeline route
 *  projects it. numeric/bigint columns arrive as strings from pg. */
export interface FluidMvRow {
  event_key: string;
  action: string;
  vault: string;
  vault_id: string;
  vault_type: number;
  supply_symbol: string | null;
  borrow_symbol: string | null;
  supply_decimals: number | null;
  borrow_decimals: number | null;
  nft_id: string;
  owner_at: string | null;
  block_number: string;
  block_timestamp: string | null;
  tx_hash: string | null;
  tx_index: number | null;
  log_index: number;
  tx_from: string | null;
  initiator: string | null;
  to_addr: string | null;
  col_amt: string;
  debt_amt: string;
  col_before: string;
  col_after: string;
  debt_before: string;
  debt_after: string;
  liquidator: string | null;
  liq_source: string | null;
  liq_supply_before: string | null;
  liq_supply_after: string | null;
  liq_borrow_before: string | null;
  liq_borrow_after: string | null;
  fully_liquidated: boolean;
  transfer_from: string | null;
  transfer_to: string | null;
  tx_gas_price: string | null;
  tx_gas_used: string | null;
  oracle: string | null;
  price_raw: string | null;
  price_source: string | null;
  liquidation_penalty: number | null;
}

const LABELS: Record<FluidEventType, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  payback: "Repay",
  deposit_borrow: "Deposit + Borrow",
  withdraw_payback: "Withdraw + Repay",
  deposit_payback: "Deposit + Repay",
  withdraw_borrow: "Withdraw + Borrow",
  liquidated: "Liquidated",
  absorbed: "Absorbed",
  mint: "Position minted",
  transfer: "Ownership transfer",
};

const ZERO = BigInt(0);
/** Smart-vault legs are Fluid DEX pool shares: 18 dp, no ERC20 symbol. */
const SHARES_DECIMALS = 18;

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

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

function rawVal(v: string | null): string | undefined {
  return v == null ? undefined : String(v).split(".")[0];
}

/** The vault's own oracle price at a liquidation block (mig 114), raw → the
 *  debt-per-col figure its engine judged with.
 *
 *  Takes the row's decimals RAW AND NULLABLE rather than the defaulted values
 *  the rest of the transform uses: the 1e(27 + debtDec − colDec) scale is only
 *  correct when both legs' decimals are actually known, and a leg defaulted to
 *  18 would misprice by orders of magnitude rather than fail. That is not
 *  hypothetical — the XAUt/USDT vault carries NULL borrow decimals (its roster
 *  probe was throttled and the NULL latched), and defaulting it would render
 *  gold at 1e12 times its price. Unknown decimals ⇒ no price ⇒ token-only,
 *  which is the same safe state as a block the filler hasn't reached. */
function fluidOraclePriceOf(
  r: FluidMvRow,
  colDecimals: number | null,
  debtDecimals: number | null,
): FluidContext["oraclePriceAtBlock"] | undefined {
  if (r.price_raw == null || r.oracle == null) return undefined;
  if (colDecimals == null || debtDecimals == null) return undefined;
  const source = r.price_source;
  if (source !== "fluid-oracle-liquidate" && source !== "fluid-oracle") return undefined;
  const n = Number(r.price_raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const debtPerCol = n / fluidOraclePriceScale(colDecimals, debtDecimals);
  if (!Number.isFinite(debtPerCol) || debtPerCol <= 0) return undefined;
  return {
    debtPerCol,
    source,
    oracle: r.oracle.toLowerCase(),
    // 1e4-scaled on the row (300 = 3.00%); rendered as a percent.
    ...(r.liquidation_penalty != null && r.liquidation_penalty > 0
      ? { liquidationPenaltyPct: (r.liquidation_penalty / 1e4) * 100 }
      : {}),
  };
}

function flowFor(symbol: string, decimals: number, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token: "",
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag, decimals)),
    direction,
  };
}

/** Transform raw mv_fluid_events rows → { nftId, events, totalEvents }. */
export function buildFluidTimeline(rows: FluidMvRow[], nftId: string): FluidTimelineResult {
  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash ? (r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`) : "";
    const kind = r.action as FluidEventType;
    const supplySym = r.supply_symbol ?? "DEX shares";
    const borrowSym = r.borrow_symbol ?? "DEX shares";
    const supplyDec = r.supply_decimals ?? SHARES_DECIMALS;
    const borrowDec = r.borrow_decimals ?? SHARES_DECIMALS;
    const colAmt = bigintOf(r.col_amt);
    const debtAmt = bigintOf(r.debt_amt);

    const base = {
      id: `${r.event_key}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: r.block_timestamp != null ? Number(r.block_timestamp) : 0,
      wallet: r.owner_at ?? "",
      etherscanUrl: tx ? explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx) : "",
    };

    const ctx: FluidContext = {
      eventType: kind,
      vault: r.vault,
      vaultId: r.vault_id,
      vaultType: r.vault_type,
      supplySymbol: r.supply_symbol,
      borrowSymbol: r.borrow_symbol,
      nftId: r.nft_id,
      isOpen: idx === 0,
      colBefore: scaledStr(r.col_before, supplyDec),
      colAfter: scaledStr(r.col_after, supplyDec),
      debtBefore: scaledStr(r.debt_before, borrowDec),
      debtAfter: scaledStr(r.debt_after, borrowDec),
      ...(r.owner_at ? { ownerAt: r.owner_at.toLowerCase() } : {}),
      ...(r.initiator ? { initiator: r.initiator.toLowerCase() } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      raw: {
        colAmt: rawVal(r.col_amt),
        debtAmt: rawVal(r.debt_amt),
        colBefore: rawVal(r.col_before),
        colAfter: rawVal(r.col_after),
        debtBefore: rawVal(r.debt_before),
        debtAfter: rawVal(r.debt_after),
      },
    };

    let flows: AssetFlow[] = [];

    if (kind === "liquidated" || kind === "absorbed") {
      ctx.liqSupplyBefore = scaledStr(r.liq_supply_before, supplyDec);
      ctx.liqSupplyAfter = scaledStr(r.liq_supply_after, supplyDec);
      ctx.liqBorrowBefore = scaledStr(r.liq_borrow_before, borrowDec);
      ctx.liqBorrowAfter = scaledStr(r.liq_borrow_after, borrowDec);
      ctx.liquidator = r.liquidator?.toLowerCase() ?? undefined;
      ctx.liqSource = (r.liq_source as "liquidate" | "absorb" | null) ?? undefined;
      ctx.fullyLiquidated = r.fully_liquidated || undefined;
      ctx.oraclePriceAtBlock = fluidOraclePriceOf(r, r.supply_decimals, r.borrow_decimals);
      ctx.colDelta = fmtUnits(colAmt, supplyDec);
      ctx.debtDelta = fmtUnits(debtAmt, borrowDec);
      ctx.raw = {
        ...ctx.raw,
        liqSupplyBefore: rawVal(r.liq_supply_before),
        liqSupplyAfter: rawVal(r.liq_supply_after),
        liqBorrowBefore: rawVal(r.liq_borrow_before),
        liqBorrowAfter: rawVal(r.liq_borrow_after),
      };
      flows = [
        ...(colAmt !== ZERO ? [flowFor(supplySym, supplyDec, colAmt, "out")] : []),
        ...(debtAmt !== ZERO ? [flowFor(borrowSym, borrowDec, debtAmt, "out")] : []),
      ];
    } else if (kind === "mint" || kind === "transfer") {
      ctx.transferFrom = r.transfer_from?.toLowerCase() ?? undefined;
      ctx.transferTo = r.transfer_to?.toLowerCase() ?? undefined;
    } else {
      // operate composites: either or both legs, signed
      ctx.colDelta = fmtUnits(colAmt, supplyDec);
      ctx.debtDelta = fmtUnits(debtAmt, borrowDec);
      flows = [
        // collateral leg: deposit = wallet → protocol ("out"), withdraw = "in"
        ...(colAmt !== ZERO ? [flowFor(supplySym, supplyDec, colAmt, colAmt > ZERO ? "out" : "in")] : []),
        // debt leg: borrow = protocol → wallet ("in"), payback = "out"
        ...(debtAmt !== ZERO ? [flowFor(borrowSym, borrowDec, debtAmt, debtAmt > ZERO ? "in" : "out")] : []),
      ];
    }

    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "fluid", data: ctx },
    };
  });

  return { nftId, events, totalEvents: events.length };
}
