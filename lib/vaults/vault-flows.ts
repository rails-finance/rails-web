// Lifetime flows for a vault holder (Aave vaults, Yearn, Morpho vaults on
// Base): the holder's rows replayed into the day rows the Lifetime flows panel
// reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Vault holders").
// ----------------------------------------------------------------------------
// ONE SIDE, IN THE VAULT'S ASSET. A holder holds shares; its claim is the
// shares × the vault's share price (`convertToAssets`), in the asset. Vaults
// state no USD (decision 0017), so every figure is the asset
// (`FlowTimeline.unit`).
//
// Each row carries the share price at its own block (`sharePriceAtBlock`) and
// the share balance after it (`balanceAfter`). A deposit or a withdrawal is the
// `assets` word of its ERC-4626 event; a row without one (a transfer, or a
// mint or burn whose event was not emitted for this holder) is its shares at
// the row's share price. Held on a day is the shares after its last event at
// that event's share price; the live stop is the page's `convertToAssets` of
// the balance at its block. The balancing item is the change in the share
// price since each flow, on the shares held.
//
// Built on the server from the page's whole history (`allEvents`), which the
// page already reads for its gate; the client gets day rows only.
//
// THE PRICE VIEW IS THE SHARE PRICE (rails-ops reference/lifetime-price-chart.md,
// ruling 8; ui-jobs 328 step 7): one share in the asset, the row's
// `sharePriceAtBlock` on each day with an event (its last), and on the page's
// block the card's share price. No daily share price is recorded for a vault,
// so a day between events keeps the last event's, drawn dotted. A holding has
// no liquidation, so the view has no level.

import type { FlowBucket, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { PricePoint, PriceSeries } from "@/lib/shared/price-series";
import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

const DAY_S = 86_400;
const DUST = 1e-12;
/** A held figure below this share of the panel's largest is drawn as none. */
const HELD_FLOOR = 1e-9;
const SHARE = "share";

const BUCKETS: FlowBucket[] = [
  { key: "deposited", label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: "received", label: "Received by transfer", event: "Received", side: "collateral", dir: "in", hatch: "grid" },
  { key: "withdrawn", label: "Withdrawn", event: "Withdrawal", side: "collateral", dir: "out", hatch: "reverse" },
  { key: "sent", label: "Sent to another account", event: "Sent", side: "collateral", dir: "out", hatch: "dots" },
];

const BUCKET_OF: Partial<Record<VaultHolderEvent["kind"], string>> = {
  deposit: "deposited",
  withdrawal: "withdrawn",
  "transfer-in": "received",
  "transfer-out": "sent",
};

export interface VaultFlowOptions {
  assetSymbol: string;
  shareSymbol: string;
  shareDecimals: number;
  assetDecimals: number;
  /** The page's block and its time: every live figure is read there. */
  blockNumber: number;
  blockTimestamp: number;
  /** `balanceOf` and `convertToAssets(balanceOf)` at that block, raw. */
  sharesRaw: string;
  claimRaw: string | null;
  /** The share token's and the asset's addresses, for the icons. */
  vaultAddress: string;
  assetAddress?: string;
  /** The chain the vault is on. */
  chainId: number;
  /** The card's share price at the page's block (one share's
   *  `convertToAssets`), in the asset; null where its read failed. */
  sharePriceNow: number | null;
}

const toUnits = (raw: string, decimals: number): number => Number(raw) / 10 ** decimals;

/** The holder's whole history as the panel's timeline, in the vault's asset.
 *  Null with no rows, or where no row and no live read prices a share. */
export function vaultFlowTimeline(events: VaultHolderEvent[], o: VaultFlowOptions): FlowTimeline | null {
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  if (rows.length === 0) return null;
  const sharesNow = toUnits(o.sharesRaw, o.shareDecimals);
  const claimNow = o.claimRaw == null ? null : toUnits(o.claimRaw, o.assetDecimals);
  const priceNow = claimNow != null && sharesNow > DUST ? claimNow / sharesNow : null;

  // Each row's share price in the asset: its own block's, else the last one
  // read before it, else the first read after it (a row the archive did not
  // answer), else the live read.
  const read = rows.map((e) => (e.sharePriceAtBlock == null ? null : toUnits(e.sharePriceAtBlock, o.assetDecimals)));
  const priceOf: number[] = [];
  let last: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (read[i] != null && read[i]! > 0) last = read[i]!;
    priceOf.push(last ?? NaN);
  }
  const firstRead = read.find((p) => p != null && p > 0) ?? priceNow;
  if (firstRead == null) return null;
  for (let i = 0; i < priceOf.length; i++) if (Number.isNaN(priceOf[i])) priceOf[i] = firstRead;

  // The token axis: about five significant digits of the largest figure.
  let peak = claimNow ?? 0;
  let inflow = 0;
  rows.forEach((e, i) => {
    const b = BUCKET_OF[e.kind];
    const shares = Math.abs(toUnits(e.sharesDelta, o.shareDecimals));
    if (b === "deposited" || b === "received")
      inflow += e.assets != null && b === "deposited" ? toUnits(e.assets, o.assetDecimals) : shares * priceOf[i];
    peak = Math.max(peak, inflow, toUnits(e.balanceAfter, o.shareDecimals) * priceOf[i]);
  });
  const scale = unitScaleFor(peak);
  const G = 10 ** scale;

  // A HOLDING TOO SMALL TO DRAW IS DRAWN AS NONE. A router that deposits and
  // forwards in one transaction can keep one base unit of shares between its
  // rows (1 wei of waEthWETH, 0.000001 waEthUSDT: ui-jobs 379). A held figure
  // below a billionth of the panel's largest is no height on the line at any
  // width, and the shared axis cannot be built over a peak that small
  // (`axisFor`), so it is drawn as none held, and a live balance under it as
  // closed. The card above the panel states the balance as read.
  const floor = peak * HELD_FLOOR;
  const drawnShares = (shares: number, price: number): number => (shares > 0 && shares * price >= floor ? shares : 0);

  const flowEvents: FlowEvent[] = rows.map((e, i) => {
    const b = BUCKET_OF[e.kind];
    const shares = Math.abs(toUnits(e.sharesDelta, o.shareDecimals));
    const amount =
      e.assets != null && (b === "deposited" || b === "withdrawn")
        ? toUnits(e.assets, o.assetDecimals)
        : shares * priceOf[i];
    return {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tick: "collateral",
      legs: b && amount > DUST ? [{ bucket: b, usd: amount * G, symbol: o.assetSymbol }] : [],
      tx: e.txHash,
      balances: [
        {
          asset: SHARE,
          symbol: o.shareSymbol,
          side: "collateral",
          amount: drawnShares(toUnits(e.balanceAfter, o.shareDecimals), priceOf[i]),
        },
      ],
      prices: [{ asset: SHARE, usd: priceOf[i] * G }],
    };
  });
  const used = new Set(flowEvents.flatMap((e) => e.legs.map((l) => l.bucket)));
  const buckets = BUCKETS.filter((b) => b.key === "deposited" || used.has(b.key));
  const days = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.blockTimestamp / DAY_S);
  const lastRow = rows[rows.length - 1];
  const open = sharesNow > DUST && drawnShares(sharesNow, priceNow ?? priceOf[priceOf.length - 1]) > 0;
  const lastDay = Math.floor(lastRow.timestamp / DAY_S);
  // The share price on each day a row read one (its last that day), and today
  // the page's read: a day between keeps the last (`seriesCarry`).
  const obs = new Map<number, [number, number, number]>();
  rows.forEach((e, i) => {
    if (read[i] == null || !(read[i]! > 0)) return;
    const day = Math.floor(e.timestamp / DAY_S);
    obs.set(day, [day, read[i]! * G, e.blockNumber]);
  });
  if (open && priceNow != null) obs.set(today, [today, priceNow * G, o.blockNumber]);
  const shareObs = [...obs.values()].sort((a, b) => a[0] - b[0]);

  const share = vaultShareLine(rows, read, o, open ? today : null);

  return {
    unit: { symbol: o.assetSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? (claimNow ?? sharesNow * priceOf[priceOf.length - 1]) * G : 0,
      debtUsd: 0,
      assets:
        open && claimNow != null
          ? [{ side: "collateral", symbol: o.shareSymbol, amount: sharesNow, usd: claimNow * G }]
          : [],
    },
    todayPrices: { [SHARE]: (priceNow ?? priceOf[priceOf.length - 1]) * G },
    dailyPrices: { [SHARE]: shareObs },
    ...(share
      ? {
          shareLine: {
            asset: SHARE,
            series: share,
            unitLabel: o.assetSymbol,
            name: `${o.shareSymbol} share price`,
            digits: shareDigits(share.points[share.points.length - 1][1]),
          },
        }
      : {}),
    priceSource: `the vault's convertToAssets of one ${o.shareSymbol}, read at each event's block and at the page's`,
    seriesCarry: true,
    carriedWhy: {
      [SHARE]: "No daily share price is recorded for this vault, so a day between events keeps the last event's.",
    },
    today: open ? today : lastDay + 1,
    totalEvents: rows.length,
    labels: { collateral: "Claim", debt: "Debt" },
    addresses: {
      [o.shareSymbol]: o.vaultAddress,
      ...(o.assetAddress ? { [o.assetSymbol]: o.assetAddress } : {}),
    },
    words: {
      held: "Still in the vault",
      live: `At block ${o.blockNumber.toLocaleString("en-US")}`,
      restBySide: { collateral: "Share price change" },
      restNote: {
        collateral: `the change in the vault's share price since each flow, in ${o.assetSymbol}, on the ${o.shareSymbol} held`,
      },
      basis: {
        collateral: `Every figure is in ${o.assetSymbol}, the vault's asset; a transfer's ${o.shareSymbol} are valued at the vault's share price at its block.`,
      },
      heldBasis: {
        collateral: `the ${o.shareSymbol} held after the last event by then, at that event's share price; at block ${o.blockNumber.toLocaleString("en-US")}, the vault's convertToAssets of the balance.`,
      },
      linePrices: `in ${o.assetSymbol}, with the shares at the share price of their latest event`,
    },
  };
}

/** Places a share price prints to: six, and more under 1 so six significant
 *  digits show. */
export function shareDigits(p: number): number {
  return p >= 1 || !(p > 0) ? 6 : Math.min(12, 5 - Math.floor(Math.log10(p)));
}

/** The share price the chart draws: on each day with an event the last read
 *  `sharePriceAtBlock` there, at its block, and on `todayDay` (an open
 *  holding) the card's share price at the page's block. Null with no point. */
export function vaultShareLine(
  rows: VaultHolderEvent[],
  read: (number | null)[],
  o: VaultFlowOptions,
  todayDay: number | null,
): PriceSeries | null {
  const byDay = new Map<number, PricePoint>();
  rows.forEach((e, i) => {
    const p = read[i];
    if (p == null || !(p > 0)) return;
    const day = Math.floor(e.timestamp / DAY_S);
    byDay.set(day, [day, p, e.blockNumber]);
  });
  if (todayDay != null && o.sharePriceNow != null && o.sharePriceNow > 0)
    byDay.set(todayDay, [todayDay, o.sharePriceNow, o.blockNumber]);
  const points = [...byDay.values()].sort((a, b) => a[0] - b[0]);
  if (points.length === 0) return null;
  const a = o.assetSymbol;
  const sh = o.shareSymbol;
  return {
    key: `vault:${o.vaultAddress.toLowerCase()}:share-price`,
    // The tip's mark is the share's letter, as the series it replaces drew.
    asset: { symbol: sh, chain: o.chainId },
    unit: a.toLowerCase(),
    grain: "daily",
    source: `the vault's convertToAssets of one ${sh}, read at each of this address's events and at the page's block`,
    points,
    here: {
      live: `Share price — the ${a} one ${sh} redeems for at the page's block {block}: the vault's convertToAssets, the card's share price.`,
      read: `Share price on {day} — the ${a} one ${sh} redeemed for at block {block}, the vault's convertToAssets read at this address's event there. A day with no event keeps the last event's.`,
      formula: `convertToAssets(1 ${sh}) at the block`,
    },
    help: `on the days of this address's events: the ${a} one ${sh} redeems for, the vault's convertToAssets read at each event's block, and today the card's share price. No daily share price is recorded for the vault, so a day between events keeps the last event's, drawn dotted. A vault holding has no liquidation line.`,
  };
}
