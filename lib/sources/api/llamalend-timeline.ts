// LlamaLend timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw mv_llamalend_events rows (migration 126): the
// Controller's action events, leg-discriminated in `event_key`
// (action:txhash:logindex:leg). ⚠️ A liquidation is ONE event — the Controller
// emits a paired Repay with identical amounts inside `_liquidate`, and the MV
// pre-claims that leg: NEVER render a second debt event for it.
//
// Liquidations arrive as up to two rows:
//   • leg='borrower' — done TO the user (its `user` is the borrower);
//   • leg='liquidator' — the ACTOR's row (its `user` IS the liquidator and
//     `position_user` is the borrower);
//   • a SELF-liquidation is one leg='self' row (borrower == liquidator — a
//     normal close from soft-liquidation).
//
// Amounts are UNSIGNED event fields (`collateral_amount`, `borrowed_amount`,
// `debt_repaid`); the action carries the direction, and this transform signs
// them for presentation. A `borrow` with borrowed_amount="0" is an
// add-collateral — narrated as a deposit, never a zero borrow.
//
// `*_after` NULL means THE CHAIN DID NOT STATE IT — the deployed source logs
// no UserState after-image on a partial liquidation (122 of 674 in the seed)
// — rendered as unstated, NEVER zero. The after-image, where present, is the
// emitted ABSOLUTE (the reducer is a lag over those, never a running sum).
// n1/n2 are SIGNED (negatives valid) and stay strings end to end. `caller`
// is V2-only (else null).
//
// MARKET IDENTITY IS NOT ON THE ROW — the proxy resolves it from the
// factories' own roster at head and passes the map in. A row whose market is
// unresolvable degrades to RAW integer amounts rather than a mis-scaled
// figure (a 6-dp collateral defaulted to 18 renders 1e12× off).
//
// SERVER-ONLY — imported from the /api/llamalend/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  LlamalendContext,
  LlamalendEventType,
} from "@/lib/shared/types/event-shape";
import type { LlamalendMarketMap } from "@/lib/sources/chain/llamalend-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface LlamalendTimelineResult {
  controller: string;
  user: string;
  events: BaseActivityEvent[];
  /** The position's WHOLE history as the backend counts it — not the page. */
  totalEvents: number;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the answer whenever
   *  `recent` was not asked for, and also when the position holds fewer events
   *  than the window. */
  cutoffBlock?: number | null;
}

/** One row of mv_llamalend_events, exactly as the rails /api/llamalend/timeline
 *  route projects it. numeric/bigint columns arrive as strings from pg. */
export interface LlamalendMvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  /** The emitting event: borrow | repay | remove_collateral | liquidation. */
  action: string;
  /** self | borrower | liquidator — the MV's leg discriminator (also what
   *  claims the liquidation-paired Repay). */
  leg: string;
  /** The isolated-market key — on every row. */
  controller: string;
  /** The row's subject. On leg='liquidator' this IS the liquidator. */
  user: string;
  /** The borrower whose position moved (liquidator-leg rows). */
  position_user: string | null;
  /** V2 only (else null) — the event's own emitted party. */
  caller: string | null;
  liquidator: string | null;
  self_liquidation: boolean | null;
  /** UNSIGNED event amounts (raw integer strings; the action is the sign). */
  collateral_amount: string | null;
  borrowed_amount: string | null;
  /** Liquidation only — the debt cleared. */
  debt_repaid: string | null;
  /** Same-tx UserState after-image absolutes. ⚠️ NULL = the chain did not
   *  state it (partial liquidations emit NO after-image) — never zero. */
  collateral_after: string | null;
  /** V2 only. */
  borrowed_after: string | null;
  debt_after: string | null;
  /** SIGNED band ticks after (strings — negatives valid). */
  n1_after: string | null;
  n2_after: string | null;
  liquidation_discount: string | null;
  /** Unique per row (action:txhash:logindex:leg) — the React render key. */
  event_key: string;
}

const LABELS: Record<LlamalendEventType, string> = {
  borrow: "Borrow",
  add_collateral: "Add collateral",
  repay: "Repay",
  remove_collateral: "Remove collateral",
  liquidation: "Liquidation",
};

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint | null {
  if (raw == null || raw === "") return null;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return null;
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

// Raw-integer passthrough for ctx.raw (pg NUMERIC → bare integer string).
function rawVal(v: bigint | null): string | undefined {
  return v == null ? undefined : v.toString();
}

/**
 * Transform raw mv_llamalend_events rows → { controller, user, events,
 * totalEvents }. The replay lives in the MV (the after-image IS the emitted
 * absolute; the liquidation-paired Repay is pre-claimed there); only
 * presentation lives here. `markets` is the factories' own roster read at
 * head. `totalEvents` defaults to rows.length; the proxy overrides it with
 * the backend's whole-history count when paging.
 */
export function buildLlamalendTimeline(
  rows: LlamalendMvRow[],
  controllerRaw: string,
  userRaw: string,
  markets: LlamalendMarketMap,
  totalEvents?: number,
): LlamalendTimelineResult {
  const controller = controllerRaw.toLowerCase();
  const user = userRaw.toLowerCase();
  const m = markets.get(controller);
  // No identity → RAW integers (decimals 0), never a guessed scale.
  const collateralSymbol = m?.collateralSymbol ?? "collateral (raw)";
  const collateralDecimals = m?.collateralDecimals ?? 0;
  const borrowedSymbol = m?.borrowedSymbol ?? "borrowed (raw)";
  const borrowedDecimals = m?.borrowedDecimals ?? 0;

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const isLiq = r.action === "liquidation";
    const role: "borrower" | "liquidator" | "self" | undefined = isLiq
      ? r.leg === "liquidator"
        ? "liquidator"
        : r.leg === "self"
          ? "self"
          : "borrower"
      : undefined;
    const selfLiquidation = role === "self" || r.self_liquidation === true;

    const collAmt = bigintOf(r.collateral_amount);
    const borrowedAmt = bigintOf(r.borrowed_amount);
    const debtRepaid = bigintOf(r.debt_repaid);

    // Sign the unsigned event amounts by what the action DID:
    //   borrow          → collateral in (+), debt up (+)
    //   repay           → collateral out (−, full-close return), debt down (−)
    //   remove_collateral → collateral out (−)
    //   liquidation, borrower/self → collateral taken/withdrawn (−), debt cleared (−)
    //   liquidation, liquidator    → collateral received (+), repay paid (−)
    let collateralDelta: bigint | null = null;
    let debtDelta: bigint | null = null;
    switch (r.action) {
      case "borrow":
        collateralDelta = collAmt;
        debtDelta = borrowedAmt;
        break;
      case "repay":
        collateralDelta = collAmt != null && collAmt !== ZERO ? -collAmt : collAmt;
        debtDelta = borrowedAmt != null && borrowedAmt !== ZERO ? -borrowedAmt : borrowedAmt;
        break;
      case "remove_collateral":
        collateralDelta = collAmt != null && collAmt !== ZERO ? -collAmt : collAmt;
        break;
      case "liquidation":
        if (role === "liquidator") {
          collateralDelta = collAmt; // received
          debtDelta = debtRepaid != null && debtRepaid !== ZERO ? -debtRepaid : debtRepaid; // paid in
        } else {
          collateralDelta = collAmt != null && collAmt !== ZERO ? -collAmt : collAmt;
          debtDelta = debtRepaid != null && debtRepaid !== ZERO ? -debtRepaid : debtRepaid;
        }
        break;
      default:
        break;
    }

    // A borrow whose loan side moved nothing is a pure collateral add — Curve
    // emits Borrow for add_collateral too (the event, not the intent).
    const kind: LlamalendEventType = isLiq
      ? "liquidation"
      : r.action === "borrow"
        ? borrowedAmt == null || borrowedAmt === ZERO
          ? "add_collateral"
          : "borrow"
        : r.action === "repay"
          ? "repay"
          : "remove_collateral";

    // ⚠️ On a liquidation, `borrowed_amount` is NOT the debt: it is the
    // stablecoin_received — the position's ALREADY-CONVERTED borrowed-token
    // holding taken from the AMM alongside the collateral (a hard
    // liquidation seizes both legs; a self-liquidation settles with it).
    // Measured live: 15,686 debt cleared against 10,946 converted taken +
    // 1.58 collateral — three distinct figures on one row.
    const convertedTaken = isLiq && borrowedAmt != null && borrowedAmt !== ZERO ? borrowedAmt : null;

    // ⚠️ NULL after-image = the chain did not state it (partial liquidation)
    // — the fields stay absent and the detail renders "unstated", never 0.
    const collateralAfter = bigintOf(r.collateral_after);
    const debtAfter = bigintOf(r.debt_after);

    const ctx: LlamalendContext = {
      eventType: kind,
      controller,
      collateralSymbol,
      collateralDecimals,
      borrowedSymbol,
      borrowedDecimals,
      borrowedIsCrvusd: m?.borrowedIsCrvusd ?? false,
      ...(collateralDelta != null ? { collateralDelta: fmtUnits(collateralDelta, collateralDecimals) } : {}),
      ...(debtDelta != null ? { debtDelta: fmtUnits(debtDelta, borrowedDecimals) } : {}),
      ...(convertedTaken != null ? { convertedTaken: fmtUnits(convertedTaken, borrowedDecimals) } : {}),
      ...(collateralAfter != null ? { collateralAfter: fmtUnits(collateralAfter, collateralDecimals) } : {}),
      ...(debtAfter != null ? { debtAfter: fmtUnits(debtAfter, borrowedDecimals) } : {}),
      ...(r.n1_after != null ? { n1: String(r.n1_after) } : {}),
      ...(r.n2_after != null ? { n2: String(r.n2_after) } : {}),
      ...(role ? { role } : {}),
      ...(r.liquidator ? { liquidator: r.liquidator.toLowerCase() } : {}),
      ...(r.position_user ? { positionUser: r.position_user.toLowerCase() } : {}),
      ...(selfLiquidation ? { selfLiquidation } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      ...(r.caller ? { caller: r.caller.toLowerCase() } : {}),
      raw: {
        collateralDelta: rawVal(collateralDelta),
        debtDelta: rawVal(debtDelta),
        convertedTaken: rawVal(convertedTaken),
        collateralAfter: rawVal(collateralAfter),
        debtAfter: rawVal(debtAfter),
      },
      isOpen: idx === 0,
    };

    // Token flows: the signed amounts, each in its own token. A borrower-side
    // hard liquidation carries NO flow chip — a taking is not a send the
    // borrower made; self-liquidations and liquidator-side rows are the
    // subject's own acts and flow normally.
    const flows: AssetFlow[] = [];
    const isBorrowerLoss = kind === "liquidation" && role === "borrower";
    if (!isBorrowerLoss && m != null) {
      if (collateralDelta != null && collateralDelta !== ZERO) {
        const mag = collateralDelta < ZERO ? -collateralDelta : collateralDelta;
        flows.push({
          token: m.collateralToken,
          tokenSymbol: collateralSymbol,
          tokenDecimals: collateralDecimals,
          amount: mag.toString(),
          amountFormatted: Number(fmtUnits(mag, collateralDecimals)),
          direction: collateralDelta > ZERO ? "in" : "out",
        });
      }
      if (debtDelta != null && debtDelta !== ZERO) {
        const mag = debtDelta < ZERO ? -debtDelta : debtDelta;
        flows.push({
          token: m.borrowedToken,
          tokenSymbol: borrowedSymbol,
          tokenDecimals: borrowedDecimals,
          amount: mag.toString(),
          // The debt delta's sign is the LOAN's: borrowing RECEIVES the
          // borrowed token, repaying sends it.
          amountFormatted: Number(fmtUnits(mag, borrowedDecimals)),
          direction: debtDelta > ZERO ? "in" : "out",
        });
      }
    }

    const actionLabel =
      kind === "liquidation"
        ? role === "self"
          ? "Self-liquidation"
          : role === "liquidator"
            ? "Liquidation (as liquidator)"
            : "Liquidation"
        : (LABELS[kind] ?? kind);

    return {
      id: r.event_key || `${tx}-${r.log_index}-${r.leg}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet: user,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: kind,
      actionLabel,
      flows,
      context: { protocol: "llamalend" as const, data: ctx },
    };
  });

  return { controller, user, events, totalEvents: totalEvents ?? events.length };
}
