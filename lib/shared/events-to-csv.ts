// ============================================================================
// Activity-timeline → CSV serializer
// ============================================================================
//
// Turns a BaseActivityEvent[] (the same array the detail pages already render)
// into an RFC-4180 CSV string. Columns are a shared core (date / tx / action /
// flows / gas) plus a protocol-specific block appended only when events of that
// protocol are present, so a single-rail export (the only kind we wire up today)
// stays narrow and a hypothetical mixed export still round-trips every field.
//
// Aave V4 numeric fields ship over the wire as strings to preserve precision —
// we pass them through verbatim rather than parseFloat-ing at the boundary
// (see lib/shared/types/event-shape.ts).

import type {
  AaveV3Context,
  AssetFlow,
  BaseActivityEvent,
  CompoundContext,
  CompoundV2Context,
  MapleContext,
  SparkContext,
} from "./types/event-shape";
import {
  isAaveV3Event,
  isAaveV4Event,
  isCompoundEvent,
  isCompoundV2Event,
  isLiquityEvent,
  isMapleEvent,
  isSparkEvent,
} from "./types/event-shape";
import type { QueuedExportProtocol } from "./queued-export";
import { compoundV2LiquidationValues } from "@/lib/compound-v2/liquidation-values";

type Column = {
  header: string;
  get: (e: BaseActivityEvent) => string | number | undefined | null;
};

/** RFC-4180 field escaping: wrap in quotes and double any embedded quote when
 *  the value contains a comma, quote, or newline. */
function escapeCsv(value: string | number | undefined | null): string {
  if (value == null) return "";
  const s = typeof value === "number" ? String(value) : value;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toISOString();
}

/** Flatten an event's token movements into one cell. Leading the entry with the
 *  symbol (a letter) rather than the +/- sign keeps spreadsheets from parsing
 *  the cell as a formula. */
function summarizeFlows(flows: AssetFlow[] | undefined): string {
  if (!flows || flows.length === 0) return "";
  return flows
    .map((f) => {
      const sign = f.direction === "in" ? "+" : "-";
      const usd = f.valueUsd != null ? ` ($${f.valueUsd.toFixed(2)})` : "";
      return `${f.tokenSymbol} ${sign}${f.amountFormatted}${usd}`;
    })
    .join("; ");
}

const CORE_COLUMNS: Column[] = [
  { header: "Date (UTC)", get: (e) => isoDate(e.timestamp) },
  { header: "Block", get: (e) => e.blockNumber },
  { header: "Action", get: (e) => e.actionLabel },
  { header: "Wallet", get: (e) => e.wallet },
  { header: "Token Flows", get: (e) => summarizeFlows(e.flows) },
  { header: "Gas (ETH)", get: (e) => e.gas?.gasCostEth ?? "" },
  { header: "Gas (USD)", get: (e) => e.gas?.gasCostUsd ?? "" },
  { header: "Tx Hash", get: (e) => e.txHash },
  { header: "Etherscan", get: (e) => e.etherscanUrl },
];

const LIQUITY_COLUMNS: Column[] = [
  { header: "Collateral", get: (e) => (isLiquityEvent(e) ? e.context.data.collateralType : "") },
  { header: "Trove ID", get: (e) => (isLiquityEvent(e) ? e.context.data.troveId : "") },
  { header: "Operation", get: (e) => (isLiquityEvent(e) ? e.context.data.operation : "") },
  { header: "Coll Price (USD)", get: (e) => (isLiquityEvent(e) ? e.context.data.collateralPrice : "") },
  { header: "Debt Before", get: (e) => (isLiquityEvent(e) ? e.context.data.stateBefore.debt : "") },
  { header: "Debt After", get: (e) => (isLiquityEvent(e) ? e.context.data.stateAfter.debt : "") },
  { header: "Coll Before", get: (e) => (isLiquityEvent(e) ? e.context.data.stateBefore.coll : "") },
  { header: "Coll After", get: (e) => (isLiquityEvent(e) ? e.context.data.stateAfter.coll : "") },
  {
    header: "Interest Rate Before",
    get: (e) => (isLiquityEvent(e) ? e.context.data.stateBefore.annualInterestRate : ""),
  },
  {
    header: "Interest Rate After",
    get: (e) => (isLiquityEvent(e) ? e.context.data.stateAfter.annualInterestRate : ""),
  },
  { header: "Coll Ratio After", get: (e) => (isLiquityEvent(e) ? e.context.data.stateAfter.collateralRatio : "") },
];

const AAVE_COLUMNS: Column[] = [
  { header: "Spoke", get: (e) => (isAaveV4Event(e) ? (e.context.data.spokeName ?? "Main") : "") },
  { header: "Event Type", get: (e) => (isAaveV4Event(e) ? e.context.data.eventType : "") },
  { header: "Reserve", get: (e) => (isAaveV4Event(e) ? (e.context.data.reserveSymbol ?? "") : "") },
  { header: "Amount", get: (e) => (isAaveV4Event(e) ? (e.context.data.amount ?? "") : "") },
  { header: "Price (USD)", get: (e) => (isAaveV4Event(e) ? (e.context.data.price?.usd ?? "") : "") },
  { header: "Supply Before", get: (e) => (isAaveV4Event(e) ? (e.context.data.supplyBefore ?? "") : "") },
  { header: "Supply After", get: (e) => (isAaveV4Event(e) ? (e.context.data.supplyAfter ?? "") : "") },
  { header: "Debt Before", get: (e) => (isAaveV4Event(e) ? (e.context.data.debtBefore ?? "") : "") },
  { header: "Debt After", get: (e) => (isAaveV4Event(e) ? (e.context.data.debtAfter ?? "") : "") },
  { header: "Supply APR", get: (e) => (isAaveV4Event(e) ? (e.context.data.supplyAPR ?? "") : "") },
  { header: "Borrow APR", get: (e) => (isAaveV4Event(e) ? (e.context.data.borrowAPR ?? "") : "") },
  // Liquidation-only fields — empty on every other Aave row.
  { header: "Liq Collateral", get: (e) => (isAaveV4Event(e) ? (e.context.data.collateralSymbol ?? "") : "") },
  { header: "Liq Debt Covered", get: (e) => (isAaveV4Event(e) ? (e.context.data.debtToCover ?? "") : "") },
  {
    header: "Liq Collateral Seized",
    get: (e) => (isAaveV4Event(e) ? (e.context.data.liquidatedCollateralAmount ?? "") : ""),
  },
];

// ── The families with a queued export (rails-ops decision 0029) ──────────────
//
// A family's columns are fixed up front, never chosen from the events at hand:
// the queued file is written a batch at a time by the download proxy
// (lib/sources/api/queued-export-format.ts), and the small file built here in
// the browser must be the same bytes for the same rows. Each value is one the
// served row carries; a cell the row has no value for is empty, never 0. There
// are no gas columns: none of these rows carries a gas cost in ETH and USD.

/** The CSV of one of these families cannot be written: a token the rows name
 *  was not read on chain, so an amount would be scaled by a stand-in. */
export class TokenMetaUnresolvedError extends Error {
  constructor() {
    super("A token's symbol and decimals could not be read, so the file was not written.");
    this.name = "TokenMetaUnresolvedError";
  }
}

export type CsvFamily = QueuedExportProtocol;

/** amount × price, to the cent; empty when either is missing. */
function usdOf(amount: string | number | undefined | null, price: number | undefined | null): string {
  if (amount == null || amount === "" || price == null) return "";
  const v = Math.abs(Number(amount)) * price;
  return Number.isFinite(v) ? v.toFixed(2) : "";
}

const unsigned = (v: string | undefined): string | undefined => (v == null ? undefined : v.replace(/^-/, ""));

/** A column that reads one family's context, empty on any other event. */
function col<D>(
  guard: (e: BaseActivityEvent) => boolean,
  header: string,
  get: (d: D, e: BaseActivityEvent) => string | number | undefined | null,
): Column {
  return { header, get: (e) => (guard(e) ? get(e.context!.data as D, e) : "") };
}

/** Aave V3's liquidation row carries no flows (the page reads the two legs from
 *  its context), so its Token Flows cell is written from them here: the
 *  collateral seized and the debt covered, both leaving the position. */
function aaveV3Flows(e: BaseActivityEvent): string {
  if (!isAaveV3Event(e) || e.context.data.eventType !== "liquidation") return summarizeFlows(e.flows);
  const d = e.context.data;
  const legs: string[] = [];
  if (d.collateralSymbol && d.liquidatedCollateralAmount)
    legs.push(`${d.collateralSymbol} -${d.liquidatedCollateralAmount}`);
  if (d.reserveSymbol && d.debtToCover) legs.push(`${d.reserveSymbol} -${d.debtToCover}`);
  return legs.join("; ");
}

const HEAD: Column[] = CORE_COLUMNS.filter((c) => ["Date (UTC)", "Block", "Action", "Wallet"].includes(c.header));
const TAIL: Column[] = CORE_COLUMNS.filter((c) => ["Tx Hash", "Etherscan"].includes(c.header));
const FLOWS: Column = { header: "Token Flows", get: (e) => summarizeFlows(e.flows) };

const AAVE_V3_FAMILY: Column[] = [
  { header: "Token Flows", get: aaveV3Flows },
  col<AaveV3Context>(isAaveV3Event, "Reserve", (d) => d.reserveSymbol),
  col<AaveV3Context>(isAaveV3Event, "Amount", (d) => d.amount),
  col<AaveV3Context>(isAaveV3Event, "Price (USD)", (d) => d.price?.usd),
  col<AaveV3Context>(isAaveV3Event, "Value (USD)", (d) => usdOf(d.amount, d.price?.usd)),
  col<AaveV3Context>(isAaveV3Event, "Supply Before", (d) => d.supplyBefore),
  col<AaveV3Context>(isAaveV3Event, "Supply After", (d) => d.supplyAfter),
  col<AaveV3Context>(isAaveV3Event, "Debt Before", (d) => d.debtBefore),
  col<AaveV3Context>(isAaveV3Event, "Debt After", (d) => d.debtAfter),
  col<AaveV3Context>(isAaveV3Event, "Liq Collateral", (d) => d.collateralSymbol),
  col<AaveV3Context>(isAaveV3Event, "Liq Collateral Seized", (d) => d.liquidatedCollateralAmount),
  col<AaveV3Context>(isAaveV3Event, "Liq Collateral Value (USD)", (d) =>
    usdOf(d.liquidatedCollateralAmount, d.collateralPrice?.usd),
  ),
  col<AaveV3Context>(isAaveV3Event, "Liq Debt Covered", (d) => d.debtToCover),
  col<AaveV3Context>(isAaveV3Event, "Liq Debt Value (USD)", (d) => usdOf(d.debtToCover, d.debtPrice?.usd)),
];

const SPARK_FAMILY: Column[] = [
  FLOWS,
  col<SparkContext>(isSparkEvent, "Reserve", (d) => d.reserveSymbol),
  col<SparkContext>(isSparkEvent, "Amount", (d) => (d.eventType === "liquidation" ? "" : unsigned(d.assetsDelta))),
  col<SparkContext>(isSparkEvent, "Price (USD)", (d) => d.price?.usd),
  col<SparkContext>(isSparkEvent, "Value (USD)", (d) =>
    d.eventType === "liquidation" ? "" : usdOf(d.assetsDelta, d.price?.usd),
  ),
  col<SparkContext>(isSparkEvent, "Supply Before", (d) => d.supplyBefore),
  col<SparkContext>(isSparkEvent, "Supply After", (d) => d.supplyAfter),
  col<SparkContext>(isSparkEvent, "Debt Before", (d) => d.debtBefore),
  col<SparkContext>(isSparkEvent, "Debt After", (d) => d.debtAfter),
  col<SparkContext>(isSparkEvent, "Liq Collateral", (d) => d.collateralSymbol),
  col<SparkContext>(isSparkEvent, "Liq Collateral Seized", (d) => d.liquidatedCollateralAmount),
  col<SparkContext>(isSparkEvent, "Liq Collateral Value (USD)", (d) =>
    usdOf(d.liquidatedCollateralAmount, d.collateralPrice?.usd),
  ),
  col<SparkContext>(isSparkEvent, "Liq Debt Covered", (d) => d.debtToCover),
  col<SparkContext>(isSparkEvent, "Liq Debt Value (USD)", (d) => usdOf(d.debtToCover, d.debtPrice?.usd)),
];

// Maple's rows carry no price, so its file has no USD column.
const MAPLE_FAMILY: Column[] = [
  FLOWS,
  col<MapleContext>(isMapleEvent, "Pool", (d) => d.poolSymbol),
  col<MapleContext>(isMapleEvent, "Asset", (d) => d.assetSymbol),
  col<MapleContext>(isMapleEvent, "Assets", (d) => d.assetsDelta),
  col<MapleContext>(isMapleEvent, "Shares", (d) => d.sharesDelta),
  col<MapleContext>(isMapleEvent, "Shares Before", (d) => d.sharesBefore),
  col<MapleContext>(isMapleEvent, "Shares After", (d) => d.sharesAfter),
  col<MapleContext>(isMapleEvent, "Escrowed Shares Before", (d) => d.escrowBefore),
  col<MapleContext>(isMapleEvent, "Escrowed Shares After", (d) => d.escrowAfter),
  col<MapleContext>(isMapleEvent, "Principal Before", (d) => d.principalBefore),
  col<MapleContext>(isMapleEvent, "Principal After", (d) => d.principalAfter),
];

// Comet's rows carry a USD figure on the absorb legs only (the event's own
// usdValue); the balances they carry are the ones after the event.
const COMPOUND_V3_FAMILY: Column[] = [
  FLOWS,
  col<CompoundContext>(isCompoundEvent, "Market", (d) => d.marketLabel),
  col<CompoundContext>(isCompoundEvent, "Asset", (d) => d.assetSymbol),
  col<CompoundContext>(isCompoundEvent, "Amount", (d) => d.assetsDelta),
  col<CompoundContext>(isCompoundEvent, "Value (USD)", (d) => d.usdValue),
  col<CompoundContext>(isCompoundEvent, "Base Balance After", (d) => d.baseAfter),
  col<CompoundContext>(isCompoundEvent, "Collateral After", (d) => d.collateralAfter),
];

// Compound V2's rows carry prices on liquidations only, in USD after the
// oracle migration (block 10,678,764) and in ETH before it; the USD columns
// are filled only where the numeraire is USD.
const v2UsdLiq = (e: BaseActivityEvent, leg: "seizedValue" | "clearedValue"): string => {
  if (!isCompoundV2Event(e) || e.context.data.eventType !== "liquidation") return "";
  const v = compoundV2LiquidationValues(e.context.data);
  return v && v.numeraire === "USD" ? v[leg].toFixed(2) : "";
};
const COMPOUND_V2_FAMILY: Column[] = [
  FLOWS,
  col<CompoundV2Context>(isCompoundV2Event, "Market", (d) => d.marketSymbol),
  col<CompoundV2Context>(isCompoundV2Event, "Amount", (d) => d.assetsDelta),
  col<CompoundV2Context>(isCompoundV2Event, "cTokens", (d) => d.cTokensDelta),
  col<CompoundV2Context>(isCompoundV2Event, "Supply Before", (d) => d.supplyBefore),
  col<CompoundV2Context>(isCompoundV2Event, "Supply After", (d) => d.supplyAfter),
  col<CompoundV2Context>(isCompoundV2Event, "cTokens Before", (d) => d.cTokensBefore),
  col<CompoundV2Context>(isCompoundV2Event, "cTokens After", (d) => d.cTokensAfter),
  col<CompoundV2Context>(isCompoundV2Event, "Debt Before", (d) => d.debtBefore),
  col<CompoundV2Context>(isCompoundV2Event, "Debt After", (d) => d.debtAfter),
  col<CompoundV2Context>(isCompoundV2Event, "Liq Collateral", (d) => d.collateralSymbol),
  col<CompoundV2Context>(isCompoundV2Event, "Liq cTokens Seized", (d) => d.seizeTokens),
  col<CompoundV2Context>(isCompoundV2Event, "Liq Collateral Value (USD)", (_d, e) => v2UsdLiq(e, "seizedValue")),
  col<CompoundV2Context>(isCompoundV2Event, "Liq Debt Value (USD)", (_d, e) => v2UsdLiq(e, "clearedValue")),
];

const FAMILY_COLUMNS: Record<CsvFamily, Column[]> = {
  "aave-v3": [...HEAD, ...AAVE_V3_FAMILY, ...TAIL],
  spark: [...HEAD, ...SPARK_FAMILY, ...TAIL],
  maple: [...HEAD, ...MAPLE_FAMILY, ...TAIL],
  "compound-v3": [...HEAD, ...COMPOUND_V3_FAMILY, ...TAIL],
  "compound-v2": [...HEAD, ...COMPOUND_V2_FAMILY, ...TAIL],
};

/** The header line of a family's file (no line end). */
export function timelineCsvHeader(family: CsvFamily): string {
  return FAMILY_COLUMNS[family].map((c) => escapeCsv(c.header)).join(",");
}

/** A family's data lines for these events (no line ends). Throws
 *  TokenMetaUnresolvedError when any event names a token that was not read. */
export function timelineCsvLines(events: BaseActivityEvent[], family: CsvFamily): string[] {
  if (events.some((e) => e.tokenMetaUnresolved)) throw new TokenMetaUnresolvedError();
  const columns = FAMILY_COLUMNS[family];
  return events.map((e) => columns.map((c) => escapeCsv(c.get(e))).join(","));
}

/** Serialize an activity timeline to a CSV string (CRLF line endings, header
 *  row first). With a `family`, its fixed columns; without, the core columns
 *  plus a protocol block for each protocol that appears in `events`. */
export function eventsToCsv(events: BaseActivityEvent[], family?: CsvFamily): string {
  if (family) return [timelineCsvHeader(family), ...timelineCsvLines(events, family)].join("\r\n");
  const columns: Column[] = [
    ...CORE_COLUMNS,
    ...(events.some(isLiquityEvent) ? LIQUITY_COLUMNS : []),
    ...(events.some(isAaveV4Event) ? AAVE_COLUMNS : []),
  ];
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const rows = events.map((e) => columns.map((c) => escapeCsv(c.get(e))).join(","));
  return [header, ...rows].join("\r\n");
}
