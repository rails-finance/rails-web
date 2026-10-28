// Lifetime flows for an Alchemist position (Alchemix V3, Ethereum and Base):
// the page's rows replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Alchemix").
// ----------------------------------------------------------------------------
// One unit, the asset under the line's vault (USDC or WETH), as the card's
// collateralisation counts it: the collateral is MYT shares at the vault's
// share price, and each unit of the synthetic owed counts as one unit of that
// asset, the Alchemist's accounting (`FlowTimeline.unit`). No USD.
//
// RULES.
// - The balances are the getCDP READINGS the rows carry
//   (`stateAtBlockFromReading`), never a running sum of the legs: a reading is
//   at every block where the position could move, the line's redemptions
//   included (rails-ops decisions/0032). A row with no reading keeps the last.
// - A leg is the figure its log states, at the share price of its block's
//   reading, with the exceptions lib/alchemix/economics.ts set for the tower:
//   a repay's debt leg is the debt credit resolved at capture (null: unsure),
//   and its shares come from the caller's wallet, so only its collateral fee
//   leaves the collateral; a force repay inside a close is the close's; a
//   self-liquidation pays its debt with the close's shares and the force
//   repay's fee, and returns the rest (`selfLiquidationSplit`); a redemption's
//   legs are the difference of the readings either side of it (cleared debt,
//   `collateralTakenRaw`); a liquidation states its shares and fee, and its
//   debt leg is what the readings say left in its block beside the other legs.
// - Rows that move nothing (custody transfers, a redemption that cleared and
//   took nothing, a repayment fee's log) are not events of the replay, unless
//   their reading moved a balance.
// - Between readings the shares and the debt stand (no interest accrues on an
//   Alchemix debt) and the share price keeps the last reading's: no daily
//   share price is recorded for the vault.
//
// Pure: tested offline in scripts/verify/verify-alchemix-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline, FlowUnsure } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { PricePoint, PriceSeries } from "@/lib/shared/price-series";
import type { BaseActivityEvent, AlchemixV3EventType } from "@/lib/shared/types/event-shape";
import { isAlchemistEvent } from "@/lib/shared/types/event-shape";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { collateralTakenRaw, readingsBefore } from "@/lib/alchemix/readings-before";
import { selfLiquidationSplit } from "@/lib/alchemix/self-liquidation";

const DAY_S = 86_400;
const WAD = 1e18;
const DUST = 1e-12;

/** Bucket keys. */
export const AX = {
  deposited: "ax-deposited",
  withdrawn: "ax-withdrawn",
  forcedColl: "ax-forced-coll",
  repayFee: "ax-repay-fee",
  closedColl: "ax-closed-coll",
  returned: "ax-returned",
  redeemedColl: "ax-redeemed-coll",
  liquidatedColl: "ax-liquidated-coll",
  minted: "ax-minted",
  burned: "ax-burned",
  repaid: "ax-repaid",
  forcedDebt: "ax-forced-debt",
  redeemedDebt: "ax-redeemed-debt",
  closedDebt: "ax-closed-debt",
  liquidatedDebt: "ax-liquidated-debt",
} as const;

const COLL_KEYS = new Set<string>([
  AX.deposited,
  AX.withdrawn,
  AX.forcedColl,
  AX.repayFee,
  AX.closedColl,
  AX.returned,
  AX.redeemedColl,
  AX.liquidatedColl,
]);
const OUT_KEYS = new Set<string>([
  AX.withdrawn,
  AX.forcedColl,
  AX.repayFee,
  AX.closedColl,
  AX.returned,
  AX.redeemedColl,
  AX.liquidatedColl,
  AX.burned,
  AX.repaid,
  AX.forcedDebt,
  AX.redeemedDebt,
  AX.closedDebt,
  AX.liquidatedDebt,
]);

/** The timeline's asset keys: the vault shares and the debt. */
export const ALCHEMIX_MYT_KEY = "myt";
export const ALCHEMIX_DEBT_KEY = "debt";

/** The buckets in drawing order. */
export function alchemixFlowBuckets(): FlowBucket[] {
  return [
    { key: AX.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: AX.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
    {
      key: AX.forcedColl,
      label: "Put against set-aside debt",
      event: "Force repay",
      side: "collateral",
      dir: "out",
      hatch: "horizontal",
      link: "force-repay",
    },
    { key: AX.repayFee, label: "Repay fees", event: "Repay", side: "collateral", dir: "out", hatch: "dots" },
    {
      key: AX.closedColl,
      label: "Paid the debt at the close",
      event: "Self-liquidation",
      side: "collateral",
      dir: "out",
      hatch: "vertical",
      link: "close",
    },
    {
      key: AX.returned,
      label: "Returned at the close",
      event: "Self-liquidation",
      side: "collateral",
      dir: "out",
      hatch: "cross",
    },
    {
      key: AX.redeemedColl,
      label: "Taken by redemptions",
      event: "Redemption",
      side: "collateral",
      dir: "out",
      tone: "redemption",
      hatch: "forward",
      link: "redemption",
    },
    {
      key: AX.liquidatedColl,
      label: "Taken by liquidations",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    { key: AX.minted, label: "Minted", event: "Mint", side: "debt", dir: "in" },
    { key: AX.burned, label: "Burned", event: "Burn", side: "debt", dir: "out" },
    { key: AX.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out", hatch: "zigzag" },
    {
      key: AX.forcedDebt,
      label: "Repaid from collateral",
      event: "Force repay",
      side: "debt",
      dir: "out",
      hatch: "horizontal",
      link: "force-repay",
    },
    {
      key: AX.redeemedDebt,
      label: "Cleared by redemptions",
      event: "Redemption",
      side: "debt",
      dir: "out",
      tone: "redemption",
      hatch: "forward",
      link: "redemption",
    },
    {
      key: AX.closedDebt,
      label: "Paid off at the close",
      event: "Self-liquidation",
      side: "debt",
      dir: "out",
      hatch: "vertical",
      link: "close",
    },
    {
      key: AX.liquidatedDebt,
      label: "Cleared by liquidations",
      event: "Liquidation",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
}

/** A getCDP reading in tokens: MYT shares, the synthetic owed, and the
 *  vault's share price in the underlying (null where the reading has none). */
export interface AlchemixFlowReading {
  shares: number;
  debt: number;
  sharePrice: number | null;
}

/** One row of the position, in tokens, as the replay reads it. */
export interface AlchemixFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx: string;
  kind: AlchemixV3EventType;
  scope: "position" | "line";
  /** The reading at the row's block; null where the row carries none. */
  reading: AlchemixFlowReading | null;
  /** The legs the row's log (or the readings either side, for a redemption)
   *  states, in tokens: shares on the collateral, the synthetic on the debt. */
  legs: { bucket: string; amount: number }[];
  /** Figures the row could not state, and why. */
  unstated: { side: "collateral" | "debt"; why: string }[];
  /** The shares a repay paid in from the caller's wallet: not a leg. */
  outsideShares: number;
}

const num = (raw: string | null | undefined, div = WAD): number => {
  if (raw == null) return 0;
  const n = Number(String(raw).split(".")[0]);
  return Number.isFinite(n) ? n / div : 0;
};

const logIndex = (id: string): number => {
  const i = id.lastIndexOf(":");
  const n = i >= 0 ? Number(id.slice(i + 1)) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** The page's V3 rows as the replay reads them, oldest first. `underlyingDecimals`
 *  scales the share price. */
export function alchemixFlowEvents(events: BaseActivityEvent[], underlyingDecimals: number): AlchemixFlowEvent[] {
  const rows = (events.filter(isAlchemistEvent) as AlchemistEvent[]).slice();
  rows.sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id));
  const before = readingsBefore(rows);
  const byTx = new Map<string, AlchemistEvent[]>();
  for (const e of rows) {
    const list = byTx.get(e.txHash);
    if (list) list.push(e);
    else byTx.set(e.txHash, [e]);
  }
  const priceDiv = 10 ** underlyingDecimals;
  return rows.map((e) => {
    const c = e.context.data;
    const s = c.stateAtBlockFromReading;
    const reading: AlchemixFlowReading | null =
      s?.status === "stated" && s.blockNumber != null && s.collateralRaw != null && s.debtRaw != null
        ? {
            shares: num(s.collateralRaw),
            debt: num(s.debtRaw),
            sharePrice: s.sharePriceRaw != null && Number(s.sharePriceRaw) > 0 ? num(s.sharePriceRaw, priceDiv) : null,
          }
        : null;
    const legs: { bucket: string; amount: number }[] = [];
    const unstated: AlchemixFlowEvent["unstated"] = [];
    const add = (bucket: string, amount: number) => {
      if (amount > DUST) legs.push({ bucket, amount });
    };
    let outsideShares = 0;
    const raw = c.raw;
    if (c.scope === "line") {
      if (c.eventType === "redemption") {
        const cleared = c.debtClearedFromReadings;
        if (cleared?.status === "stated" && cleared.amountRaw != null) {
          add(AX.redeemedDebt, num(cleared.amountRaw));
          const taken = collateralTakenRaw(e, before.get(e.blockNumber) ?? null);
          if (taken != null) add(AX.redeemedColl, num(taken));
          else if (num(cleared.amountRaw) > 0)
            unstated.push({
              side: "collateral",
              why: "a redemption's collateral taken is not stated: its readings do not span the same two blocks as its cleared debt.",
            });
        } else if (reading)
          unstated.push(
            {
              side: "debt",
              why: "a redemption's cleared debt is not stated: another step falls between its readings.",
            },
            {
              side: "collateral",
              why: "a redemption's collateral taken is not stated: another step falls between its readings.",
            },
          );
      }
    } else
      switch (c.eventType) {
        case "deposit":
          add(AX.deposited, num(raw.amount));
          break;
        case "withdraw":
          add(AX.withdrawn, num(raw.amount));
          break;
        case "mint":
          add(AX.minted, num(raw.amount));
          break;
        case "burn":
          add(AX.burned, num(raw.amount));
          break;
        case "repay": {
          outsideShares = num(raw.amount);
          const credit = c.resolvedAtCapture?.debtCredit ?? null;
          if (credit == null)
            unstated.push({ side: "debt", why: "a repay's cleared debt was not resolved when its log was captured." });
          else add(AX.repaid, num(credit));
          add(AX.repayFee, num(c.resolvedAtCapture?.collateralFee ?? null));
          break;
        }
        case "force_repay": {
          const inClose = (byTx.get(e.txHash) ?? []).some(
            (x) => x.context.data.eventType === "self_liquidated" && x.context.data.tokenId === c.tokenId,
          );
          if (inClose) break;
          add(AX.forcedColl, num(raw.credit_to_yield) + num(raw.protocol_fee_total));
          const credit = c.resolvedAtCapture?.debtCredit ?? null;
          if (credit == null)
            unstated.push({
              side: "debt",
              why: "a force repay's cleared debt was not resolved when its log was captured.",
            });
          else add(AX.forcedDebt, num(credit));
          break;
        }
        case "self_liquidated": {
          const block = s?.blockNumber ?? e.blockNumber;
          const split = selfLiquidationSplit(e, byTx.get(e.txHash) ?? [e], before.get(block) ?? null);
          if (!split) break;
          add(AX.closedColl, Number(split.totalRaw + split.feeRaw) / WAD);
          if (split.returnedRaw != null) add(AX.returned, Number(split.returnedRaw) / WAD);
          else
            unstated.push({
              side: "collateral",
              why: "the collateral a close returned is not stated: no reading before the close is on the timeline.",
            });
          if (split.debtBeforeRaw != null) add(AX.closedDebt, Number(split.debtBeforeRaw) / WAD);
          else
            unstated.push({
              side: "debt",
              why: "the debt a close paid off is not stated: no reading before the close is on the timeline.",
            });
          break;
        }
        case "liquidated":
          add(AX.liquidatedColl, num(raw.amount) + num(raw.fee_in_yield));
          break;
        default:
          break;
      }
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind: c.eventType,
      scope: c.scope,
      reading,
      legs,
      unstated,
      outsideShares,
    };
  });
}

/** A replayed row: its legs, the share price they are valued at, and the
 *  balances after it. */
export interface AlchemixReplayed {
  ev: AlchemixFlowEvent;
  legs: { bucket: string; amount: number }[];
  /** The share price the row's collateral legs are valued at (the reading's,
   *  else the last before it), and whether it was the row's. */
  sharePrice: number;
  ownPrice: boolean;
  shares: number;
  debt: number;
}

/** The replay: the rows that move something, each with the balances after it. */
export function replayAlchemix(rows: AlchemixFlowEvent[]): AlchemixReplayed[] {
  const out: AlchemixReplayed[] = [];
  let shares = 0;
  let debt = 0;
  let price = rows.find((r) => r.reading?.sharePrice != null)?.reading?.sharePrice ?? 0;
  // A liquidation's debt leg: the readings' fall over the block, less the
  // block's other debt legs.
  const prevDebtAt = new Map<number, number>();
  let lastRead: { block: number; debt: number } | null = null;
  for (const r of rows) {
    if (!r.reading) continue;
    if (lastRead && lastRead.block !== r.block) prevDebtAt.set(r.block, lastRead.debt);
    lastRead = { block: r.block, debt: r.reading.debt };
  }
  const debtLegsInBlock = new Map<number, number>();
  for (const r of rows)
    for (const l of r.legs)
      if (!COLL_KEYS.has(l.bucket))
        debtLegsInBlock.set(
          r.block,
          (debtLegsInBlock.get(r.block) ?? 0) + (OUT_KEYS.has(l.bucket) ? l.amount : -l.amount),
        );
  for (const r of rows) {
    const legs = [...r.legs];
    if (r.kind === "liquidated" && r.reading) {
      const prev = prevDebtAt.get(r.block);
      if (prev != null) {
        const fell = prev - r.reading.debt - (debtLegsInBlock.get(r.block) ?? 0);
        if (fell > DUST) legs.push({ bucket: AX.liquidatedDebt, amount: fell });
      }
    }
    const own = r.reading?.sharePrice != null;
    if (own) price = r.reading!.sharePrice!;
    const nextShares = r.reading ? r.reading.shares : shares;
    const nextDebt = r.reading ? r.reading.debt : debt;
    const moved = Math.abs(nextShares - shares) > DUST || Math.abs(nextDebt - debt) > DUST;
    if (legs.length === 0 && r.unstated.length === 0 && !moved) continue;
    shares = nextShares;
    debt = nextDebt;
    out.push({ ev: r, legs, sharePrice: price, ownPrice: own, shares, debt });
  }
  return out;
}

/** What the page's live read states now, where it has one. */
export interface AlchemixLive {
  shares: number;
  debt: number;
  /** The vault's share price at the read, in the underlying. */
  sharePrice: number | null;
  block: number;
}

export interface AlchemixFlowOptions {
  /** The asset under the vault: the unit every figure is in. */
  underlyingSymbol: string;
  mytSymbol: string;
  syntheticSymbol: string;
  /** The vault's and the synthetic's addresses, for the icons. */
  mytAddress?: string | null;
  chainId: number;
  lineKey: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** Null on a closed position or where the read did not land. */
  live: AlchemixLive | null;
}

/** The replay with its scale, for the timeline, the cards and the tests. */
export interface AlchemixFlowReplay {
  rows: AlchemixFlowEvent[];
  replayed: AlchemixReplayed[];
  /** Grains per unit of the underlying: the model's figures are × this. */
  grain: number;
  scale: number;
}

export function alchemixFlowReplay(rows: AlchemixFlowEvent[]): AlchemixFlowReplay {
  const replayed = replayAlchemix(rows);
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of replayed) {
    for (const l of r.legs) {
      if (OUT_KEYS.has(l.bucket)) continue;
      if (COLL_KEYS.has(l.bucket)) inColl += l.amount * r.sharePrice;
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.shares * r.sharePrice, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { rows, replayed, grain: 10 ** scale, scale };
}

const MYT = ALCHEMIX_MYT_KEY;
const DEBT = ALCHEMIX_DEBT_KEY;

/** The vault's share price at every reading the rows carry, one point per
 *  day (the day's last reading), and today's from the live read. */
export function alchemixShareObs(
  rows: AlchemixFlowEvent[],
  live: AlchemixLive | null,
  today: number | null,
): PricePoint[] {
  const byDay = new Map<number, PricePoint>();
  for (const r of rows) {
    const p = r.reading?.sharePrice;
    if (p == null || !(p > 0)) continue;
    const day = Math.floor(r.ts / DAY_S);
    const had = byDay.get(day);
    if (!had || (had[2] ?? 0) <= r.block) byDay.set(day, [day, p, r.block]);
  }
  if (live?.sharePrice != null && live.sharePrice > 0 && today != null)
    byDay.set(today, [today, live.sharePrice, live.block]);
  return [...byDay.values()].sort((a, b) => a[0] - b[0]);
}

/** The share price line the price chart draws in place of the shares' price
 *  (ruling 8): one share in the underlying at each day's last reading, a day
 *  with none keeping the last (drawn dotted), today the card's. */
export function alchemixShareLine(points: PricePoint[], o: AlchemixFlowOptions): PriceSeries | null {
  if (points.length === 0) return null;
  const u = o.underlyingSymbol;
  const sh = o.mytSymbol;
  return {
    key: `alchemix:${o.lineKey}:share-price`,
    asset: { symbol: sh, chain: o.chainId },
    unit: u.toLowerCase(),
    grain: "daily",
    source: `the vault's convertToAssets of one ${sh}, read with each getCDP reading on this position's timeline and at the page's block`,
    points,
    here: {
      live: `Share price — the ${u} one ${sh} is worth at the page's block {block}: the vault's convertToAssets read with the card's reading, the card's share price.`,
      read: `Share price on {day} — the ${u} one ${sh} was worth at block {block}, read with the getCDP reading there. A day with no reading keeps the last one's.`,
      formula: `convertToAssets(1 ${sh}) at the block`,
    },
    help: `at each reading on this position's timeline (the position's events and the line's redemptions): the ${u} one ${sh} is worth, the vault's convertToAssets, and today the card's share price. No daily share price is recorded for the vault, so a day with no reading keeps the last one's, drawn dotted.`,
  };
}

/** The position's rows as the Lifetime flows panel's timeline, in the
 *  underlying. Null with no row that moves anything. */
export function alchemixFlowTimeline(rp: AlchemixFlowReplay, o: AlchemixFlowOptions): FlowTimeline | null {
  const { replayed, grain: G, scale } = rp;
  if (replayed.length === 0) return null;
  const u = o.underlyingSymbol;
  const buckets = alchemixFlowBuckets();
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const unsure: FlowUnsure[] = r.ev.unstated.map((x) => ({ side: x.side, why: x.why }));
    if (!r.ownPrice && (r.shares > DUST || r.legs.some((l) => COLL_KEYS.has(l.bucket))))
      unsure.push({
        side: "collateral",
        why: `${o.mytSymbol} valued at the share price of the last reading before this row: its reading carries none.`,
        held: true,
      });
    const prices: FlowEvent["prices"] = [{ asset: DEBT, usd: G }];
    if (r.ownPrice) prices.push({ asset: MYT, usd: r.sharePrice * G });
    const k = r.ev.kind;
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick:
        k === "liquidated"
          ? "liquidation"
          : k === "redemption"
            ? "redemption"
            : k === "force_repay"
              ? "caution"
              : moved.coll && moved.debt
                ? "both"
                : moved.debt
                  ? "debt"
                  : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.sharePrice * G, symbol: o.mytSymbol }
          : { bucket: l.bucket, usd: l.amount * G, symbol: o.syntheticSymbol },
      ),
      tx: r.ev.tx,
      countsTx: r.ev.scope === "position",
      balances: [
        { asset: MYT, symbol: o.mytSymbol, side: "collateral", amount: Math.max(0, r.shares) },
        { asset: DEBT, symbol: o.syntheticSymbol, side: "debt", amount: Math.max(0, r.debt) },
      ],
      prices,
      ...(unsure.length ? { unsure } : {}),
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = last.shares > DUST || last.debt > DUST;
  const live = open ? o.live : null;
  const endDay = open ? Math.max(today, Math.floor(last.ev.ts / DAY_S) + 1) : Math.floor(last.ev.ts / DAY_S) + 1;
  const nowShares = open ? (live?.shares ?? last.shares) : 0;
  const nowDebt = open ? (live?.debt ?? last.debt) : 0;
  const priceNow = live?.sharePrice != null && live.sharePrice > 0 ? live.sharePrice : last.sharePrice;

  const share = alchemixShareObs(rp.rows, live, open ? today : null);
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  // Days before the first priced reading take its price, as their flows do.
  const mytObs: [number, number, number | null][] = share.map(([d, p, b]) => [d, p * G, b]);
  if (mytObs.length > 0 && mytObs[0][0] > firstDay) mytObs.unshift([firstDay, mytObs[0][1], mytObs[0][2]]);

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowShares > DUST)
      assets.push({ side: "collateral", symbol: o.mytSymbol, amount: nowShares, usd: nowShares * priceNow * G });
    if (nowDebt > DUST) assets.push({ side: "debt", symbol: o.syntheticSymbol, amount: nowDebt, usd: nowDebt * G });
  }
  const shareLine = alchemixShareLine(share, o);

  return {
    unit: { symbol: u, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowShares * priceNow * G : 0,
      debtUsd: open ? nowDebt * G : 0,
      assets,
    },
    todayPrices: { [MYT]: priceNow * G, [DEBT]: G },
    dailyPrices: { [MYT]: mytObs, [DEBT]: [[firstDay, G]] },
    seriesCarry: true,
    priceSource: "the vault's share price at each reading",
    carriedWhy: {
      [MYT]: "no daily share price is recorded for the vault, so a day between readings keeps the last reading's.",
    },
    ...(shareLine
      ? { shareLine: { asset: MYT, series: shareLine, unitLabel: u, name: "Share price", digits: 6 } }
      : {}),
    today: open ? today : endDay,
    labels: { collateral: "Deposited", debt: "Debt" },
    words: alchemixFlowWords(o),
    ...(o.mytAddress ? { addresses: { [o.mytSymbol]: o.mytAddress } } : {}),
  };
}

/** The panel's words for an Alchemist position: everything in the underlying. */
export function alchemixFlowWords(o: AlchemixFlowOptions): NonNullable<FlowTimeline["words"]> {
  const u = o.underlyingSymbol;
  const sh = o.mytSymbol;
  const sym = o.syntheticSymbol;
  return {
    held: "Still deposited",
    restBySide: { collateral: "Share price move", debt: "Not stated by an event" },
    restNote: {
      collateral: `the change in the vault's share price, in ${u}, since each collateral flow, and any move of the shares no event states`,
      debt: "the move in the debt the readings show that no event's figure states",
    },
    basis: {
      collateral: `Every figure is in ${u}, the asset under the vault: each ${sh} flow is valued at the vault's share price read with its block's reading.`,
      debt: `Every figure is in ${u}: the Alchemist counts each ${sym} owed as one ${u}.`,
    },
    heldBasis: {
      collateral: `the ${sh} the getCDP reading in force states, at the share price read with it, in ${u}.`,
      debt: `the ${sym} the getCDP reading in force states, one ${u} each; no interest accrues on it.`,
    },
    linePrices: `in ${u}, the collateral at the share price of the latest reading and the debt at one ${u} per ${sym}`,
    moment: {
      face: ["debt"],
      noPrice: { collateral: `No share price is read for this day, so the ${sh} is stated in shares.` },
      notes: [],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures and in tokens, and each side just
 *  before and once the row's transaction had run. */
export function alchemixFocusEvents(rp: AlchemixFlowReplay, o: AlchemixFlowOptions): FocusEvent[] {
  const { replayed, grain: G } = rp;
  const byTx = new Map<string, AlchemixReplayed[]>();
  for (const r of replayed) {
    const list = byTx.get(r.ev.tx);
    if (list) list.push(r);
    else byTx.set(r.ev.tx, [r]);
  }
  return replayed.map((r) => {
    const tx = byTx.get(r.ev.tx) ?? [r];
    const lastOf = tx[tx.length - 1];
    // The transaction's moves, from the reading before it to the one after.
    const firstIdx = replayed.indexOf(tx[0]);
    const prev = firstIdx > 0 ? replayed[firstIdx - 1] : null;
    const sharesBefore = prev ? prev.shares : 0;
    const debtBefore = prev ? prev.debt : 0;
    const p = lastOf.sharePrice * G;
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      tx: r.ev.tx,
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.sharePrice * G, amount: l.amount, symbol: o.mytSymbol }
          : { bucket: l.bucket, usd: l.amount * G, amount: l.amount, symbol: o.syntheticSymbol },
      ),
      sides: {
        collateral: {
          before: Math.max(0, sharesBefore) * p,
          after: Math.max(0, lastOf.shares) * p,
          amount: lastOf.shares - sharesBefore,
          symbol: o.mytSymbol,
          held: Math.max(0, lastOf.shares),
        },
        debt: {
          before: Math.max(0, debtBefore) * G,
          after: Math.max(0, lastOf.debt) * G,
          amount: lastOf.debt - debtBefore,
          symbol: o.syntheticSymbol,
          held: Math.max(0, lastOf.debt),
        },
      },
    };
  });
}

/** What the Explanation states beside the bars. */
export interface AlchemixFlowFacts {
  /** Line redemptions that cleared or took something, and those whose
   *  figures the readings could not state. */
  redemptions: number;
  redemptionsUnstated: number;
  /** Repays, the shares their callers paid in, and those whose cleared debt
   *  was not resolved. */
  repays: number;
  repaySharesIn: number;
  unresolved: number;
  /** Closes (self-liquidations). */
  closes: number;
  /** Rows valued at an earlier reading's share price. */
  nearest: number;
}

export function alchemixFlowFacts(rp: AlchemixFlowReplay): AlchemixFlowFacts {
  const r = rp.replayed;
  const repays = rp.rows.filter((x) => x.kind === "repay");
  return {
    redemptions: r.filter((x) => x.ev.kind === "redemption" && x.legs.length > 0).length,
    redemptionsUnstated: r.filter((x) => x.ev.kind === "redemption" && x.ev.unstated.length > 0).length,
    repays: repays.length,
    repaySharesIn: repays.reduce((s, x) => s + x.outsideShares, 0),
    unresolved: rp.rows.filter((x) => x.unstated.some((u) => u.why.includes("not resolved"))).length,
    closes: rp.rows.filter((x) => x.kind === "self_liquidated").length,
    nearest: r.filter((x) => !x.ownPrice && x.legs.some((l) => COLL_KEYS.has(l.bucket))).length,
  };
}
