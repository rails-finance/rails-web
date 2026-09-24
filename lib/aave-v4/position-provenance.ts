// Provenance vocabulary for the Aave V4 spoke view — the Aave analogue of
// Liquity's trove-state-origin helpers. The spoke detail page blends three
// kinds of source, and these builders name each one the same way wherever a
// figure surfaces (headline card, position explanation, event cards, lifetime
// towers), so the receipts read consistently:
//
//   • ON-CHAIN VALUES  — live on-chain reads served by /api/aave-v4/spoke-position
//     (health factor, current per-asset supply/debt balances, liquidation
//     thresholds). What the spoke contract answers at the latest block:
//     getUserAccountData, getUserSuppliedAssets, getUserTotalDebt. V4 has no
//     Pool — the position lives on the spoke — so the receipts name the spoke.
//   • EMITTED — a value read from one decoded on-chain log: the moved
//     amount on the spoke's Supply/Withdraw/Borrow/Repay/LiquidationCall
//     events, or the hub's UpdateAsset drawnRate.
//   • REPLAYED — the running per-reserve balances, reconstructed as the signed
//     sum of the amounts the position's logs moved, in on-chain order.
//   • DERIVED — accumulations over the spoke's event stream (lifetime flows,
//     peaks, tx count, interest carry) and the position calculation over the per-asset
//     thresholds the spoke reports (borrowing power, liquidation price).
//     Computed in the browser.
//
// Receipt prose states ORIGIN, not custody (provenance-receipts-grammar §3):
// the summary says what the value means on chain, the via line owns the log
// anatomy (log name · field · scaling). "Read from the rails-server index" is
// custody — it survives only as the via line's leading segment, which the
// embedded receipt renderer drops.
//
// USD figures multiply a token amount by a resolved price, and the receipt
// names which price. Since server migration 314 (2026-09-22) every Aave V4
// price Rails states for a V4-listed asset — stored history and live read
// alike — is the spoke AaveOracle's `getReservePrice(reserveId)`, source
// `iaave-oracle`; DAI, rETH and cbETH, which no V4 spoke lists, stay on
// Chainlink (rails-ops reference/pricing.md, "Aave V4"). So an oracle-priced
// figure says "Aave's oracle", never "Chainlink", and a figure priced off
// chain says it came from a market feed.

import type { Provenance, ProvInput, ProvScaling, ProvVerify } from "@/components/shared/provenance";
import type { AaveV4PriceSource } from "@/lib/shared/types/protocols/aave-v4";
import type { OriginEnvelope } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Both vias lead with the custody segment the embedded receipt drops
// (provenance.tsx), so every segment after it is origin and nothing is lost.
const SPOKE_POSITION_VIA = "GET /api/aave-v4/spoke-position · the spoke's read at the latest block";
const INDEX_VIA = "rails-server index of decoded Aave V4 logs";

/** The concrete on-chain coordinates of an event-level value — the spoke
 *  contract it was emitted by, the exact tx + block, and the reserve it
 *  concerns. Threaded from the event so the receipt can show (and link / copy)
 *  the specific facts behind a number rather than a boilerplate sentence. Every
 *  field is optional: a partial detail still enriches what it can. */
export interface EventProvDetail {
  spokeName?: string;
  spokeAddress?: string;
  txHash?: string;
  blockNumber?: number;
  /** The reserve token this value concerns (e.g. "USDC"). */
  asset?: string;
  /** The raw integer behind the value (ctx.raw.*) — the log's uint256 for
   *  an emitted field, the MV's integer sum for a replayed balance. Rendered
   *  on the via line; passed through untouched (it IS the chain value; never
   *  reconstruct it from the rounded float). */
  raw?: string | null;
  /** The backend's origin envelope for this value (ctx.origin.*) — the log,
   *  ABI param, raw integer, and divisor exponent, stamped in the transformer
   *  beside the SQL. When present it is AUTHORITATIVE: the via line renders
   *  from it instead of the caller's hand-written log/field strings (which
   *  stay as the fallback for pre-envelope API responses). */
  origin?: OriginEnvelope | null;
}

/** Log-anatomy via segment: `field: <raw>` when the index delivered the log's
 *  raw integer, plain `field` until it does (the Liquity fieldSeg pattern). */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** The scaling sentence for a value that IS one delivered log field (receipts
 *  grammar §5): the envelope's untouched integer and the reserve's decimals.
 *  No envelope, no raw, no sentence — and never rebuilt from the scaled float.
 *  A replayed or summed figure carries none; its via states the sum. */
const scalingOf = (detail?: EventProvDetail): ProvScaling | undefined => {
  const o = detail?.origin;
  const raw = o?.raw ?? detail?.raw;
  if (!o || raw == null || raw === "") return undefined;
  const what = detail?.asset ? `${detail.asset} amounts` : "this reserve's amounts";
  return { raw, places: o.scale, why: `${what} have ${o.scale} decimal places` };
};

// Build the copyable input chips (block / tx / reserve) for an event-level prov.
function eventInputs(detail: EventProvDetail | undefined): ProvInput[] {
  if (!detail) return [];
  const inputs: ProvInput[] = [];
  if (detail.asset) inputs.push({ label: "reserve", value: detail.asset, kind: "chain" });
  if (detail.blockNumber != null)
    inputs.push({ label: "block", value: String(detail.blockNumber), kind: "chain", note: "event block" });
  if (detail.txHash)
    inputs.push({
      label: "tx",
      value: detail.txHash,
      kind: "chain",
      note: "indexed log",
    });
  return inputs;
}

// The emitting spoke as a clickable/copyable contract slot.
function spokeContract(detail?: EventProvDetail): Provenance["contract"] {
  if (!detail?.spokeAddress) return undefined;
  return { name: `Aave V4${detail.spokeName ? ` ${detail.spokeName}` : ""} spoke`, address: detail.spokeAddress };
}

// Emitted log fields carry third-party proof of their own: the tx's event logs.
// Point verify at Etherscan (a link-out, never a live read) when we have the tx.
function txVerify(detail?: EventProvDetail): ProvVerify | undefined {
  return detail?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", detail.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;
}

/** A live chain-state field (current balance, supply/debt total) read from
 *  Aave at the latest block via the spoke-position endpoint — a contract STATE
 *  read (`state`), not an emitted log field. */
export function chainTruthProv(what: string, field?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `${what} — what the spoke contract answers for this position at the latest block. It carries the interest accrued up to that block.`,
    contract: { name: "Aave V4 spoke" },
    via: field
      ? `${SPOKE_POSITION_VIA} · spoke getUserSuppliedAssets / getUserTotalDebt · ${field}`
      : `${SPOKE_POSITION_VIA} · spoke getUserSuppliedAssets / getUserTotalDebt`,
  };
}

/** A raw value read off one event log (the moved amount: suppliedAmount,
 *  drawnAmount, debtAmountRestored, …). `detail` carries the concrete
 *  coordinates (emitting spoke contract, tx, block, reserve) so the receipt
 *  shows the specific facts, not just a sentence. `log` names the emitted
 *  event ("Supply", "LiquidationCall") — the via line's anatomy, and the
 *  segment the Etherscan verify link rides. */
export function eventLogProv(what: string, field: string, detail?: EventProvDetail, log?: string): Provenance {
  const asset = detail?.asset ? ` (${detail.asset})` : "";
  // Envelope authoritative: the backend stamped this value's log anatomy
  // (event · param · raw · ÷10^scale) beside its SQL, so render that. The
  // caller's hand-written log/field strings survive only as the fallback for
  // pre-envelope API responses.
  const o = detail?.origin;
  const via = o
    ? `${INDEX_VIA} · ${o.event} log · ${fieldSeg(o.param, o.raw ?? detail?.raw)} · ÷10^${o.scale}`
    : `${INDEX_VIA} · ${log ? `${log} log · ` : ""}${fieldSeg(field, detail?.raw)}`;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(detail),
    summary: `${what}${asset} — the amount this event moved, as the spoke wrote it into the log${
      detail?.blockNumber != null ? ` at block ${detail.blockNumber}` : ""
    }.`,
    contract: spokeContract(detail),
    via,
    scaling: scalingOf(detail),
    inputs: eventInputs(detail),
  };
}

/** Third-party action: the position owner neither signed the transaction nor
 *  made the spoke call. Chain-derived over three chain facts — the tx
 *  envelope's sender, the spoke event's `caller` param (msg.sender,
 *  authorized for the user), and the owner (`user`) — each compared against
 *  the owner. V4 spokes emit a true caller on every action, so any of the
 *  five can mark; liquidation's actor is the liquidator instead. */
export function externalActorProv(
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  detail?: EventProvDetail,
): Provenance {
  const label = args.eventType.replace(/_/g, " ");
  return {
    kind: "chain-derived",
    pclass: "emitted",
    verify: txVerify(detail),
    summary: `This ${label} was executed by a third party — the position owner neither signed the transaction nor made the spoke call. The transaction sender and the spoke event's caller param (msg.sender, authorized for the user) are both chain facts${
      detail?.blockNumber != null ? ` at block ${detail.blockNumber}` : ""
    }; each is compared against the owner. Routed flows keep the owner as signer and contract-owned positions keep the owner as caller — this event has the owner as neither.`,
    contract: spokeContract(detail),
    via: `${INDEX_VIA} · tx envelope from + caller param vs user`,
    inputs: [
      { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved (user)" },
      {
        label: "transaction sender",
        value: args.txFrom,
        kind: "chain",
        note: "signed the transaction (tx envelope from)",
      },
      {
        label: "spoke caller",
        value: args.caller,
        kind: "chain",
        note: "msg.sender at the spoke (the event's caller param)",
      },
      ...eventInputs(detail),
    ],
  };
}

/** The running supply/debt balance carried on an event (`supplyAfter` /
 *  `debtAfter`). Unlike eventLogProv this is NOT a single log field — it is
 *  replayed: the signed sum of every amount the position's logs moved on this
 *  reserve, in on-chain (block, tx, log) order up to this event, and held at
 *  zero rather than allowed to go negative (server mig 207's
 *  `GREATEST(…, 0)`). `side` narrows the prose to the leg's log roster.
 *  Chain-derived (every input is an emitted amount), `indexed` pclass (the sum
 *  is our arithmetic — no single-slot third-party proof). */
export function snapshotProv(what: string, detail?: EventProvDetail, side?: "supply" | "debt"): Provenance {
  const asset = detail?.asset ? ` (${detail.asset})` : "";
  const meaning =
    side === "supply"
      ? "supplies add; withdrawals and the collateral a liquidator seized subtract"
      : side === "debt"
        ? "draws add; repayments and the debt a liquidator covered subtract"
        : "each event's moved amount adds or subtracts";
  const logs =
    side === "supply"
      ? "Supply/Withdraw/LiquidationCall logs"
      : side === "debt"
        ? "Borrow/Repay/LiquidationCall logs"
        : "the position's logs";
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `${what}${asset} — the position's balance on this reserve after this event, added up from the amounts its events moved (${meaning}) in the order the chain recorded them. The running total is held at zero where the amounts would take it below, and the interest accrued between events is missing from it.`,
    contract: spokeContract(detail),
    via: `${INDEX_VIA} · Σ ±amount across ${logs}${detail?.raw ? ` = ${detail.raw}` : ""} · in on-chain order`,
    inputs: eventInputs(detail),
  };
}

/** The single-number balance change surfaced by the before→after toggle — the
 *  position's balance after this event minus its balance before, in token
 *  units. Arithmetic over the two replayed balances, so chain-derived like
 *  them (matches the V3 vocabulary). `detail` scopes it to the reserve + event
 *  coordinates. The before/after balances themselves carry snapshotProv. */
export function deltaProv(detail?: EventProvDetail): Provenance {
  const asset = detail?.asset ? ` (${detail.asset})` : "";
  return {
    kind: "chain-derived",
    summary: `Balance change at this event${asset} — the balance after this event less the balance before, as one signed number. Both are replayed balances, so the change is what the position's events moved${
      detail?.blockNumber != null ? ` at block ${detail.blockNumber}` : ""
    }.`,
    contract: spokeContract(detail),
    via: "balance after − balance before",
    formula: "after − before",
    inputs: [
      { label: "balance before", kind: "chain-derived", pclass: "indexed", note: "replayed running balance" },
      { label: "balance after", kind: "chain-derived", pclass: "indexed", note: "replayed running balance" },
      ...eventInputs(detail),
    ],
  };
}

/** The borrow rate shown against each held debt — NOT a field of this event's
 *  log. The hub emits its instantaneous variable borrow rate (drawnRate,
 *  ray-scaled) on every UpdateAsset accrual; the index attaches the newest
 *  rate at or before this event's block, per reserve. So supply/withdraw
 *  events show the true held-debt rate too, not just the moved asset's. */
export function heldDebtRateProv(detail?: EventProvDetail): Provenance {
  const asset = detail?.asset ? ` (${detail.asset})` : "";
  const inputs: ProvInput[] = [];
  if (detail?.asset) inputs.push({ label: "reserve", value: detail.asset, kind: "chain" });
  if (detail?.blockNumber != null)
    inputs.push({
      label: "block",
      value: String(detail.blockNumber),
      kind: "chain",
      note: "rate read at or before this block",
    });
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `Borrow rate on the held debt${asset} — the variable rate the hub set for this asset the last time it accrued interest at or before this event's block. The hub writes the rate as a ray, so dividing by 10^27 gives the rate a year, where 10^27 is 100%.`,
    contract: { name: "Aave V4 hub" },
    via: `${INDEX_VIA} · hub UpdateAsset log · drawnRate · ÷10^27`,
    inputs,
  };
}

/** An aggregate accumulated over the spoke's event stream (lifetime flow, peak,
 *  tx count). Computed client-side from the indexed timeline — no extra fetch. */
export function accumProv(what: string, opts?: { formula?: string; inputs?: ProvInput[] }): Provenance {
  return {
    kind: "derived",
    summary: `${what} — added up across every event this position has on this spoke.`,
    via: "added up across the position's events on this spoke",
    formula: opts?.formula,
    inputs: opts?.inputs,
  };
}

/** Health factor — the spoke's calculation for this position, read live from
 *  getUserAccountData (the figure Aave's interface shows); falls back to a
 *  client-side calculation over the per-asset thresholds when the live read is
 *  unavailable. */
export function healthFactorProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary:
      "Health factor — the spoke's calculation for this position, read at the latest block, so it is the figure the spoke would liquidate on. When that read is unavailable the page calculates it from the balances and each asset's liquidation threshold.",
    contract: { name: "Aave V4 spoke" },
    via: `${SPOKE_POSITION_VIA} · spoke getUserAccountData · healthFactor · ÷10^18`,
  };
}

/** A figure calculated from chain-state balances and the per-asset thresholds
 *  the spoke reports — liquidation price, borrowing power, blended-threshold
 *  debt ceiling. The USD leg is Aave's oracle price, the figure the spoke
 *  values the position at, so the number tracks what Aave would liquidate on.
 *  An off-chain market price backstops an asset the oracle registry leaves
 *  out. (The hand-maintained LT table is gone — see
 *  lib/aave-v4/liquidation-thresholds.ts.) */
export function calcProv(what: string, opts?: { formula?: string; inputs?: ProvInput[] }): Provenance {
  return {
    kind: "derived",
    summary: `${what} — worked out in the browser from the position's collateral and debt, each asset weighted by the liquidation threshold the spoke reports for it, and valued at the price Aave's oracle answers.`,
    via: "calculateAaveV4Position · the spoke's thresholds · Aave's oracle price",
    formula: opts?.formula,
    inputs: [
      { label: "asset price", kind: "chain", pclass: "oracle", note: "Aave's oracle (getReservePrice)" },
      ...(opts?.inputs ?? []),
    ],
  };
}

// The position pane's three calculated-risk receipts, hosted HERE rather than
// inline in the pane component: receipts keep their value-epistemics — exact
// formulas and method names — and this vocabulary file is where that register
// lives (the Explanation surfaces are charter-swept and register-gated; a
// receipt embedded there would have to water its basis down).
/** The blended liquidation threshold — the risk strip's pivot figure. A
 *  bespoke summary rather than the calcProv template: the receipt must say
 *  what the WEIGHTING means, which the generic calculation boilerplate
 *  doesn't. */
export const BLENDED_LT_PROV: Provenance = {
  kind: "derived",
  summary:
    "The position's blended liquidation threshold — each collateral-enabled asset's threshold weighted by its dollar share of the basket, so a mixed basket reads as one figure; with one collateral asset it is that asset's threshold. The balances are the spoke's read, each threshold is what the spoke reports for that asset, and the dollar legs use the price Aave's oracle answers.",
  via: "Σ(collateral $ × threshold) ÷ Σ(collateral $) · spoke balances · Aave's oracle price",
  formula: "Σ(collateral USD × LT) ÷ Σ(collateral USD)",
  inputs: [
    {
      label: "collateral",
      kind: "chain",
      pclass: "state",
      note: "per-asset balances, collateral-enabled only (spoke read)",
    },
    {
      label: "liquidation threshold",
      kind: "chain",
      pclass: "state",
      note: "the threshold the spoke reports per asset",
    },
    { label: "asset price", kind: "chain", pclass: "oracle", note: "Aave's oracle (getReservePrice)" },
  ],
};

export const DEBT_CEILING_PROV = calcProv("The LT-weighted debt ceiling", {
  formula: "Σ(collateral × liquidation threshold)",
  inputs: [
    { label: "collateral", kind: "chain", pclass: "state", note: "per-asset supply balances (spoke read)" },
    {
      label: "liquidation threshold",
      kind: "chain",
      pclass: "state",
      note: "the threshold the spoke reports per asset",
    },
  ],
});
export const LIQ_PRICE_PROV = calcProv("The liquidation price", {
  formula: "price ÷ health factor",
  inputs: [{ label: "health factor", kind: "chain", pclass: "state", note: "spoke getUserAccountData" }],
});
export const LIQ_DROP_PROV = calcProv("The drop to liquidation", {
  formula: "price → liquidation price · 1 − 1 ÷ health factor",
  inputs: [
    {
      label: "liquidation price",
      kind: "derived",
      note: "calculated — price gap for a single collateral asset; the health-factor form covers a basket",
    },
    { label: "health factor", kind: "chain", pclass: "state", note: "spoke getUserAccountData" },
  ],
});

/** Interest carry — the chain-state current balance minus the principal
 *  (deposits) reduced from the event stream, valued at the current price. No
 *  annualized rate. The principal-side deposits come from the indexed logs. */
export function interestProv(what: string): Provenance {
  return {
    kind: "derived",
    summary: `${what} — the balance the spoke reports now less the amounts the position's events put in, valued at the price Aave's oracle answers. It is what the balance has grown by to date, with no rate assumed.`,
    via: "the spoke's balance − the amounts the position's events put in · Aave's oracle price",
    inputs: [
      { label: "current balance", kind: "chain", pclass: "state", note: "spoke-position read" },
      { label: "deposits", kind: "chain", pclass: "indexed", note: "the Supply/Repay amounts the logs recorded" },
      { label: "price", kind: "chain", pclass: "oracle", note: "Aave's oracle (getReservePrice)" },
    ],
  };
}

/** True when a price source is an on-chain read (Chainlink family, IAaveOracle,
 *  or Pendle's on-chain TWAP) rather than an off-chain pin/aggregate — the
 *  chain-derived vs off-chain distinction the chain-state gate keys on. */
export function isOnChainPriceSource(source: AaveV4PriceSource | null): boolean {
  return (
    source === "chainlink" ||
    source === "chainlink-eth-derived" ||
    source === "iaave-oracle" ||
    source === "pendle-twap"
  );
}

/** Provenance for an event-detail asset-price pill — the per-unit USD price the
 *  row states, tagged by its on-chain feed or off-chain pin, and — when the
 *  wire names the feed row's block — stated AT this event's block only when
 *  that is literally where the row was read. The price lane writes every
 *  registry asset at every event block, so the two blocks agree on nearly
 *  every row; where they differ the receipt names the earlier row and how far
 *  back it is (the lane states no price beyond 14,400 blocks). */
export function pricePillProv(
  symbol: string,
  source: AaveV4PriceSource,
  priceBlock?: number,
  eventBlock?: number,
): Provenance {
  const onChain = isOnChainPriceSource(source);
  const atBlock =
    priceBlock == null || eventBlock == null
      ? "at this event's block"
      : priceBlock === eventBlock
        ? `at this event's block ${eventBlock.toLocaleString("en-US")}`
        : `from the feed's newest row at block ${priceBlock.toLocaleString("en-US")}, ${(eventBlock - priceBlock).toLocaleString("en-US")} blocks before this event (no row of the feed at the event's block)`;
  const label =
    source === "chainlink"
      ? "a Chainlink feed. Aave's oracle reads this asset through one, and no V4 spoke lists it"
      : source === "chainlink-eth-derived"
        ? "two Chainlink feeds multiplied together, the asset's price in ETH and ETH's in dollars, because no feed quotes it in dollars"
        : source === "iaave-oracle"
          ? "Aave's oracle, which is what the spoke values this asset at. It answers in dollars with eight decimal places"
          : source === "pendle-twap"
            ? "Pendle's on-chain TWAP oracle, priced against the asset the principal token redeems for"
            : source === "stablecoin"
              ? "a pin to $1, a source no Aave V4 row has carried since September 2026"
              : "an approximation";
  return {
    kind: onChain ? "chain" : "offchain",
    pclass: onChain ? "oracle" : "offchain",
    summary: `${symbol} price ${atBlock} — from ${label}.`,
    via: priceBlock == null ? `price source · ${source}` : `price source · ${source} · block ${priceBlock}`,
  };
}

/** The live-price leg of a current-holding figure, named by whichever source
 *  answered for the asset at head: the V4 spoke oracle for an asset a spoke
 *  lists, a Chainlink feed for the registry assets none does, and the off-chain
 *  market feed where `source` is null because the registry omits the asset.
 *  An asset with no source at all gets no leg — see lib/aave-v4/unpriced.ts. */
export function livePriceInput(source: AaveV4PriceSource | null): ProvInput {
  const onChain = isOnChainPriceSource(source);
  return {
    label: "live price",
    kind: onChain ? "chain" : "offchain",
    pclass: onChain ? "oracle" : "offchain",
    note:
      source === "iaave-oracle"
        ? "Aave's oracle at head (getReservePrice on the spoke's AaveOracle), which is what the spoke values this asset at"
        : source === "chainlink"
          ? "a Chainlink USD feed at head — Aave's oracle reads this asset through one, and no V4 spoke lists it"
          : source === "chainlink-eth-derived"
            ? "two Chainlink feeds at head multiplied together, the asset's price in ETH and ETH's in dollars, because no feed quotes it in dollars"
            : source === "pendle-twap"
              ? "Pendle's on-chain TWAP oracle at head, priced against the asset the principal token redeems for"
              : "an off-chain market feed, which the page uses where the oracle registry omits the asset",
  };
}

/** A USD figure = token amount × resolved price. The amount's kind
 *  (chain-state balance vs. a figure summed from events) is passed through;
 *  the price is a named input. */
export function usdProv(
  what: string,
  opts: { amountLabel: string; amountKind: "chain" | "derived"; amountNote?: string; priceNote?: string },
): Provenance {
  return {
    kind: "derived",
    // The off-chain price leg is the weakest link, so the product inherits it.
    pclass: "offchain",
    summary: `${what} valued in USD — the token amount times the price the page resolved for the asset.`,
    via: "amount × price",
    formula: `${opts.amountLabel} × price`,
    inputs: [
      {
        label: opts.amountLabel,
        kind: opts.amountKind,
        pclass: opts.amountKind === "chain" ? "state" : "indexed",
        note: opts.amountNote,
      },
      {
        label: "price",
        kind: "offchain",
        pclass: "offchain",
        note: opts.priceNote ?? "an off-chain market feed",
      },
    ],
  };
}

/** The on-chain-priced sibling of {@link usdProv}: a chain-state token balance
 *  valued at Aave's oracle price (`getReservePrice` on the spoke's AaveOracle,
 *  served by /api/oracle/aave-v4). Both legs are on-chain, so the product is
 *  `chain-derived` and survives On-chain-values, where the DefiLlama-priced
 *  `usdProv` is `derived`. Used only when every asset in the total is
 *  oracle-priced; a partial total stays on `usdProv` (and middots) rather than
 *  assert an incomplete on-chain figure. */
export function usdProvOnchain(what: string): Provenance {
  return {
    kind: "chain-derived",
    // Both legs on-chain; the oracle price is the furthest class, so it leads.
    pclass: "oracle",
    summary: `${what} valued in USD — the balance the spoke reports, times the price Aave's oracle answers for the asset. Both legs come from the chain, and the price is the one the spoke values the position at.`,
    contract: { name: "Aave V4 oracle" },
    via: "the spoke's balance × Aave's oracle price",
    formula: "balance × oracle price",
    inputs: [
      { label: "balance", kind: "chain", pclass: "state", note: "spoke-position read" },
      { label: "oracle price", kind: "chain", pclass: "oracle", note: "Aave's oracle (getReservePrice)" },
    ],
  };
}
