// Compound V3 (Comet) timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed mv_compound_v3_events rows (signed base
// + per-asset collateral running balances, replayed in the MV); this transform
// maps each to a BaseActivityEvent + CompoundContext the chain-state cards
// consume — using the market's FIXED base symbol/decimals for base events and
// resolving COLLATERAL ERC20 symbol/decimals (one multicall) for collateral
// events. The replay lives server-side in the MV; only chain-direct presentation
// lives here. No health factor and no derived USD — those are layers, absent
// from baseline. The one USD that DOES ship is the absorb events' own emitted
// usdValue (a chain field, not a layer): the liquidation forensics legs.
//
// SERVER-ONLY — imported from the /api/compound/* route handlers.

import type { BaseActivityEvent, AssetFlow, CompoundContext, CompoundEventType } from "@/lib/shared/types/event-shape";
import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { marketOf } from "@/lib/compound/asset-catalog";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface CompoundTimelineResult {
  wallet: string;
  market: string | null;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the answer whenever
   *  `recent` was not asked for, and also when the position holds fewer events
   *  than the window. The route attaches it; the transform never sets it. */
  cutoffBlock?: number | null;
}

/** One row of mv_compound_v3_events, as the rails /api/compound/timeline route
 *  projects it. numeric/bigint columns arrive as strings from pg; tx_hash is
 *  already a 0x-hex string (the MV encodes it). */
export interface MvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  action: string;
  market: string;
  account: string;
  asset: string | null;
  counterparty: string | null;
  base_delta: string | null;
  coll_delta: string | null;
  usd_value: string | null;
  base_before: string | null;
  base_after: string | null;
  collateral_before: string | null;
  collateral_after: string | null;
}

/** The action label per event type — shared with the swept Base reader
 *  (lib/sources/chain/compound-v3-events.ts) so the two lanes name an event
 *  identically. */
export const COMPOUND_EVENT_LABELS: Record<CompoundEventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  supply_collateral: "Add Collateral",
  withdraw_collateral: "Withdraw Collateral",
  absorb_debt: "Liquidation (debt)",
  absorb_collateral: "Liquidation (collateral)",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
  transfer_collateral_in: "Collateral transferred in",
  transfer_collateral_out: "Collateral transferred out",
};

// The signed-base axis. transfer_in/out move the market's BASE token (Comet
// Transfer), so they read base_delta / base_after — NOT coll_delta — exactly
// like supply/withdraw. Omitting them here would silently read the always-zero
// coll_delta and mis-shape the event as a collateral move.
const BASE_ACTIONS = new Set<CompoundEventType>(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);

// The account-to-account moves carry a true counterparty (the other wallet) and
// no acting-party verdict.
const TRANSFER_ACTIONS = new Set<CompoundEventType>([
  "transfer_in",
  "transfer_out",
  "transfer_collateral_in",
  "transfer_collateral_out",
]);
// Outflows (value leaving THIS account): withdraws, and the _out transfer legs.
const OUT_ACTIONS = new Set<CompoundEventType>([
  "supply",
  "supply_collateral",
  "absorb_debt",
  "transfer_out",
  "transfer_collateral_out",
]);
const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for a token's decimals (trims trailing zeros).
 *  Exported for the swept Base reader, which carries the same human strings. */
export function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** The token a row names for a symbol and decimals read (lowercased): its
 *  collateral asset. A base row's token comes from the market catalog. */
export function compoundRowTokens(r: MvRow): string[] {
  return !BASE_ACTIONS.has(r.action as CompoundEventType) && r.asset ? [r.asset.toLowerCase()] : [];
}

/**
 * Transform raw mv_compound_v3_events rows → { wallet, market, events, totalEvents }.
 * The replay lives in the MV; only chain-direct presentation (symbols, signs) here.
 */
export async function buildCompoundTimeline(
  rows: MvRow[],
  walletRaw: string,
  market: string | null,
): Promise<CompoundTimelineResult> {
  const wallet = walletRaw.toLowerCase();

  // One batched ERC20 multicall over every COLLATERAL asset referenced (base
  // assets use the market's fixed symbol/decimals, no lookup).
  const addrs = new Set<string>();
  for (const r of rows) for (const a of compoundRowTokens(r)) addrs.add(a);
  const metas = await resolveErc20Meta([...addrs]);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
    unresolved: true,
  });
  const unresolved = (rs: MvRow[]) =>
    rs.some((r) => compoundRowTokens(r).some((a) => !metas.has(a) || metas.get(a)!.unresolved === true));

  // Comet absorbs the whole account in one call: one AbsorbDebt + one
  // AbsorbCollateral per collateral asset, all in the same tx. Group the
  // collateral legs by tx so the debt row can state the full absorption
  // (the rows here are one account's timeline, so tx alone keys the pair).
  const absorbCollByTx = new Map<string, MvRow[]>();
  for (const r of rows) {
    if (r.action !== "absorb_collateral") continue;
    const list = absorbCollByTx.get(r.tx_hash) ?? [];
    list.push(r);
    absorbCollByTx.set(r.tx_hash, list);
  }
  /** The event's own usdValue (8-dec USD on chain) → human string. */
  const usdOf = (raw: string | null): string | undefined => (raw == null ? undefined : fmtUnits(bigintOf(raw), 8));

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const block = Number(r.block_number);
    const ts = Number(r.block_timestamp);
    const kind = r.action as CompoundEventType;
    const m = marketOf(r.market);
    const isBase = BASE_ACTIONS.has(kind);

    const meta: Erc20Meta = isBase
      ? { address: m.baseToken, symbol: m.baseSymbol, decimals: m.baseDecimals }
      : (metas.get((r.asset ?? "").toLowerCase()) ?? fallback((r.asset ?? "").toLowerCase()));

    const delta = isBase ? bigintOf(r.base_delta) : bigintOf(r.coll_delta);

    const ctx: CompoundContext = {
      eventType: kind,
      market: r.market,
      marketLabel: m.label,
      assetSymbol: meta.symbol,
      isBase,
      assetsDelta: fmtUnits(delta, meta.decimals),
      ...(isBase
        ? { baseAfter: fmtUnits(bigintOf(r.base_after), m.baseDecimals) }
        : {
            collateralAfter: fmtUnits(bigintOf(r.collateral_after), meta.decimals),
            // The account's running signed base rides on collateral rows too
            // (the MV carries base_after on every row), so a collateral card
            // can state the base debt its stack stands behind.
            ...(r.base_after != null ? { baseAfter: fmtUnits(bigintOf(r.base_after), m.baseDecimals) } : {}),
          }),
      isOpen: idx === 0, // rows are block ASC → idx 0 is the wallet's first event
      // The acting parties — ONLY where the MV's counterparty is a true party
      // param (the Supply/SupplyCollateral `from`, the funder). Withdraws'
      // counterparty is `to` (a recipient, not an actor) and absorbs are the
      // liquidation path, so neither ships the facts and neither can mark.
      ...((kind === "supply" || kind === "supply_collateral") && r.tx_from && r.counterparty
        ? { txFrom: r.tx_from.toLowerCase(), funder: r.counterparty.toLowerCase() }
        : {}),
      // A position move's other account (recipient on _out, sender on _in) —
      // the MV's counterparty column is a true party here, not a `to` recipient.
      ...(TRANSFER_ACTIONS.has(kind) && r.counterparty ? { counterparty: r.counterparty.toLowerCase() } : {}),
      // Absorbs carry the event's own usdValue (the protocol's oracle
      // reckoning at absorption, emitted on chain); the debt leg also gets
      // its same-tx seized-collateral legs so its card can state the full
      // absorption.
      ...(kind === "absorb_debt" || kind === "absorb_collateral" ? { usdValue: usdOf(r.usd_value) } : {}),
      ...(kind === "absorb_debt"
        ? {
            absorbedCollateral: (absorbCollByTx.get(r.tx_hash) ?? []).flatMap((s) => {
              const sMeta = metas.get((s.asset ?? "").toLowerCase()) ?? fallback((s.asset ?? "").toLowerCase());
              const sUsd = usdOf(s.usd_value);
              if (sUsd == null) return [];
              const seized = -bigintOf(s.coll_delta); // coll_delta is negative on a seize
              return [{ symbol: sMeta.symbol, amount: fmtUnits(seized, sMeta.decimals), usdValue: sUsd }];
            }),
          }
        : {}),
    };

    // Direction from THIS account's view: "out" = value leaving the account
    // (supply, a seized absorb, or a sent transfer leg), "in" = value arriving.
    const dir: "in" | "out" = OUT_ACTIONS.has(kind) ? "out" : "in";
    const mag = delta < ZERO ? -delta : delta;
    const flows: AssetFlow[] =
      mag !== ZERO
        ? [
            {
              token: meta.address,
              tokenSymbol: meta.symbol,
              tokenDecimals: meta.decimals,
              amount: mag.toString(),
              amountFormatted: Number(fmtUnits(mag, meta.decimals)),
              direction: dir,
            },
          ]
        : [];

    // The debt leg states its same-transaction collateral legs too.
    const named = kind === "absorb_debt" ? [r, ...(absorbCollByTx.get(r.tx_hash) ?? [])] : [r];
    return {
      ...(unresolved(named) ? { tokenMetaUnresolved: true as const } : {}),
      id: `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: block,
      timestamp: ts,
      wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: kind,
      actionLabel: COMPOUND_EVENT_LABELS[kind] ?? kind,
      flows,
      context: { protocol: "compound", data: ctx },
    };
  });

  return { wallet, market, events, totalEvents: events.length };
}
