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
// own settled math read across the liquidation block — exact. Every row's
// col/debt before/after is the vault's settled balance at the row's block
// (server mig 344: the resolver read, interest included) where the index holds
// that read, else the Σ of deltas (impacts included); `balanceBasis` says
// which. Between two chain rows, before(n) − after(n−1) is the interest the
// leg accrued with no event of its own. Smart-vault
// legs (vault_type > 10000) have no ERC20 symbol; they render as DEX shares
// at 18 dp.
//
// SERVER-ONLY — imported from the /api/fluid/* route handlers.

import { fluidOraclePriceScale } from "@/lib/fluid/asset-catalog";
import type { BaseActivityEvent, AssetFlow, FluidContext, FluidEventType } from "@/lib/shared/types/event-shape";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { firstLogOfTx, gasOnFirstRow } from "@/lib/shared/index-gas";

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
  /** The vault's settled balance just before / after this row (server mig
   *  344), base units; null until the index has read the row's block. */
  col_chain_before?: string | null;
  col_chain_after?: string | null;
  debt_chain_before?: string | null;
  debt_chain_after?: string | null;
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

/** The vault's own oracle price at the row's block (mig 114), raw → the
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
export function fluidOraclePriceOf(
  r: Pick<FluidMvRow, "price_raw" | "oracle" | "price_source" | "liquidation_penalty">,
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

/** A gap this small is the vault's rounding between an event's amount and its
 *  raw units, not interest: a few base units, or a trillionth of the balance. */
const ROUNDING_UNITS = BigInt(3);
const ROUNDING_SHARE = BigInt(1_000_000_000_000);

/** before(n) − after(prev), both chain figures; undefined when either is
 *  missing or the gap is rounding. */
function interestGap(before: string | null | undefined, prevAfter: string | null | undefined): bigint | undefined {
  if (before == null || prevAfter == null) return undefined;
  const prevN = bigintOf(prevAfter);
  const gap = bigintOf(before) - prevN;
  const mag = gap < ZERO ? -gap : gap;
  const tolerance = prevN / ROUNDING_SHARE > ROUNDING_UNITS ? prevN / ROUNDING_SHARE : ROUNDING_UNITS;
  return mag <= tolerance ? undefined : gap;
}

/** Transform raw mv_fluid_events rows → { nftId, events, totalEvents }. */
export function buildFluidTimeline(rows: FluidMvRow[], nftId: string): FluidTimelineResult {
  // The previous balance-bearing row (an ownership move states no balance, so
  // the interest across it lands on the next row that does).
  let prev: FluidMvRow | null = null;
  // The transaction's gas on its first row (lib/shared/index-gas.ts).
  const firstLog = firstLogOfTx(rows);
  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash ? (r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`) : "";
    const kind = r.action as FluidEventType;
    const supplySym = r.supply_symbol ?? "DEX shares";
    const borrowSym = r.borrow_symbol ?? "DEX shares";
    const supplyDec = r.supply_decimals ?? SHARES_DECIMALS;
    const borrowDec = r.borrow_decimals ?? SHARES_DECIMALS;
    const colAmt = bigintOf(r.col_amt);
    const debtAmt = bigintOf(r.debt_amt);
    // The row's balances: the chain read where the index holds it.
    const chain = r.col_chain_after != null && r.debt_chain_after != null;
    const colBefore = chain ? (r.col_chain_before ?? null) : r.col_before;
    const colAfter = chain ? (r.col_chain_after ?? null) : r.col_after;
    const debtBefore = chain ? (r.debt_chain_before ?? null) : r.debt_before;
    const debtAfter = chain ? (r.debt_chain_after ?? null) : r.debt_after;
    const bearsBalance = kind !== "mint" && kind !== "transfer";
    const colGap = chain && bearsBalance && prev ? interestGap(colBefore, prev.col_chain_after) : undefined;
    const debtGap = chain && bearsBalance && prev ? interestGap(debtBefore, prev.debt_chain_after) : undefined;
    if (bearsBalance) prev = r;

    const base = {
      id: `${r.event_key}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: r.block_timestamp != null ? Number(r.block_timestamp) : 0,
      wallet: r.owner_at ?? "",
      ...gasOnFirstRow(r, firstLog),
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
      colBefore: scaledStr(colBefore, supplyDec),
      colAfter: scaledStr(colAfter, supplyDec),
      debtBefore: scaledStr(debtBefore, borrowDec),
      debtAfter: scaledStr(debtAfter, borrowDec),
      ...(chain ? { balanceBasis: "chain" as const } : {}),
      ...(colGap != null ? { colInterestSincePrevious: fmtUnits(colGap, supplyDec) } : {}),
      ...(debtGap != null ? { debtInterestSincePrevious: fmtUnits(debtGap, borrowDec) } : {}),
      ...(r.owner_at ? { ownerAt: r.owner_at.toLowerCase() } : {}),
      ...(r.initiator ? { initiator: r.initiator.toLowerCase() } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      raw: {
        colAmt: rawVal(r.col_amt),
        debtAmt: rawVal(r.debt_amt),
        colBefore: rawVal(colBefore),
        colAfter: rawVal(colAfter),
        debtBefore: rawVal(debtBefore),
        debtAfter: rawVal(debtAfter),
        ...(colGap != null ? { colInterestSincePrevious: colGap.toString() } : {}),
        ...(debtGap != null ? { debtInterestSincePrevious: debtGap.toString() } : {}),
      },
    };

    // The vault oracle at the row's block: every T1 event block once the
    // server's filler has reached it (server fill-fluid-event-prices.mjs),
    // liquidation blocks before that.
    if (bearsBalance) {
      const price = fluidOraclePriceOf(r, r.supply_decimals, r.borrow_decimals);
      if (price) ctx.oraclePriceAtBlock = price;
    }

    let flows: AssetFlow[] = [];

    if (kind === "liquidated" || kind === "absorbed") {
      ctx.liqSupplyBefore = scaledStr(r.liq_supply_before, supplyDec);
      ctx.liqSupplyAfter = scaledStr(r.liq_supply_after, supplyDec);
      ctx.liqBorrowBefore = scaledStr(r.liq_borrow_before, borrowDec);
      ctx.liqBorrowAfter = scaledStr(r.liq_borrow_after, borrowDec);
      ctx.liquidator = r.liquidator?.toLowerCase() ?? undefined;
      ctx.liqSource = (r.liq_source as "liquidate" | "absorb" | null) ?? undefined;
      ctx.fullyLiquidated = r.fully_liquidated || undefined;
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
