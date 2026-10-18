// Sky Savings' T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the
// card's `sheet` slot, from the figures sky-savings-event-card.tsx states. A
// savings holding has no collateral and no debt, so the one side carries the
// holding's name and no Risk or Limits panel stands under it.
//
// The side: "Last event" (the worth the holder's previous event left), the
// interest since it, "Before this event", the event's rows (USDS and sUSDS on
// a deposit or withdrawal, the sUSDS and its worth on a transfer) and the
// worth after, in dollars. USDS is a dollar stablecoin, so the dollar column
// counts each USDS at $1; the receipt says so.

import type { SkySavingsContext } from "@/lib/shared/types/event-shape";
import { SHEET_WORDS, sheetUsd, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { formatCompact } from "@/lib/utils/format";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { exact, fixed6, skyTransition, units } from "@/lib/sky-savings/math";
import type { SkyPreviousEvent } from "@/lib/sky-savings/explainer-clauses";
import {
  eventInterestSinceProv,
  eventSharesAfterProv,
  eventSharesProv,
  eventUsdsProv,
  eventValueProv,
  type SkyEventCoords,
} from "@/lib/sky-savings/provenance";

const WORDS = {
  side: "Savings",
  usdsIn: "USDS in",
  usdsOut: "USDS out",
  minted: "sUSDS minted",
  burned: "sUSDS burned",
  received: "sUSDS received",
  sent: "sUSDS sent",
  held: "sUSDS held",
  total: "Worth in USDS",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  last: "The USDS the sUSDS was worth just after this address's previous event, at the share price of that block.",
  interest:
    "What the sUSDS held earned between the previous event and this one: the Savings Rate raising the share price while the balance stood still.",
  before:
    "The USDS the sUSDS was worth just before this event: the sUSDS held then, times the share price of this block.",
  usdsIn: "The USDS this deposit paid into the savings module, from the Deposit log.",
  usdsOut: "The USDS this withdrawal took out of the savings module, from the Withdraw log.",
  minted: "The sUSDS this deposit minted to the address, from the Deposit log.",
  burned: "The sUSDS this withdrawal burned from the address, from the Withdraw log.",
  received: "The sUSDS that arrived in this transfer, from the Transfer log; the dollar column is its worth in USDS.",
  sent: "The sUSDS that left in this transfer, from the Transfer log; the dollar column is its worth in USDS.",
  held: "The sUSDS this address holds after the event, replayed from every log that names it; the dollar column is its worth in USDS.",
  total:
    "The USDS the sUSDS held after this event is worth, the sUSDS held times the share price of this block, and its dollars at $1 per USDS.",
};

/** USDS counted at one dollar: the receipt behind every dollar figure. */
function dollarProv(what: string, usds: string): Provenance {
  return {
    kind: "derived",
    summary: `${what}, in US dollars — USDS is a dollar stablecoin, so each USDS is counted at $1.`,
    formula: "USDS × $1",
    inputs: [
      { label: "USDS", value: `${usds} USDS`, kind: "chain-derived" },
      { label: "price", value: "$1.00", kind: "derived", note: "USDS counted at its $1 target" },
    ],
  };
}

const signedOf = (v: bigint, text: string) => (v < BigInt(0) ? `−${text}` : `+${text}`);
const abs = (v: bigint) => (v < BigInt(0) ? -v : v);

export interface SkySheetArgs {
  c: SkySavingsContext;
  coords: SkyEventCoords;
  /** The holder's event before this one: null for the first, undefined when
   *  it is older than the rows the page holds. */
  previous?: SkyPreviousEvent | null;
  /** The interest since the previous event, raw; null where there is none to state. */
  sinceRaw: bigint | null;
}

/** The sheet for a deposit, withdrawal or transfer. */
export function skySavingsSheet({ c, coords, previous, sinceRaw }: SkySheetArgs): EventSheet | undefined {
  const t = skyTransition(c);
  const kind = c.eventType;
  const dollars = (raw: bigint, what: string, sign: -1 | 0 | 1 = 0) => {
    const n = units(raw);
    const text = sheetUsd(sign < 0 ? -n : n, sign > 0);
    return { text, info: dollarProv(what, exact(raw)), value: exact(raw) };
  };

  const rows: SheetRow[] = [];
  const sharesMoved = abs(t.sharesDelta);
  const sharesProv = eventSharesProv(coords, kind, sharesMoved.toString());
  const usdsProv = eventUsdsProv(coords, kind, c.usds, c.usdsSource, c.chi, sharesMoved.toString());
  if (kind === "deposit" || kind === "withdrawal") {
    const dep = kind === "deposit";
    const sign = dep ? 1 : -1;
    rows.push({
      key: "usds",
      label: dep ? WORDS.usdsIn : WORDS.usdsOut,
      amount: {
        text: signedOf(dep ? t.usds : -t.usds, formatCompact(units(t.usds))),
        symbol: USDS.symbol,
        address: USDS.address,
        info: usdsProv,
        value: exact(t.usds),
      },
      usd: dollars(t.usds, dep ? "USDS this deposit paid in" : "USDS this withdrawal took out", sign),
      tip: dep ? TIPS.usdsIn : TIPS.usdsOut,
    });
    rows.push({
      key: "shares",
      label: dep ? WORDS.minted : WORDS.burned,
      amount: {
        text: signedOf(t.sharesDelta, formatCompact(units(sharesMoved))),
        symbol: SUSDS.symbol,
        address: SUSDS.address,
        info: sharesProv,
        value: exact(sharesMoved),
      },
      usd: dollars(
        t.usds,
        dep
          ? "The sUSDS this deposit minted, at the USDS they cost"
          : "The sUSDS this withdrawal burned, at the USDS they returned",
        sign,
      ),
      tip: dep ? TIPS.minted : TIPS.burned,
    });
  } else if ((kind === "received" || kind === "sent") && t.sharesDelta !== BigInt(0)) {
    const rec = kind === "received";
    rows.push({
      key: "shares",
      label: rec ? WORDS.received : WORDS.sent,
      amount: {
        text: signedOf(t.sharesDelta, formatCompact(units(sharesMoved))),
        symbol: SUSDS.symbol,
        address: SUSDS.address,
        info: sharesProv,
        value: exact(sharesMoved),
      },
      usd: dollars(t.usds, "The sUSDS this transfer moved, at their worth in USDS", rec ? 1 : -1),
      tip: rec ? TIPS.received : TIPS.sent,
    });
  } else if (kind !== "self") {
    return undefined;
  }

  const worthProv = (which: "before" | "after") =>
    which === "after"
      ? eventValueProv(coords, "after", c.valueAfter, c.sharesAfter, c.chi)
      : eventValueProv(coords, "before", t.valueBefore.toString(), t.sharesBefore.toString(), c.chi);

  const worthRow = (key: string, label: string, raw: bigint, info: Provenance, tip: string): SheetRow => ({
    key,
    label,
    amount: { text: formatCompact(units(raw)), symbol: USDS.symbol, address: USDS.address, info, value: exact(raw) },
    usd: dollars(raw, `${label}, the sUSDS's worth in USDS`),
    tip,
  });

  const carry: SheetRow[] = [];
  if (previous && sinceRaw != null && t.sharesBefore > BigInt(0)) {
    const prevAfter = BigInt(previous.ctx.valueAfter);
    carry.push(
      worthRow(
        "last",
        SHEET_WORDS.last,
        prevAfter,
        {
          kind: "chain-derived",
          pclass: "indexed",
          summary: `Worth after the previous event (block ${previous.blockNumber.toLocaleString("en-US")}) — the sUSDS held then times the share price of that block.`,
          formula: "shares × chi ÷ 10^27",
          inputs: [
            {
              label: "shares held after the previous event (sUSDS, 18 decimals)",
              value: previous.ctx.sharesAfter,
              kind: "chain-derived",
            },
            { label: "chi at the previous event (27 decimals)", value: previous.ctx.chi, kind: "chain-derived" },
          ],
        },
        TIPS.last,
      ),
    );
    carry.push({
      key: "interest",
      label: SHEET_WORDS.interest,
      amount: {
        text: fixed6(sinceRaw),
        symbol: USDS.symbol,
        address: USDS.address,
        info: eventInterestSinceProv(
          coords,
          sinceRaw.toString(),
          previous.blockNumber,
          previous.ctx.valueAfter,
          t.valueBefore.toString(),
        ),
        value: exact(sinceRaw),
      },
      usd: dollars(sinceRaw, "Interest since the previous event"),
      tip: TIPS.interest,
    });
  }
  const before =
    t.sharesBefore > BigInt(0) && previous !== null
      ? worthRow("before", SHEET_WORDS.before, t.valueBefore, worthProv("before"), TIPS.before)
      : undefined;

  const held: SheetRow = {
    key: "held",
    label: WORDS.held,
    amount: {
      text: formatCompact(units(t.sharesAfter)),
      symbol: SUSDS.symbol,
      address: SUSDS.address,
      info: eventSharesAfterProv(coords, c.sharesAfter),
      value: exact(t.sharesAfter),
    },
    usd: dollars(t.valueAfter, "The sUSDS held after this event, at their worth in USDS"),
    tip: TIPS.held,
  };

  return {
    sides: [
      {
        side: "collateral",
        name: WORDS.side,
        icons: [SUSDS.symbol],
        carry,
        before,
        rows,
        assets: [held],
        total: {
          ...dollars(t.valueAfter, WORDS.total),
          info: dollarProv("The worth of the sUSDS held after this event", exact(t.valueAfter)),
        },
        totalAmount: {
          text: formatCompact(units(t.valueAfter)),
          symbol: USDS.symbol,
          address: USDS.address,
          info: worthProv("after"),
          value: exact(t.valueAfter),
        },
        totalTip: TIPS.total,
      },
    ],
    panels: [],
  };
}
