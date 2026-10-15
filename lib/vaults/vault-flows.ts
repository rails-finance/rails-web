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

import type { FlowBucket, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

const DAY_S = 86_400;
const DUST = 1e-12;
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
          amount: Math.max(0, toUnits(e.balanceAfter, o.shareDecimals)),
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
  const open = sharesNow > DUST;
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
