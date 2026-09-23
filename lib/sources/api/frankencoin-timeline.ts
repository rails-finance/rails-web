// Frankencoin timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw per-position event rows: PositionOpened (hub),
// the MintingUpdate ledger (the Position's own absolutes, with the previous
// event's absolutes as lag columns at the position grain), PositionDenied,
// OwnershipTransferred, the challenge slices (ChallengeStarted / Averted /
// Succeeded — leg-keyed: a multi-bid auction emits SEVERAL Succeeded slices
// for one challenge number) and ForcedSale (V2). `event_key` is unique per
// row — the React key.
//
// CLASSIFICATION lives here: MintingUpdate carries no action name, so each row
// is classified by DIFFING its absolutes against the lag columns — minted ↑ is
// a mint, minted ↓ a repay, collateral ↑/↓ an add/withdraw, price-only a
// declared-price adjustment, several axes at once a composite "adjust", and
// both collateral AND minted landing on zero the close. The first row of an
// original position is its open; of a clone, its clone.
//
// UNITS ARE NATIVE (ZCHF debt / the position's own collateral token / the
// declared price at 1e(36 − decimals)). Decimals are per-token FROM THE ROW —
// never assumed (four observed collaterals are decimals=0). A row without
// collateral identity degrades to raw integers rather than mis-scale.
//
// SERVER-ONLY — imported from the /api/frankencoin/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  FrankencoinContext,
  FrankencoinEventType,
} from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface FrankencoinTimelineResult {
  /** Lowercased Position contract address. */
  position: string;
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

/** One row as the rails /api/frankencoin/timeline route projects it.
 *  numeric/bigint columns arrive as strings from pg. */
export interface FrankencoinMvRow {
  block_timestamp: string;
  block_number: string;
  log_index: number;
  tx_hash: string;
  /** From the nightly tx-from filler — null until it runs. On a
   *  challenge_succeeded row this is the only bidder identity there is. */
  tx_from: string | null;
  tx_index?: number | null;
  tx_gas_used?: string | null;
  tx_gas_price?: string | null;
  /** The emitting event: position_opened | minting_update | position_denied |
   *  challenge_started | challenge_averted | challenge_succeeded |
   *  forced_sale | ownership_transferred. */
  event_type: string;
  hub_version: string;
  position: string;
  /** The position's CURRENT owner — constant across all rows (the per-row
   *  transfer lane is prev_owner/new_owner). */
  owner: string | null;
  original: string | null;
  collateral_token: string | null;
  collateral_symbol: string | null;
  collateral_decimals: number | null;
  /** MintingUpdate absolutes (raw integer strings) + their lag columns. */
  collateral: string | null;
  price: string | null;
  minted: string | null;
  collateral_before: string | null;
  price_before: string | null;
  minted_before: string | null;
  /** Challenge rows. challenge_number is uint256 — STRING. */
  challenger: string | null;
  challenge_number: string | null;
  size: string | null;
  bid: string | null;
  acquired_collateral: string | null;
  challenge_size: string | null;
  /** PositionDenied. */
  denied_by: string | null;
  message: string | null;
  /** OwnershipTransferred. ⚠️ Includes the mint-time factory→owner handover
   *  (prev_owner = the factory, same tx as position_opened). */
  prev_owner: string | null;
  new_owner: string | null;
  /** V1 only — the trailing MintingUpdate `limit` field. */
  mint_limit?: string | null;
  /** ⚠️ The V1 clone-creation lie: true ⇒ this row's emitted collateral
   *  UNDERSTATES the real balance. Never narrated as a withdrawal. */
  collateral_understated?: boolean | null;
  /** Which leg of a multi-row settlement this row is. */
  slice_leg?: string | null;
  /** Unique per row — the React render key. NB: on forced_sale rows the
   *  `price` column above carries the SALE's raw priceE36MinusDecimals, not a
   *  declared liquidation price. */
  event_key: string;
}

const LABELS: Record<FrankencoinEventType, string> = {
  open: "Open Position",
  clone: "Clone Position",
  mint: "Mint",
  repay: "Repay",
  add_collateral: "Add Collateral",
  withdraw_collateral: "Withdraw Collateral",
  adjust_price: "Adjust Liq. Price",
  adjust: "Adjust Position",
  auction_settlement: "Auction Settlement",
  close: "Close Position",
  denied: "Position Denied",
  challenge_started: "Challenge Started",
  challenge_averted: "Challenge Averted",
  challenge_succeeded: "Challenge Succeeded",
  forced_sale: "Forced Sale",
  ownership_transferred: "Ownership Transferred",
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

// Raw-integer passthrough for ctx.raw (pg NUMERIC → bare integer string);
// null → undefined so the key drops out of the JSON.
function rawVal(v: string | null): string | undefined {
  return v == null || v === "" ? undefined : String(v).split(".")[0];
}

/** Classify one MintingUpdate by diffing its absolutes against the lag
 *  columns. A first-touch row (no lag) with minted > 0 is the opening mint of
 *  an original; the open/clone card itself rides position_opened. */
function classifyMintingUpdate(args: {
  collateral: bigint | null;
  minted: bigint | null;
  price: bigint | null;
  collateralBefore: bigint | null;
  mintedBefore: bigint | null;
  priceBefore: bigint | null;
}): FrankencoinEventType {
  const { collateral, minted, price, collateralBefore, mintedBefore, priceBefore } = args;
  // Both axes emptied ⇒ the close (the ledger's own terminal write).
  if (collateral != null && minted != null && collateral === ZERO && minted === ZERO) {
    const hadAnything =
      (collateralBefore != null && collateralBefore > ZERO) || (mintedBefore != null && mintedBefore > ZERO);
    if (hadAnything) return "close";
  }
  const dMint = minted != null && mintedBefore != null ? minted - mintedBefore : minted != null ? minted : null;
  const dColl =
    collateral != null && collateralBefore != null
      ? collateral - collateralBefore
      : collateral != null
        ? collateral
        : null;
  const dPrice = price != null && priceBefore != null ? price - priceBefore : ZERO;

  const mintMoved = dMint != null && dMint !== ZERO;
  const collMoved = dColl != null && dColl !== ZERO;
  const priceMoved = dPrice !== ZERO && priceBefore != null;

  const axes = [mintMoved, collMoved, priceMoved].filter(Boolean).length;
  if (axes > 1) return "adjust";
  if (mintMoved) return dMint! > ZERO ? "mint" : "repay";
  if (collMoved) return dColl! > ZERO ? "add_collateral" : "withdraw_collateral";
  if (priceMoved) return "adjust_price";
  // A no-change MintingUpdate (rare; e.g. an internal touch) — composite label.
  return "adjust";
}

/** Name the axes a COMPOSITE adjust moved — the classifier collapses a
 *  multi-axis MintingUpdate to "adjust" ("Adjust Position"), which
 *  underdetermines what happened. Deriving the axes (mirrors the fork
 *  classifier) reads "Add + Mint" / "Withdraw + Repay" / "Add + Reprice". The
 *  header shows the collateral + mint chips; a declared-price move rides the
 *  detail grid, so the label names it "Reprice" for completeness. Falls back to
 *  "Adjust Position" when nothing resolved (a rare no-change internal touch). */
function frankencoinAdjustLabel(dColl: bigint | null, dMint: bigint | null, priceMoved: boolean): string {
  const parts: string[] = [];
  if (dColl != null && dColl !== ZERO) parts.push(dColl > ZERO ? "Add" : "Withdraw");
  if (dMint != null && dMint !== ZERO) parts.push(dMint > ZERO ? "Mint" : "Repay");
  if (priceMoved) parts.push("Reprice");
  return parts.length > 0 ? parts.join(" + ") : "Adjust Position";
}

/**
 * Transform raw rows → { position, events, totalEvents }. The replay lives in
 * the ledger (each MintingUpdate figure IS the stored state at its block);
 * only classification + presentation live here. `totalEvents` defaults to
 * rows.length; the proxy overrides it with the backend's whole-history count
 * when paging.
 */
export function buildFrankencoinTimeline(
  rows: FrankencoinMvRow[],
  positionRaw: string,
  totalEvents?: number,
): FrankencoinTimelineResult {
  const position = positionRaw.toLowerCase();

  // Transactions in which an auction settled — a MintingUpdate in one of
  // these is the PROTOCOL writing the outcome down, not an act of the owner,
  // and must never read as a repay/withdrawal the borrower made.
  const auctionTxs = new Set(
    rows
      .filter((r) => r.event_type === "challenge_succeeded" || r.event_type === "forced_sale")
      .map((r) => r.tx_hash.toLowerCase()),
  );

  // The opening transaction(s): an OwnershipTransferred in one of these is the
  // mint-time factory→owner handover — initialization, not a real transfer.
  const openedTxs = new Set(rows.filter((r) => r.event_type === "position_opened").map((r) => r.tx_hash.toLowerCase()));

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    // The wire spells it "V1"/"V2" (and `hub` is the hub ADDRESS — a
    // different column) — normalize case rather than string-match one spelling.
    const hub = String(r.hub_version).toLowerCase() === "v1" ? ("v1" as const) : ("v2" as const);
    const symbol =
      r.collateral_symbol ??
      (r.collateral_token ? `${r.collateral_token.slice(0, 6)}…${r.collateral_token.slice(-4)}` : "—");
    // No identity → RAW integers (decimals 0), never a guessed scale — four
    // observed collaterals really are decimals=0.
    const decimals = r.collateral_decimals ?? 0;

    const collateral = bigintOf(r.collateral);
    const minted = bigintOf(r.minted);
    const price = bigintOf(r.price);
    const collateralBefore = bigintOf(r.collateral_before);
    const mintedBefore = bigintOf(r.minted_before);
    const priceBefore = bigintOf(r.price_before);

    let kind: FrankencoinEventType;
    switch (r.event_type) {
      case "position_opened":
        kind = r.original != null && r.original.toLowerCase() !== position ? "clone" : "open";
        break;
      case "minting_update":
        kind = auctionTxs.has(r.tx_hash.toLowerCase())
          ? "auction_settlement"
          : classifyMintingUpdate({
              // ⚠️ The V1 clone-creation lie: an understated collateral figure
              // must never classify as a withdrawal — the collateral axis is
              // treated as unmoved and the flag rides the context instead.
              collateral: r.collateral_understated ? collateralBefore : collateral,
              minted,
              price,
              collateralBefore,
              mintedBefore,
              priceBefore,
            });
        break;
      case "position_denied":
        kind = "denied";
        break;
      case "challenge_started":
        kind = "challenge_started";
        break;
      case "challenge_averted":
        kind = "challenge_averted";
        break;
      case "challenge_succeeded":
        kind = "challenge_succeeded";
        break;
      case "forced_sale":
        kind = "forced_sale";
        break;
      case "ownership_transferred":
        kind = "ownership_transferred";
        break;
      // (the mint-time factory→owner handover is flagged `initialization`
      // below — same tx as position_opened)
      default:
        kind = "adjust";
        break;
    }

    // The declared price scales at 1e(36 − decimals) — only when identity landed.
    // NOT on forced_sale rows: there the `price` column carries the SALE's raw
    // price, which must never render as a declared liquidation price.
    const liqPriceOf = (p: bigint | null): string | undefined =>
      p != null && r.collateral_decimals != null && kind !== "forced_sale" ? fmtUnits(p, 36 - decimals) : undefined;

    const initialization = kind === "ownership_transferred" && openedTxs.has(r.tx_hash.toLowerCase());

    // A composite adjust names the axes it moved (the classifier collapsed them
    // to "adjust"). Uses the SAME effective collateral as the classification —
    // the V1 clone-creation lie treats an understated figure as unmoved.
    const effColl = r.collateral_understated ? collateralBefore : collateral;
    const dCollForLabel = effColl != null && collateralBefore != null ? effColl - collateralBefore : null;
    const dMintForLabel = minted != null && mintedBefore != null ? minted - mintedBefore : null;
    const priceMovedForLabel = price != null && priceBefore != null && price - priceBefore !== ZERO;
    const compositeAdjustLabel =
      kind === "adjust" && r.event_type === "minting_update" && !auctionTxs.has(r.tx_hash.toLowerCase())
        ? frankencoinAdjustLabel(dCollForLabel, dMintForLabel, priceMovedForLabel)
        : null;

    const ctx: FrankencoinContext = {
      eventType: kind,
      hub,
      position,
      collateralToken: r.collateral_token ? r.collateral_token.toLowerCase() : "",
      collateralSymbol: symbol,
      collateralDecimals: decimals,
      ...(collateral != null ? { collateral: fmtUnits(collateral, decimals) } : {}),
      ...(minted != null ? { minted: fmtUnits(minted, 18) } : {}),
      ...(liqPriceOf(price) != null ? { liqPrice: liqPriceOf(price) } : {}),
      ...(collateralBefore != null ? { collateralBefore: fmtUnits(collateralBefore, decimals) } : {}),
      ...(mintedBefore != null ? { mintedBefore: fmtUnits(mintedBefore, 18) } : {}),
      ...(liqPriceOf(priceBefore) != null ? { liqPriceBefore: liqPriceOf(priceBefore) } : {}),
      ...(r.original ? { original: r.original.toLowerCase() } : {}),
      ...(r.challenger ? { challenger: r.challenger.toLowerCase() } : {}),
      ...(r.challenge_number != null ? { challengeNumber: String(r.challenge_number) } : {}),
      // started/averted carry `size`; a succeeded slice carries challenge_size;
      // a forced_sale row carries its sold amount in `size`.
      ...(kind !== "forced_sale" && (r.size != null || r.challenge_size != null)
        ? {
            challengeSize: fmtUnits(bigintOf(r.challenge_size ?? r.size) ?? ZERO, decimals),
          }
        : {}),
      ...(kind === "forced_sale" && r.size != null
        ? { forcedSaleAmount: fmtUnits(bigintOf(r.size) ?? ZERO, decimals) }
        : {}),
      ...(r.bid != null ? { bid: fmtUnits(bigintOf(r.bid) ?? ZERO, 18) } : {}),
      ...(r.acquired_collateral != null
        ? { acquiredCollateral: fmtUnits(bigintOf(r.acquired_collateral) ?? ZERO, decimals) }
        : {}),
      ...(r.denied_by ? { deniedBy: r.denied_by.toLowerCase() } : {}),
      ...(r.message ? { deniedMessage: r.message } : {}),
      ...(r.prev_owner ? { previousOwner: r.prev_owner.toLowerCase() } : {}),
      ...(r.new_owner ? { newOwner: r.new_owner.toLowerCase() } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      ...(r.collateral_understated ? { collateralUnderstated: true } : {}),
      ...(initialization ? { initialization: true } : {}),
      raw: {
        collateral: rawVal(r.collateral),
        price: rawVal(r.price),
        minted: rawVal(r.minted),
        collateralBefore: rawVal(r.collateral_before),
        priceBefore: rawVal(r.price_before),
        mintedBefore: rawVal(r.minted_before),
        size: rawVal(r.size),
        bid: rawVal(r.bid),
        acquiredCollateral: rawVal(r.acquired_collateral),
        challengeSize: rawVal(r.challenge_size),
      },
      isOpen: idx === 0,
    };

    // Token flow chips: only for movements the position's own party made —
    // challenge/forced-sale seizures and their ledger write-downs carry NO
    // flow chip (collateral taken under the auction's rules is not a send the
    // owner made).
    const flows: AssetFlow[] = [];
    if (
      r.event_type === "minting_update" &&
      kind !== "auction_settlement" &&
      // An understated collateral figure (the V1 clone-creation lie) must not
      // mint a phantom outbound chip.
      !r.collateral_understated &&
      r.collateral_token &&
      r.collateral_decimals != null
    ) {
      const dColl = collateral != null && collateralBefore != null ? collateral - collateralBefore : null;
      if (dColl != null && dColl !== ZERO) {
        const mag = dColl < ZERO ? -dColl : dColl;
        flows.push({
          token: r.collateral_token.toLowerCase(),
          tokenSymbol: symbol,
          tokenDecimals: decimals,
          amount: mag.toString(),
          amountFormatted: Number(fmtUnits(mag, decimals)),
          direction: dColl > ZERO ? "in" : "out",
        });
      }
    }

    return {
      id: r.event_key || `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet: r.owner ? r.owner.toLowerCase() : position,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: kind,
      actionLabel: initialization ? "Owner Set at Mint" : (compositeAdjustLabel ?? LABELS[kind] ?? kind),
      flows,
      context: { protocol: "frankencoin" as const, data: ctx },
    };
  });

  return { position, events, totalEvents: totalEvents ?? events.length };
}
