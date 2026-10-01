// Lifetime flows for a Frankencoin position (one Position contract): the
// page's MintingUpdate rows replayed into the day rows the Lifetime flows
// panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Frankencoin").
// ----------------------------------------------------------------------------
// Each side in its own token. Frankencoin runs no oracle, so nothing prices
// the collateral in ZCHF: the collateral bar is in the position's collateral
// token and the debt bar in ZCHF, each on its own axis
// (`FlowTimeline.sideUnits`). The owner-declared price is no market price
// (rails-ops reference/pricing.md) and values nothing here.
//
// Every MintingUpdate states the position's collateral and debt after it
// (absolutes), so each row's act is its figure less the running figure the
// rows before left:
//
//     collateral after − collateral the row before left = deposited (above
//                                                         zero) or withdrawn
//     minted after − minted the row before left         = minted or repaid
//
// A row written in a challenge sale's or a forced sale's transaction is the
// sale (`auction_settlement`): its falls are "Sold by challenge" / "Cleared by
// challenge sale", or "Sold at expiry" / "Cleared by forced sale" (rails-ops
// standards/lexicon.md). The V1 clone-creation row understates its
// collateral (`collateralUnderstated`); its collateral is not read, and the
// next row's rise books the clone's deposit.
//
// Nothing accrues: interest is charged up front at each mint, so the debt
// moves only on a row and between rows each side stays as its last row left
// it. A mint's split comes from its transaction's receipt
// (/api/chain/frankencoin/event, the card's read): what the wallet received,
// the reserve share (minted to the reserve, released on repayment) and the
// interest for the remaining term (the Profit log), which add to the debt the
// mint added to the base unit. A repayment's split is what the payer paid and
// the reserve share the reserve gave back. A mint or repayment whose receipt
// was not read, or does not add to the row's move, stays whole on its own
// line ("Minted, split not read").
//
// Pure: tested offline in scripts/verify/verify-frankencoin-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, FrankencoinContext, FrankencoinEventType } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const ZCHF_DECIMALS = 18;
/** A debt move below a millionth of a ZCHF, in base units: no receipt is read
 *  for it (lib/frankencoin/use-event-read.ts compares the decimal figures). */
const SPLIT_DUST = BigInt(1_000_000_000_000);

/** Bucket keys. */
export const FC = {
  deposited: "fc-deposited",
  withdrawn: "fc-withdrawn",
  soldChallenge: "fc-sold-challenge",
  soldForced: "fc-sold-forced",
  paidOut: "fc-paid-out",
  reserve: "fc-reserve",
  interest: "fc-interest",
  minted: "fc-minted",
  repaid: "fc-repaid",
  reserveBack: "fc-reserve-back",
  repaidWhole: "fc-repaid-whole",
  clearedChallenge: "fc-cleared-challenge",
  clearedForced: "fc-cleared-forced",
} as const;

const COLL_KEYS = new Set<string>([FC.deposited, FC.withdrawn, FC.soldChallenge, FC.soldForced]);
const OUT_KEYS = new Set<string>([
  FC.withdrawn,
  FC.soldChallenge,
  FC.soldForced,
  FC.repaid,
  FC.reserveBack,
  FC.repaidWhole,
  FC.clearedChallenge,
  FC.clearedForced,
]);
const SALE_KEYS = new Set<string>([FC.soldChallenge, FC.soldForced, FC.clearedChallenge, FC.clearedForced]);

/** The buckets in drawing order. */
export function frankencoinFlowBuckets(): FlowBucket[] {
  return [
    { key: FC.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: FC.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
    // Frankencoin has no liquidation: a challenge that nobody averts sells
    // the position's collateral in its second phase, and an expired
    // position's collateral can be sold by anyone (standards/lexicon.md).
    {
      key: FC.soldChallenge,
      label: "Sold by challenge",
      event: "Challenge sale",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "fc-challenge",
    },
    {
      key: FC.soldForced,
      label: "Sold at expiry",
      event: "Forced sale",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "cross",
      link: "fc-forced",
    },
    // A mint's three parts, from its receipt: they add to the debt it added.
    { key: FC.paidOut, label: "Paid out", event: "Mint", side: "debt", dir: "in" },
    { key: FC.reserve, label: "Reserve share", event: "", side: "debt", dir: "in", hatch: "checker" },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md);
    // Frankencoin charges it at the mint, for the term left.
    { key: FC.interest, label: "Interest paid up front", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: FC.minted, label: "Minted, split not read", event: "Mint", side: "debt", dir: "in", hatch: "grid" },
    { key: FC.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
    { key: FC.reserveBack, label: "Reserve share returned", event: "", side: "debt", dir: "out", hatch: "vertical" },
    {
      key: FC.repaidWhole,
      label: "Repaid, split not read",
      event: "Repay",
      side: "debt",
      dir: "out",
      hatch: "horizontal",
    },
    {
      key: FC.clearedChallenge,
      label: "Cleared by challenge sale",
      event: "Challenge sale",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "fc-challenge",
    },
    {
      key: FC.clearedForced,
      label: "Cleared by forced sale",
      event: "Forced sale",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "cross",
      link: "fc-forced",
    },
  ];
}

/** What sold a sale row's collateral. */
export type FrankencoinSaleKind = "challenge" | "forced";

/** One MintingUpdate row of the position's history, in base units. */
export interface FrankencoinFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: FrankencoinEventType;
  /** A row written by a sale, and which. */
  sale: FrankencoinSaleKind | null;
  /** The figures after the row, where it states them. */
  collAfter: bigint | null;
  mintedAfter: bigint | null;
  /** The figures before it, as the row (or the page's opening read) states
   *  them; a row before that disagrees with the replay is counted. */
  collBefore: bigint | null;
  mintedBefore: bigint | null;
  /** The V1 clone-creation row, whose collateral figure understates. */
  understated: boolean;
  collDecimals: number;
  /** The receipt's split of the ZCHF that moved, where it was read. */
  split: FrankencoinSplit | null;
}

/** A receipt's split of a mint and of a repayment, base units of ZCHF; the
 *  row's direction says which applies (a roll's transaction holds both). */
export interface FrankencoinSplit {
  mint: { received: bigint; reserve: bigint; interest: bigint } | null;
  repay: { paid: bigint; reserveBack: bigint } | null;
}

const big = (v: string | undefined | null): bigint | null => {
  if (v == null || v === "") return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
};

/** A decimal string ("600000", "259529.89…") as base units. */
export function decimalUnits(v: string | null | undefined, decimals: number): bigint | null {
  if (v == null || v === "") return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return null;
  const frac = (m[3] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const n = BigInt(m[2] + frac);
  return m[1] === "-" ? -n : n;
}

/** The ledger rows: the MintingUpdate kinds, and an original's Open row once
 *  the page's opening read put its deposit on it. */
const LEDGER_KINDS = new Set<FrankencoinEventType>([
  "open",
  "clone",
  "mint",
  "repay",
  "add_collateral",
  "withdraw_collateral",
  "adjust",
  "adjust_price",
  "auction_settlement",
  "close",
]);

type FrankEvent = BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } };

/** The page's rows as the replay reads them, oldest first (a stable sort, so
 *  the served log order holds inside a block): every row that states a
 *  balance, each with its receipt's split where `reads` has it (keyed by the
 *  event id). */
export function frankencoinFlowEvents(
  events: BaseActivityEvent[],
  reads?: Map<string, FrankencoinEventRead | null> | null,
): FrankencoinFlowEvent[] {
  const fc = events.filter(isFrankencoinEvent) as FrankEvent[];
  // Which sale wrote a transaction's rows.
  const saleOf = new Map<string, FrankencoinSaleKind>();
  for (const e of fc) {
    const k = e.context.data.eventType;
    if (!e.txHash) continue;
    if (k === "forced_sale") saleOf.set(e.txHash.toLowerCase(), "forced");
    else if (k === "challenge_succeeded" && !saleOf.has(e.txHash.toLowerCase()))
      saleOf.set(e.txHash.toLowerCase(), "challenge");
  }
  const rows = fc
    .filter((e) => {
      const c = e.context.data;
      return LEDGER_KINDS.has(c.eventType) && (c.raw?.collateral != null || c.raw?.minted != null);
    })
    .slice()
    .sort((a, b) => a.blockNumber - b.blockNumber);
  return rows.map((e) => {
    const c = e.context.data;
    const tx = e.txHash ? e.txHash.toLowerCase() : undefined;
    const read = reads?.get(e.id) ?? null;
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx,
      kind: c.eventType,
      sale: c.eventType === "auction_settlement" ? ((tx ? saleOf.get(tx) : undefined) ?? "challenge") : null,
      collAfter: c.collateralUnderstated ? null : big(c.raw?.collateral),
      mintedAfter: big(c.raw?.minted),
      collBefore: big(c.raw?.collateralBefore),
      mintedBefore: big(c.raw?.mintedBefore),
      understated: c.collateralUnderstated === true,
      collDecimals: c.collateralDecimals,
      split: read ? splitOf(read) : null,
    };
  });
}

/** The receipt's split, in base units; null where it holds none. */
function splitOf(read: FrankencoinEventRead): FrankencoinSplit | null {
  if (read.shared) return null;
  const out = decimalUnits(read.mintedOut, ZCHF_DECIMALS) ?? ZERO;
  const toReserve = decimalUnits(read.mintedToReserve, ZCHF_DECIMALS) ?? ZERO;
  const interest = decimalUnits(read.interest, ZCHF_DECIMALS);
  const mint =
    (out > ZERO || toReserve > ZERO) && interest != null && interest <= toReserve
      ? { received: out, reserve: toReserve - interest, interest }
      : null;
  const burned = decimalUnits(read.burnedFromPayer, ZCHF_DECIMALS) ?? ZERO;
  const back = decimalUnits(read.reserveReturned, ZCHF_DECIMALS) ?? ZERO;
  const fromReserve = decimalUnits(read.burnedFromReserve, ZCHF_DECIMALS) ?? ZERO;
  const repay = burned > ZERO || fromReserve > ZERO ? { paid: burned - back, reserveBack: back + fromReserve } : null;
  return mint || repay ? { mint, repay } : null;
}

/** A replayed row's legs in tokens, by bucket. */
export interface FrankencoinReplayed {
  ev: FrankencoinFlowEvent;
  legs: { bucket: string; amount: number }[];
  /** Balances after the row, tokens. */
  coll: number;
  debt: number;
  collRaw: bigint;
  debtRaw: bigint;
  /** The row's stated figure before it disagreed with what the rows before
   *  left (a move no row recorded), by side. */
  gap: { coll: bigint; debt: bigint };
  /** The debt moved and the receipt's split did not add to it, or was not read. */
  unsplit: boolean;
}

const human = (v: bigint, decimals: number): number => Number(v) / 10 ** decimals;

/** The per-row replay, in base units. */
export function replayFrankencoin(events: FrankencoinFlowEvent[]): FrankencoinReplayed[] {
  let coll = ZERO;
  let debt = ZERO;
  const out: FrankencoinReplayed[] = [];
  for (const ev of events) {
    const cd = ev.collDecimals;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, raw: bigint, decimals: number) => {
      if (raw <= ZERO) return;
      const amount = human(raw, decimals);
      if (amount > DUST) legs.push({ bucket, amount });
    };
    const gap = { coll: ZERO, debt: ZERO };

    // Collateral: the row's figure less what the rows before left.
    let collAfter = coll;
    if (ev.collAfter != null) {
      if (ev.collBefore != null) gap.coll = ev.collBefore - coll;
      const act = ev.collAfter - coll;
      if (act > ZERO) add(FC.deposited, act, cd);
      else if (ev.sale === "forced") add(FC.soldForced, -act, cd);
      else if (ev.sale === "challenge") add(FC.soldChallenge, -act, cd);
      else add(FC.withdrawn, -act, cd);
      collAfter = ev.collAfter;
    }

    // Debt: the same, split by the receipt where it adds to the move.
    let debtAfter = debt;
    let unsplit = false;
    if (ev.mintedAfter != null) {
      if (ev.mintedBefore != null) gap.debt = ev.mintedBefore - debt;
      const act = ev.mintedAfter - debt;
      const m = ev.split?.mint;
      const p = ev.split?.repay;
      if (act > ZERO) {
        if (ev.sale == null && m && m.received + m.reserve + m.interest === act) {
          add(FC.paidOut, m.received, ZCHF_DECIMALS);
          add(FC.reserve, m.reserve, ZCHF_DECIMALS);
          add(FC.interest, m.interest, ZCHF_DECIMALS);
        } else if (ev.sale == null && act < SPLIT_DUST) {
          // A move below a millionth of a ZCHF has no receipt read (the card
          // reads none): it is its own paid-out part.
          add(FC.paidOut, act, ZCHF_DECIMALS);
        } else {
          add(FC.minted, act, ZCHF_DECIMALS);
          unsplit = true;
        }
      } else if (act < ZERO) {
        if (ev.sale === "forced") add(FC.clearedForced, -act, ZCHF_DECIMALS);
        else if (ev.sale === "challenge") add(FC.clearedChallenge, -act, ZCHF_DECIMALS);
        else if (p && p.paid + p.reserveBack === -act && p.paid >= ZERO) {
          add(FC.repaid, p.paid, ZCHF_DECIMALS);
          add(FC.reserveBack, p.reserveBack, ZCHF_DECIMALS);
        } else if (-act < SPLIT_DUST) {
          add(FC.repaid, -act, ZCHF_DECIMALS);
        } else {
          add(FC.repaidWhole, -act, ZCHF_DECIMALS);
          unsplit = true;
        }
      }
      debtAfter = ev.mintedAfter;
    }

    out.push({
      ev,
      legs,
      coll: human(collAfter, cd),
      debt: human(debtAfter, ZCHF_DECIMALS),
      collRaw: collAfter,
      debtRaw: debtAfter,
      gap,
      unsplit,
    });
    coll = collAfter;
    debt = debtAfter;
  }
  return out;
}

/** What the page's live read states now, where it has one. */
export interface FrankencoinLive {
  /** balanceOf(position) and minted(), tokens. */
  coll?: number | null;
  debt?: number | null;
}

export interface FrankencoinFlowOptions {
  collSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The position is open (the page's verdict). */
  open: boolean;
  live: FrankencoinLive | null;
}

/** The replay with each side's grain, for the timeline, the cards and the tests. */
export interface FrankencoinFlowReplay {
  replayed: FrankencoinReplayed[];
  /** Grains per token of each side: the model's figures are the token × this. */
  grain: { collateral: number; debt: number };
  scale: { collateral: number; debt: number };
}

const legOf = (r: FrankencoinReplayed, k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;

export function frankencoinFlowReplay(
  events: FrankencoinFlowEvent[],
  o: FrankencoinFlowOptions,
): FrankencoinFlowReplay {
  const replayed = replayFrankencoin(events);
  // Each side's scale: about five significant digits of the largest figure
  // its bar can reach, in its token.
  const peak = { collateral: 0, debt: 0 };
  const total = { collateral: 0, debt: 0 };
  for (const r of replayed) {
    for (const l of r.legs) {
      if (OUT_KEYS.has(l.bucket)) continue;
      total[COLL_KEYS.has(l.bucket) ? "collateral" : "debt"] += l.amount;
    }
    peak.collateral = Math.max(peak.collateral, total.collateral, r.coll);
    peak.debt = Math.max(peak.debt, total.debt, r.debt);
  }
  peak.collateral = Math.max(peak.collateral, o.live?.coll ?? 0);
  peak.debt = Math.max(peak.debt, o.live?.debt ?? 0);
  const scale = { collateral: unitScaleFor(peak.collateral), debt: unitScaleFor(peak.debt) };
  return {
    replayed,
    grain: { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt },
    scale,
  };
}

const COLL = "coll";
const DEBT = "debt";

/** The position's rows as the Lifetime flows panel's timeline: the
 *  collateral in its token, the debt in ZCHF. Null with no rows. */
export function frankencoinFlowTimeline(
  events: FrankencoinFlowEvent[],
  o: FrankencoinFlowOptions,
): FlowTimeline | null {
  if (events.length === 0) return null;
  const rp = frankencoinFlowReplay(events, o);
  const { replayed, grain: G, scale } = rp;
  const buckets = frankencoinFlowBuckets().filter((b) => {
    // The fallback lines only where a mint or repayment was not split.
    if (b.key === FC.minted || b.key === FC.repaidWhole) return replayed.some((r) => legOf(r, b.key) > 0);
    return true;
  });
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const sale = r.legs.some((l) => SALE_KEYS.has(l.bucket));
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      // A sale is a change the owner did not make: Frankencoin has no
      // liquidation, so its day reads as caution, not as one.
      tick: sale ? "caution" : moved.coll && moved.debt ? "both" : moved.debt ? "debt" : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * G.collateral, symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount * G.debt, symbol: "ZCHF" },
      ),
      tx: r.ev.tx,
      countsTx: r.ev.sale == null,
      balances: [
        { asset: COLL, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.coll) },
        { asset: DEBT, symbol: "ZCHF", side: "debt", amount: Math.max(0, r.debt) },
      ],
      prices: [
        { asset: COLL, usd: G.collateral },
        { asset: DEBT, usd: G.debt },
      ],
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = o.open && (last.coll > DUST || last.debt > DUST);
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const endDay = open ? Math.max(today, Math.floor(last.ev.ts / DAY_S) + 1) : Math.floor(last.ev.ts / DAY_S) + 1;

  // Now: the live read where the page has one, else the last row.
  const nowColl = open ? (o.live?.coll ?? last.coll) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debt) : 0;

  // Each side's "price" is its grain, the same every day: nothing values one
  // side in the other, and nothing grows between rows.
  const collObs: [number, number][] = [];
  const debtObs: [number, number][] = [];
  for (let d = firstDay; d <= endDay; d++) {
    collObs.push([d, G.collateral]);
    debtObs.push([d, G.debt]);
  }

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowColl > DUST)
      assets.push({ side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * G.collateral });
    if (nowDebt > DUST) assets.push({ side: "debt", symbol: "ZCHF", amount: nowDebt, usd: nowDebt * G.debt });
  }

  return {
    unit: { symbol: "ZCHF", scale: scale.debt },
    sideUnits: {
      collateral: { symbol: o.collSymbol, scale: scale.collateral },
      debt: { symbol: "ZCHF", scale: scale.debt },
    },
    buckets,
    days,
    live: {
      collateralUsd: nowColl * G.collateral,
      debtUsd: nowDebt * G.debt,
      assets,
    },
    todayPrices: { [COLL]: G.collateral, [DEBT]: G.debt },
    dailyPrices: { [COLL]: collObs, [DEBT]: debtObs },
    seriesCarry: true,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: frankencoinFlowWords(o.collSymbol),
  };
}

/** The panel's words for a Frankencoin position. */
export function frankencoinFlowWords(collSymbol: string): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still held",
    restBySide: {
      collateral: "Moved without a ledger row",
      debt: "Moved without a ledger row",
    },
    restNote: {
      collateral: `${collSymbol} the position's balance gained or lost with no MintingUpdate recording it`,
      debt: "a change in the debt no MintingUpdate records",
    },
    basis: {
      collateral: `Every figure is in ${collSymbol}, the position's collateral; Frankencoin has no price oracle, so nothing values it in ZCHF.`,
      debt: "Every figure is in ZCHF, the debt's gross amount.",
    },
    heldBasis: {
      collateral: `the ${collSymbol} the position held after its last ledger row.`,
      debt: "the ZCHF owed after the last ledger row. Interest is paid at each mint, so nothing accrues between rows.",
    },
    linePrices: `with the collateral in ${collSymbol} and the debt in ZCHF, each on its own scale`,
    moment: {
      tokensOnly: ["collateral", "debt"],
      notes: [
        `Frankencoin has no price oracle: the collateral is stated in ${collSymbol} and the debt in ZCHF. Interest is paid up front at each mint, so neither side moves between ledger rows.`,
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (each side's grains) and in
 *  tokens. Each side's figure just before and once the row's transaction had
 *  run is the transaction's last row's balance, less the transaction's acts. */
export function frankencoinFocusEvents(rp: FrankencoinFlowReplay, collSymbol: string): FocusEvent[] {
  const { replayed, grain: G } = rp;
  const byTx = new Map<string, FrankencoinReplayed[]>();
  for (const r of replayed) {
    const k = r.ev.tx ?? r.ev.id;
    const list = byTx.get(k);
    if (list) list.push(r);
    else byTx.set(k, [r]);
  }
  return replayed.map((r) => {
    const tx = byTx.get(r.ev.tx ?? r.ev.id) ?? [r];
    const lastOf = tx[tx.length - 1];
    let collMove = 0;
    let debtMove = 0;
    for (const t of tx)
      for (const l of t.legs) {
        const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, lastOf.coll);
    const debtHeld = Math.max(0, lastOf.debt);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * G.collateral, amount: l.amount, symbol: collSymbol }
          : { bucket: l.bucket, usd: l.amount * G.debt, amount: l.amount, symbol: "ZCHF" },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * G.collateral,
          after: collHeld * G.collateral,
          amount: collMove,
          symbol: collSymbol,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G.debt,
          after: debtHeld * G.debt,
          amount: debtMove,
          symbol: "ZCHF",
          held: debtHeld,
        },
      },
    };
  });
}

/** What the Explanation counts. */
export interface FrankencoinFlowFacts {
  rows: number;
  /** Mints and repayments split by their receipt, and those left whole. */
  splitMints: number;
  splitRepays: number;
  unsplitMints: number;
  unsplitRepays: number;
  /** ZCHF over the life, by part. */
  interest: number;
  reserve: number;
  reserveBack: number;
  /** Sale rows by kind. */
  challengeSales: number;
  forcedSales: number;
  /** Rows whose stated figure before disagreed with the replay, by side. */
  collGaps: number;
  debtGaps: number;
  /** The V1 clone-creation row with an understated collateral figure. */
  understated: number;
  /** Today's live read against the last row, where they differ. */
  liveGap: { coll: number; debt: number } | null;
}

export function frankencoinFlowFacts(
  rp: FrankencoinFlowReplay,
  live: FrankencoinLive | null,
  open: boolean,
): FrankencoinFlowFacts {
  const r = rp.replayed;
  const has = (k: string) => r.filter((x) => legOf(x, k) > 0).length;
  const sum = (k: string) => r.reduce((a, x) => a + legOf(x, k), 0);
  const last = r[r.length - 1];
  let liveGap: FrankencoinFlowFacts["liveGap"] = null;
  if (open && last && live) {
    const dc = (live.coll ?? last.coll) - last.coll;
    const dd = (live.debt ?? last.debt) - last.debt;
    const tol = (v: number) => Math.max(1e-9, Math.abs(v) * 1e-9);
    if (Math.abs(dc) > tol(last.coll) || Math.abs(dd) > tol(last.debt)) liveGap = { coll: dc, debt: dd };
  }
  return {
    rows: r.length,
    splitMints: r.filter((x) => legOf(x, FC.paidOut) + legOf(x, FC.reserve) + legOf(x, FC.interest) > 0).length,
    splitRepays: r.filter((x) => legOf(x, FC.repaid) > 0 || legOf(x, FC.reserveBack) > 0).length,
    unsplitMints: has(FC.minted),
    unsplitRepays: has(FC.repaidWhole),
    interest: sum(FC.interest),
    reserve: sum(FC.reserve),
    reserveBack: sum(FC.reserveBack),
    challengeSales: r.filter((x) => x.ev.sale === "challenge" && x.legs.length > 0).length,
    forcedSales: r.filter((x) => x.ev.sale === "forced" && x.legs.length > 0).length,
    collGaps: r.filter((x) => x.gap.coll !== ZERO).length,
    debtGaps: r.filter((x) => x.gap.debt !== ZERO).length,
    understated: r.filter((x) => x.ev.understated).length,
    liveGap,
  };
}

/** A closed card's lifetime line: the ZCHF minted, repaid and cleared by
 *  sales over the position's whole history, from the rows alone (no receipt
 *  is needed for the totals). */
export interface FrankencoinLifetimeDebt {
  minted: number;
  repaid: number;
  cleared: { amount: number; label: string } | null;
}

export function frankencoinLifetimeDebt(events: BaseActivityEvent[]): FrankencoinLifetimeDebt | null {
  const replayed = replayFrankencoin(frankencoinFlowEvents(events));
  if (replayed.length === 0) return null;
  const sum = (keys: string[]) => replayed.reduce((a, r) => a + keys.reduce((b, k) => b + legOf(r, k), 0), 0);
  const challenge = sum([FC.clearedChallenge]);
  const forced = sum([FC.clearedForced]);
  const cleared = challenge + forced;
  return {
    minted: sum([FC.paidOut, FC.reserve, FC.interest, FC.minted]),
    repaid: sum([FC.repaid, FC.reserveBack, FC.repaidWhole]),
    cleared:
      cleared > 0
        ? {
            amount: cleared,
            label:
              challenge > 0 && forced > 0
                ? "cleared by sales"
                : challenge > 0
                  ? "cleared by challenge sale"
                  : "cleared by forced sale",
          }
        : null,
  };
}
