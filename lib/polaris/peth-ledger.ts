// A Polaris pETH account (ui-jobs 865): the route's classified ledger rows
// as the page's words, its Type filter and its sums. Pure, and imports only
// types, so scripts/test/polaris-peth-ledger.test.mjs loads it directly
// (the three integer helpers are lib/polaris/sp-loan-math.ts's, restated).
//
// Each row carries a KIND (the rule the server picked for the transaction)
// and an EFFECT (what the kind does to the address's pETH: acquired, sold,
// paid as a fee, moved to another place it holds, earned, or gone). The
// timeline's Type filter offers the effects, each with its kinds beneath it
// (the shared umbrella legs, lib/shared/event-filter-helpers.ts), so a reader
// narrows by either.
//
// THE ETH FIGURES. ETH in and ETH out count only ETH and the reserve token
// (WETH) that left or reached the address. A PSM mint and a POLAR conversion
// carry an ETH valuation at their block, and a pETH arrival with no ETH
// (a gain, a reward, a plain receipt) its value at spot and at the floor at
// its block: each is labelled a valuation and never added into ETH out (Miles,
// 27 Nov 2026; the equity-at-the-feed ruling, TO-DO-polaris-scoping §10).

import type { PethEffect, PethLedgerLine, PethLedgerRow, PolarisPethResponse } from "../sources/api/polaris-peth";
import type { BaseActivityEvent } from "../shared/types/event-shape";

export const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");

export const big = (raw: string | null | undefined): bigint => {
  if (raw == null || raw === "") return ZERO;
  const i = raw.indexOf(".");
  return BigInt(i < 0 ? raw : raw.slice(0, i) || "0");
};

/** A raw 1e18 integer as a number of tokens. */
export const units = (v: bigint): number => {
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const n = Number(a / E18) + Number(a % E18) / 1e18;
  return neg ? -n : n;
};

/** A raw 1e18 integer as an exact decimal string. */
export const exactUnits = (v: bigint): string => {
  const neg = v < ZERO;
  const a = neg ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

export const PETH_ACTION_PREFIX = "peth.";

/** Each effect, in the order the Type filter lists them, with its name there
 *  and the word a row's receipt uses. */
export const PETH_EFFECTS: { key: PethEffect; label: string }[] = [
  { key: "acquisition", label: "Acquired" },
  { key: "sale", label: "Sold" },
  { key: "income", label: "Earned" },
  { key: "change_of_place", label: "Moved between places" },
  { key: "exit", label: "Left the address" },
  { key: "fee", label: "Fees" },
];

/** Each kind the server's classifier names (api/src/services/
 *  polaris-peth-ledger.ts, RULE_EFFECT), its effect and its row label. */
export const PETH_KINDS: Record<string, { effect: PethEffect; label: string }> = {
  curve_buy: { effect: "acquisition", label: "Bought on the curve" },
  curve_sell: { effect: "sale", label: "Sold to the curve" },
  curve_sell_fee: { effect: "fee", label: "Curve sale fee" },
  polar_conversion: { effect: "exit", label: "Converted to POLAR" },
  liquidation_income: { effect: "income", label: "Liquidation proceeds" },
  liquidated: { effect: "exit", label: "CDP liquidated" },
  psm_mint: { effect: "sale", label: "PSM mint" },
  psm_redeem: { effect: "acquisition", label: "PSM redeem" },
  cdp_deposit: { effect: "change_of_place", label: "Into a CDP" },
  cdp_withdraw: { effect: "change_of_place", label: "Out of a CDP" },
  sp_gain: { effect: "income", label: "Stability-pool gain" },
  svpeth_reward: { effect: "income", label: "svpETH reward" },
  surplus_claim: { effect: "change_of_place", label: "Surplus claimed" },
  split: { effect: "change_of_place", label: "Split" },
  merge: { effect: "change_of_place", label: "Merge" },
  fp_buy: { effect: "acquisition", label: "fpETH bought" },
  fp_redeem: { effect: "exit", label: "fpETH redeemed" },
  loan_collateral: { effect: "change_of_place", label: "Reserve-loan collateral" },
  lp_add: { effect: "change_of_place", label: "Liquidity added" },
  lp_remove: { effect: "change_of_place", label: "Liquidity removed" },
  venue_swap_in: { effect: "acquisition", label: "Bought on a pool" },
  venue_swap_out: { effect: "sale", label: "Sold on a pool" },
  zap_in: { effect: "acquisition", label: "Zap buy" },
  zap_out: { effect: "sale", label: "Zap sale" },
  wallet_receive: { effect: "acquisition", label: "Received from a wallet" },
  wallet_send: { effect: "exit", label: "Sent to a wallet" },
  contract_receive: { effect: "acquisition", label: "Received from a contract" },
  contract_send: { effect: "exit", label: "Sent to a contract" },
  transfer_in: { effect: "acquisition", label: "Received" },
  transfer_out: { effect: "exit", label: "Sent" },
  mint_other: { effect: "acquisition", label: "Minted" },
  burn_other: { effect: "exit", label: "Burned" },
  protocol_in: { effect: "acquisition", label: "From the protocol" },
  protocol_out: { effect: "exit", label: "To the protocol" },
};

const KIND_BY_LABEL = new Map(Object.entries(PETH_KINDS).map(([k, v]) => [v.label, k] as const));

/** A kind's row label; an unknown kind reads as its key. */
export const pethKindLabel = (kind: string): string => PETH_KINDS[kind]?.label ?? kind.replace(/_/g, " ");

/** The row's effect: the kind's, else the one the server sent. */
export const pethRowEffect = (r: Pick<PethLedgerRow, "kind" | "effect">): PethEffect =>
  PETH_KINDS[r.kind]?.effect ?? r.effect;

/** The Type filter's umbrella key for an effect. */
export const pethEffectKey = (effect: PethEffect): string => `${PETH_ACTION_PREFIX}${effect}`;

/** The umbrellas and their legs, for ACTION_LEGS: every kind under its effect. */
export const PETH_ACTION_LEGS: Record<string, { key: string; label: string }[]> = Object.fromEntries(
  PETH_EFFECTS.map((e) => [
    pethEffectKey(e.key),
    Object.entries(PETH_KINDS)
      .filter(([, v]) => v.effect === e.key)
      .map(([k, v]) => ({ key: `${pethEffectKey(e.key)}.${k}`, label: v.label })),
  ]),
);

/** The umbrellas' names in the Type filter. */
export const PETH_EFFECT_LABELS: Record<string, string> = Object.fromEntries(
  PETH_EFFECTS.map((e) => [pethEffectKey(e.key), e.label]),
);

/** An event's leg under its effect, read back from its row label; null for
 *  any event that is not a pETH ledger row. */
export function pethActionLegs(actionType: string, actionLabel: string): string[] | null {
  if (!actionType.startsWith(PETH_ACTION_PREFIX)) return null;
  const kind = KIND_BY_LABEL.get(actionLabel);
  return kind ? [`${actionType}.${kind}`] : null;
}

// ── Tokens ────────────────────────────────────────────────────────────────

export interface PethTokenNames {
  peth: { symbol: string; address: string };
  fpeth: { symbol: string; address: string };
  vpeth: { symbol: string; address: string };
  weth: { symbol: string; address: string };
}

/** A line's token as a symbol and address; an LP token names its venue's
 *  pool, and an address the deployment does not name stays an address. */
export function pethLineToken(
  token: string,
  names: PethTokenNames,
  venues: Record<string, { address: string }>,
): { symbol: string; address: string } {
  if (token === "peth" || token === "fpeth" || token === "vpeth") return names[token];
  if (token.startsWith("lp_")) {
    const key = {
      lp_tripool: "venue_curve_tripool",
      lp_polar_peth: "venue_univ2_polar_peth",
      lp_peth_weth: "venue_univ2_peth_weth",
    }[token];
    return { symbol: "LP", address: (key && venues[key]?.address) || token };
  }
  const t = token.toLowerCase();
  if (t === names.weth.address) return names.weth;
  for (const n of [names.peth, names.fpeth, names.vpeth]) if (t === n.address) return n;
  return { symbol: `${t.slice(0, 6)}…${t.slice(-4)}`, address: t };
}

// ── Figures ───────────────────────────────────────────────────────────────

/** The headline figures, each null where its read did not answer: the
 *  ledger's while the lane reads the history, the head's without a chain
 *  read. */
export interface PethHeadlines {
  ethIn: bigint | null;
  ethOut: bigint | null;
  curveFees: bigint | null;
  pethHeld: bigint | null;
  atSpot: bigint | null;
  atFloor: bigint | null;
  spot: bigint | null;
  floor: bigint | null;
}

const orNull = (raw: string | null | undefined): bigint | null => (raw == null ? null : big(raw));

/** Whether the answer serves the ledger: its status is "ok" and the lane
 *  has read the whole history. An answer before the fix round states
 *  neither and served the whole ledger. */
export const pethLedgerComplete = (d: Pick<PolarisPethResponse, "ledger" | "status">): boolean =>
  (d.status == null || d.status === "ok") && d.ledger?.complete !== false;

/** The ledger is served with its freshness unchecked: the head was not read,
 *  so the lane's reach was not compared with it. */
export const pethLedgerUnchecked = (d: Pick<PolarisPethResponse, "ledger" | "status">): boolean =>
  pethLedgerComplete(d) && d.ledger != null && d.ledger.complete === null;

/** How far the stored ledger reaches. */
export const pethScannedTo = (d: Pick<PolarisPethResponse, "ledger" | "scanned_to_block">): string | null =>
  d.ledger?.scanned_to_block ?? d.scanned_to_block ?? null;

/** Why the ledger is not served: still being read, or too heavy to replay. */
export const pethLedgerGap = (d: Pick<PolarisPethResponse, "ledger" | "status">): "reading" | "too_heavy" | null =>
  d.status === "too_heavy" ? "too_heavy" : pethLedgerComplete(d) ? null : "reading";

/** Whether the head reads answered. */
export const pethHeadRead = (d: Pick<PolarisPethResponse, "head">): boolean => d.head != null && d.head.block != null;

export function pethHeadlines(d: PolarisPethResponse): PethHeadlines {
  const complete = pethLedgerComplete(d);
  const ledger = (raw: string | null | undefined) => (complete ? orNull(raw) : null);
  const held = orNull(d.figures.peth_held.head_raw ?? d.figures.peth_held.raw);
  const spot = orNull(d.prices.spot_raw);
  const floor = orNull(d.prices.floor_raw);
  return {
    ethIn: ledger(d.figures.eth_in.raw),
    ethOut: ledger(d.figures.eth_out.raw),
    curveFees: ledger(d.figures.curve_fees_paid.raw),
    pethHeld: held,
    atSpot: held != null && spot != null ? (held * spot) / E18 : null,
    atFloor: held != null && floor != null ? (held * floor) / E18 : null,
    spot,
    floor,
  };
}

// ── The places the pETH sits ──────────────────────────────────────────────

export interface PethPlaces {
  wallet: bigint | null;
  cdp: {
    total: bigint;
    items: { market: "usdp" | "goldp"; id: string; raw: bigint; block: string; tx: string }[];
  } | null;
  sp: {
    total: bigint;
    items: { market: "usdp" | "goldp"; id: string; raw: bigint; block: string; tx: string }[];
  } | null;
  loans: { total: bigint; items: { id: string; raw: bigint; block: string }[] } | null;
  fpeth: { raw: bigint; atFloor: bigint | null } | null;
  lp: { venue: string; address: string; share: bigint | null; lp: bigint | null }[];
  vpeth: bigint | null;
}

export function pethPlaces(d: PolarisPethResponse): PethPlaces {
  const r = d.rollup;
  const items = <T>(xs: T[] | null | undefined): T[] | null => (xs == null ? null : xs);
  const cdp = items(r.cdp_collateral.items);
  const sp = items(r.sp_peth.items);
  const loans = items(r.loans_fpeth.items);
  const fp = orNull(r.wallet_fpeth.raw);
  return {
    wallet: orNull(r.wallet_peth.raw),
    cdp: cdp
      ? {
          total: big(r.cdp_collateral.raw),
          items: cdp.map((c) => ({
            market: c.market,
            id: c.cdp_id,
            raw: big(c.coll_raw),
            block: c.as_of_block,
            tx: c.as_of_tx,
          })),
        }
      : null,
    sp: sp
      ? {
          total: big(r.sp_peth.raw),
          items: sp.map((s) => ({
            market: s.market,
            id: s.token_id,
            raw: big(s.peth_raw),
            block: s.as_of_block,
            tx: s.as_of_tx,
          })),
        }
      : null,
    loans: loans
      ? {
          total: big(r.loans_fpeth.raw),
          items: loans.map((l) => ({ id: l.loan_id, raw: big(l.fpeth_raw), block: l.opened_block })),
        }
      : null,
    fpeth: fp == null ? null : { raw: fp, atFloor: orNull(r.wallet_fpeth.at_floor_raw) },
    lp: r.lp.map((x) => ({
      venue: x.venue,
      address: x.address,
      share: orNull(x.peth_share_raw),
      lp: orNull(x.lp_balance_raw),
    })),
    vpeth: orNull(r.wallet_vpeth.raw),
  };
}

// ── A row ─────────────────────────────────────────────────────────────────

/** The row's key on the page: its transaction (one row per transaction). */
export const pethRowId = (r: Pick<PethLedgerRow, "tx_hash">): string => r.tx_hash.toLowerCase();

/** The row's lines in the address's own tokens, with an amount. */
export const pethRowLines = (r: PethLedgerRow): PethLedgerLine[] => r.lines.filter((l) => big(l.amount_raw) > ZERO);

/** A raw amount in words for prose: four significant digits below one. */
export function pethAmountText(raw: bigint): string {
  const n = units(raw < ZERO ? -raw : raw);
  if (n === 0) return "0";
  return n >= 1
    ? n.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** The row's Explanation bullets, one fact each. */
export function pethRowBullets(r: PethLedgerRow, names: PethTokenNames): string[] {
  const out: string[] = [];
  const P = names.peth.symbol;
  const ethIn = big(r.eth_in_raw);
  const ethOut = big(r.eth_out_raw);
  const fee = big(r.curve_fee_raw);
  const d = big(r.peth_delta_raw);
  if (d > ZERO) out.push(`${pethAmountText(d)} ${P} reached this address.`);
  if (d < ZERO) out.push(`${pethAmountText(d)} ${P} left this address.`);
  for (const [raw, sym] of [
    [big(r.fpeth_delta_raw), names.fpeth.symbol],
    [big(r.vpeth_delta_raw), names.vpeth.symbol],
  ] as const) {
    if (raw > ZERO) out.push(`${pethAmountText(raw)} ${sym} reached this address.`);
    if (raw < ZERO) out.push(`${pethAmountText(raw)} ${sym} left this address.`);
  }
  if (ethIn > ZERO) out.push(`This address paid ${pethAmountText(ethIn)} ETH, counted in ETH in.`);
  if (ethOut > ZERO) out.push(`${pethAmountText(ethOut)} ETH reached this address, counted in ETH out.`);
  if (fee > ZERO) out.push(`The curve charged ${pethAmountText(fee)} ${P} as its fee.`);
  const v = r.valuation;
  if (v) {
    if (!v.price_at_block_filled) out.push("Its value at its block is not read yet.");
    else if (v.kind === "psm_mint" && v.eth_raw != null)
      out.push(
        `The stablecoin it minted was worth ${pethAmountText(big(v.eth_raw))} ETH then, a valuation left out of ETH out.`,
      );
    else if (v.kind === "polar_conversion" && v.eth_raw != null)
      out.push(
        `The ${P} it gave up was worth ${pethAmountText(big(v.eth_raw))} ETH at the floor then, a valuation left out of ETH out.`,
      );
    else if (v.kind === "peth_arrival" && v.eth_at_spot_raw != null && v.eth_at_floor_raw != null)
      out.push(
        `The ${P} that arrived with no ETH paid was worth ${pethAmountText(big(v.eth_at_spot_raw))} ETH at spot and ${pethAmountText(big(v.eth_at_floor_raw))} ETH at the floor then.`,
      );
  }
  return out;
}

/** A row as the shared timeline's event: its effect is the Type filter's
 *  umbrella, its kind the label (and the leg beneath), its lines the flows
 *  the Asset filter reads. */
export function pethTimelineEvent(
  r: PethLedgerRow,
  names: PethTokenNames,
  venues: Record<string, { address: string }>,
): BaseActivityEvent {
  return {
    id: pethRowId(r),
    txHash: r.tx_hash,
    blockNumber: Number(r.block_number),
    timestamp: Number(r.block_timestamp ?? 0),
    wallet: "",
    actionType: pethEffectKey(pethRowEffect(r)),
    actionLabel: pethKindLabel(r.kind),
    flows: pethRowLines(r).map((l) => {
      const t = pethLineToken(l.token, names, venues);
      return {
        token: t.address,
        tokenSymbol: t.symbol,
        tokenDecimals: 18,
        amount: l.amount_raw,
        amountFormatted: units(big(l.amount_raw)),
        direction: l.direction,
        counterparty: l.counterparty,
      };
    }),
    etherscanUrl: `https://sepolia.etherscan.io/tx/${r.tx_hash}`,
  };
}
