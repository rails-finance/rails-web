"use client";

// The state card (rails-ops reference/lifetime-flows-scrubber.md, "The day
// links the chart and the timeline"): where the Lifetime flows chart's "Show
// timeline to {date}" cuts the timeline at the close of a day with no events
// of its own, the cut timeline opens with this card for that moment. It wears
// an event card's shell with a clock on the spine, and states only what the
// flow model holds exactly for that day (lib/shared/flow-moment.ts). Its T2 is
// the event card's: Collateral and Debt as ledger cells
// (components/shared/event-ledger.tsx), closed on the side's closing line,
// opened on each asset as its last event left it (Held / Owed), the interest
// since (grown by its reserve's index, or on a side counted at its $1 face
// built at the rate in force), and the asset's total, in tokens and in USD
// where a price was recorded that day. How each side was reached is the
// Explanation's. It is not an event: no number, no filter, not counted, and
// it goes when the cut is cleared.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { EventCaptionContext } from "@/components/shared/mobile-spine";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useUsdShown } from "@/components/shared/timeline-display-context";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import {
  AssetLedgers,
  ClosedTokens,
  ClosedUsd,
  LedgerCell,
  LedgerTable,
  dayStamp,
  type LedgerProvs,
} from "@/components/shared/event-ledger";
import { signedTokens, signedUsd, type Ledger, type LedgerRow } from "@/lib/shared/event-ledger";
import { fmtTokens, tokenDecimals } from "@/lib/shared/flow-focus";
import { apportionSigned, wholeUsd } from "@/lib/shared/flows-sum";
import type { FlowMoment, MomentAsset } from "@/lib/shared/flow-moment";
import type { FlowGrowth, FlowModel, FlowSegment, FlowSide } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

const DAY_S = 86_400;

export interface MomentNeighbour {
  /** The event's name as the timeline gives it ("Open Trove"). */
  label: string;
  /** Unix seconds. */
  ts: number;
}

/** What the index is called on each side, by where it comes from. */
const INDEX_NAME: Record<FlowGrowth["basis"], Record<FlowSide, string>> = {
  "reserve-data": { collateral: "liquidity index", debt: "variable borrow index" },
  "hub-state": { collateral: "supply share price", debt: "drawn index" },
  comet: { collateral: "base supply index", debt: "base borrow index" },
  "ctoken-rows": { collateral: "exchange rate", debt: "debt growth" },
  "fluid-rows": { collateral: "supply exchange price", debt: "borrow exchange price" },
};
const INDEX_SOURCE: Record<FlowGrowth["basis"], string> = {
  "reserve-data": "the Pool's ReserveDataUpdated logs, grown at the logged rate to the moment",
  "hub-state": "the hub's state at its last event block (the drawn index grown at its logged rate to the moment)",
  comet:
    "the account's rows (each row's balance over the last at an unchanged principal), grown at the rate between them to the moment, and after the last row at the market's rate now",
  "ctoken-rows":
    "the account's rows (the market's exchange rate, and the debt before each row over the debt after the one before), in a straight line between two rows and to today's live read after the last",
  "fluid-rows":
    "the position's rows (each row's balance before it over the balance after the row before), grown at the rate between them to the moment, and after the last row at the vault's rate now",
};
/** Whose index it is, and what the grown balance is to the chain's. */
const INDEX_OWNER: Record<FlowGrowth["basis"], string> = {
  "reserve-data": "the reserve's",
  "hub-state": "the reserve's",
  comet: "the reserve's",
  "ctoken-rows": "the market's",
  "fluid-rows": "the vault's",
};
const INDEX_CLAIM: Record<FlowGrowth["basis"], string> = {
  "reserve-data": "The chain's balance is the scaled balance × the index, so this is what the chain held that day.",
  "hub-state": "The chain's balance is the scaled balance × the index, so this is what the chain held that day.",
  comet: "The chain's balance is the scaled balance × the index, so this is what the chain held that day.",
  "ctoken-rows":
    "The index runs in a straight line between the two rows around the day, so this is the chain's balance to within how the market's rate moved between them.",
  "fluid-rows":
    "The index runs in a straight line between the two rows around the day, so this is the vault's balance to within how its rate moved between them.",
};
const fmtIndex = (v: number) =>
  v.toLocaleString("en-US", { minimumSignificantDigits: 12, maximumSignificantDigits: 12 });
const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;

export function FlowMomentCard({
  moment,
  model,
  prev,
  next,
  today,
  isFirst,
  flash,
}: {
  moment: FlowMoment;
  model: FlowModel;
  /** The last event before the moment and the first after it, where the page
   *  holds them; the model's day stands in for a name it does not hold. */
  prev: MomentNeighbour | null;
  next: MomentNeighbour | null;
  /** Today's UTC day. */
  today: number;
  isFirst: boolean;
  /** The header rings for a moment after the chip's text brings it into view
   *  or it first comes into view after "Show timeline to {date}". */
  flash: boolean;
}) {
  const date = dayStamp(moment.day * DAY_S);
  const when = `the close of ${date}`;
  const lastStamp = dayStamp(moment.lastDay * DAY_S);
  const since = moment.day - moment.lastDay;
  // A name the page does not hold (an event inside a folder) is the chart's:
  // the kinds of flow that day's events made.
  const startDay = model.start / 86_400_000;
  const kindsOn = (day: number): string | null => {
    const t = model.ticks.find((x) => x.day === day - startDay);
    return t && t.kinds.length > 0 ? t.kinds.join(", ") : null;
  };
  const prevWords = prev?.label ?? kindsOn(moment.lastDay) ?? `the last event (${lastStamp})`;
  const nextName = next?.label ?? (moment.nextDay != null ? kindsOn(moment.nextDay) : null) ?? "an event";
  const nextWords =
    moment.nextDay == null
      ? "no later event"
      : moment.nextDay === today
        ? `next: ${nextName} today`
        : `next: ${nextName} on ${dayStamp(moment.nextDay * DAY_S)}`;
  const sides = (["collateral", "debt"] as const).filter(
    (s) => s === "collateral" || model.buckets.some((b) => b.side === "debt"),
  );
  const words = model.words.moment;

  // ── Receipts ──────────────────────────────────────────────────────────
  const indexInputs = (side: FlowSide, a: MomentAsset, g: FlowGrowth) => {
    const name = INDEX_NAME[g.basis][side];
    return [
      {
        label: "recorded balance",
        value: `${fmtPositionAmount(g.recorded)} ${a.symbol}`,
        kind: "chain" as const,
        note: `after the event on ${dayStamp(g.recordedDay * DAY_S)}`,
      },
      {
        label: `${name} at the close`,
        value: fmtIndex(g.index),
        kind: "chain-derived" as const,
        pclass: "state" as const,
        note: `${a.symbol}'s ${name} at the close of ${dayStamp(g.indexDay * DAY_S)}, from ${INDEX_SOURCE[g.basis]}`,
      },
      {
        label: `${name} at the event`,
        value: fmtIndex(g.anchor),
        kind: "chain-derived" as const,
        pclass: "state" as const,
        note: `at the event on ${dayStamp(g.recordedDay * DAY_S)}`,
      },
    ];
  };
  const tokensProv = (side: FlowSide, a: MomentAsset): Provenance =>
    a.grown
      ? {
          kind: "chain-derived",
          summary: `${a.symbol} ${side === "collateral" ? "held" : "owed"} at ${when} — the balance the last event recorded on ${dayStamp(a.grown.recordedDay * DAY_S)}, grown by the interest since: ${INDEX_OWNER[a.grown.basis]} ${INDEX_NAME[a.grown.basis][side]} at the close of ${date} over its value at that event. ${INDEX_CLAIM[a.grown.basis]}`,
          formula: "recorded balance × index at the close ÷ index at the event",
          inputs: indexInputs(side, a, a.grown),
        }
      : moment.sides[side].face && moment.accrual
        ? {
            kind: "chain-derived",
            summary: `${a.symbol} owed at ${when} — the debt the last event recorded on ${lastStamp}, plus the interest its rate builds on it to the end of the day, the figure the chart's debt line states for that day.`,
            formula: "recorded debt × (1 + annual rate × time ÷ 1 year)",
            inputs: [
              { label: "recorded debt", value: `${fmtPositionAmount(a.recorded)} ${a.symbol}`, kind: "chain" },
              {
                label: "annual rate",
                value: `${moment.accrual.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`,
                kind: "chain",
                note: "in force after the last event, fees included",
              },
              {
                label: "time",
                value: `${(moment.accrual.seconds / DAY_S).toLocaleString("en-US", { maximumFractionDigits: 2 })} days`,
                kind: "chain-derived",
                note: `from the last event to the end of ${date}`,
              },
            ],
          }
        : {
            kind: "chain",
            summary: `${a.symbol} ${side === "collateral" ? "held" : "owed"} at ${when} — the balance the position's last event recorded on ${lastStamp}. No event changed it by then.`,
            inputs: [
              { label: "recorded balance", value: `${fmtPositionAmount(a.recorded)} ${a.symbol}`, kind: "chain" },
            ],
          };
  const interestProv = (side: FlowSide, a: MomentAsset): Provenance => {
    const g = a.grown as FlowGrowth;
    return {
      kind: "chain-derived",
      summary: `${a.symbol} interest ${side === "collateral" ? "earned" : "owed"} to ${when} — from the event on ${dayStamp(g.recordedDay * DAY_S)}: the balance grown by ${INDEX_OWNER[g.basis]} ${INDEX_NAME[g.basis][side]}, less the balance that event recorded.${a.interestUsd != null ? " USD at the oracle price the index recorded for that day." : ""}`,
      formula:
        a.interestUsd != null
          ? "recorded × (index at the close ÷ index at the event − 1) × price"
          : "recorded × (index at the close ÷ index at the event − 1)",
      ...(a.interestUsd != null ? { pclass: "oracle" as const } : {}),
      inputs: [
        ...indexInputs(side, a, g),
        ...(a.price != null
          ? [
              {
                label: "price",
                value: `$${a.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
                kind: "chain-derived" as const,
                pclass: "oracle" as const,
                note: `last oracle price recorded by the end of ${date}`,
              },
            ]
          : []),
      ],
    };
  };
  const usdProv = (a: MomentAsset): Provenance => ({
    kind: "chain-derived",
    summary: `${a.symbol} in USD at ${when} — the balance at the oracle price the index recorded for that day.`,
    formula: "balance × price at the day's end",
    pclass: "oracle",
    inputs: [
      { label: "balance", value: `${fmtPositionAmount(a.tokens)} ${a.symbol}`, kind: "chain" },
      {
        label: "price",
        value: `$${(a.price ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
        kind: "chain-derived",
        pclass: "oracle",
        note: `last oracle price recorded by the end of ${date}`,
      },
    ],
  });
  const heldSeg = (side: FlowSide): FlowSegment => ({
    key: `${side}-held`,
    label: side === "collateral" ? "Held" : "Owed",
    fill: "held",
    width: moment.sides[side].held,
    value: moment.sides[side].held,
  });
  const sideUsd = (side: FlowSide): number | null => {
    const s = moment.sides[side];
    if (s.face || !s.priced || s.assets.length === 0) return null;
    return s.assets.reduce((t, a) => t + (a.usd ?? 0), 0);
  };

  // ── The header: the moment and its place between the events ──────────
  const header = (
    <div className="px-5 pt-4 pb-3" data-flow-moment-header="" {...(flash ? { "data-flow-day-flash": "" } : {})}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-foreground" data-flow-moment-date="">
          {date} · close
        </span>
        <span className="text-xs text-rb-500" data-flow-moment-between="">
          {plural(since, "day")} after {prevWords} · {nextWords}
        </span>
      </div>
    </div>
  );

  // ── The open card: each side as an event card's ledger cell ────────────
  // Per asset: what its last event left (Held / Owed), the interest since,
  // and the asset's total line; the side's USD total under several assets.
  const usdShown = useUsdShown();
  const focus = useFlowFocus();
  /** The largest running total of the side's flows by the moment, in the
   *  asset's token: an event's ledger prints the asset at decimals sized to
   *  it (lib/shared/flow-focus.ts `tokenDecimals`), and so does this one. A
   *  side of one asset counts every leg on its lines; a side of several, the
   *  asset's own. */
  const flowMax = (side: FlowSide, symbol: string): number => {
    const keys = new Set(model.buckets.filter((b) => b.side === side).map((b) => b.key));
    const one = moment.sides[side].assets.length === 1;
    const sums: Record<string, number> = {};
    for (const e of focus?.events ?? []) {
      if (e.ts > moment.endTs) continue;
      for (const l of e.legs)
        if (keys.has(l.bucket) && l.amount != null && (one || l.symbol === symbol))
          sums[l.bucket] = (sums[l.bucket] ?? 0) + l.amount;
    }
    return Math.max(0, ...Object.values(sums).map((v) => Math.abs(v)));
  };
  const heldWord = (side: FlowSide) => (side === "collateral" ? "Held" : "Owed");
  /** The interest since the last event, in tokens: the index's growth, or on
   *  a side counted at its face the interest its rate built. */
  const interestOf = (side: FlowSide, a: MomentAsset): number | null =>
    a.grown && a.interest != null
      ? a.interest
      : moment.sides[side].face && moment.accrual && a.tokens !== a.recorded
        ? a.tokens - a.recorded
        : null;
  const sinceDay = (a: MomentAsset) => a.grown?.recordedDay ?? moment.lastDay;
  const heldProv = (side: FlowSide, a: MomentAsset): Provenance => ({
    kind: "chain",
    summary: `${a.symbol} ${side === "collateral" ? "held" : "owed"} — as the position's last event left it on ${dayStamp(sinceDay(a) * DAY_S)}.`,
    inputs: [{ label: "recorded balance", value: `${fmtPositionAmount(a.recorded)} ${a.symbol}`, kind: "chain" }],
  });
  const heldUsdProv = (side: FlowSide, a: MomentAsset): Provenance => ({
    kind: "chain-derived",
    summary: `${a.symbol} ${side === "collateral" ? "held" : "owed"} in USD — as its last event left it on ${dayStamp(sinceDay(a) * DAY_S)}, at the oracle price recorded for ${date}.`,
    formula: "recorded balance × price at the day's end",
    pclass: "oracle",
    inputs: [
      { label: "recorded balance", value: `${fmtPositionAmount(a.recorded)} ${a.symbol}`, kind: "chain" },
      {
        label: "price",
        value: `$${(a.price ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
        kind: "chain-derived",
        pclass: "oracle",
        note: `last oracle price recorded by the end of ${date}`,
      },
    ],
  });
  const faceInterestProv = (a: MomentAsset): Provenance => ({
    kind: "chain-derived",
    summary: `${a.symbol} interest owed to ${when} — what the rate in force after the last event (${lastStamp}) builds on the debt that event recorded, to the end of the day.`,
    formula: "recorded debt × annual rate × time ÷ 1 year",
    inputs: [
      { label: "recorded debt", value: `${fmtPositionAmount(a.recorded)} ${a.symbol}`, kind: "chain" },
      ...(moment.accrual
        ? [
            {
              label: "annual rate",
              value: `${moment.accrual.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`,
              kind: "chain" as const,
              note: "in force after the last event, fees included",
            },
            {
              label: "time",
              value: `${(moment.accrual.seconds / DAY_S).toLocaleString("en-US", { maximumFractionDigits: 2 })} days`,
              kind: "chain-derived" as const,
              note: `from the last event to the end of ${date}`,
            },
          ]
        : []),
    ],
  });

  /** One asset's ledger: Held / Owed, the interest since, its total, at the
   *  decimals an event's ledger prints the asset at; `dollars` its total in
   *  whole USD (the side's share where several assets add to its total). */
  const assetLedger = (
    side: FlowSide,
    a: MomentAsset,
    dollars: number | null,
  ): { ledger: Ledger; provs: LedgerProvs } => {
    const face = moment.sides[side].face;
    const interest = interestOf(side, a);
    const decimals = tokenDecimals(
      Math.max(flowMax(side, a.symbol), Math.abs(a.recorded), Math.abs(a.tokens), Math.abs(interest ?? 0)),
      face,
    );
    const scale = 10 ** decimals;
    const totalUnits = Math.round(a.tokens * scale);
    const interestUnits = interest != null ? Math.round(interest * scale) : null;
    const heldUnits = totalUnits - (interestUnits ?? 0);
    const interestDollars = dollars != null && interestUnits != null ? Math.round(a.interestUsd ?? 0) : null;
    const heldDollars = dollars != null ? dollars - (interestDollars ?? 0) : null;
    const usdCell = (d: number | null) => (d == null ? null : { dollars: d, text: signedUsd(d, model.unit) });
    const rows: LedgerRow[] = [
      {
        key: `${side}-${a.symbol}-held`,
        line: `${side}-held`,
        label: heldWord(side),
        role: "flow",
        seg: heldSeg(side),
        tokens: { units: heldUnits, text: signedTokens(heldUnits, decimals) },
        usd: usdCell(heldDollars),
      },
    ];
    if (interestUnits != null)
      rows.push({
        key: `${side}-${a.symbol}-interest`,
        line: `${side}-interest`,
        label: `Interest since ${dayStamp(sinceDay(a) * DAY_S)}`,
        role: "interest",
        seg: null,
        tokens: { units: interestUnits, text: signedTokens(interestUnits, decimals) },
        usd: usdCell(interestDollars),
      });
    const ledger: Ledger = {
      side,
      symbol: a.symbol,
      decimals,
      rows,
      tokens: { before: null, after: fmtTokens(totalUnits / scale, decimals), units: totalUnits },
      usd: dollars != null ? { before: null, after: wholeUsd(dollars, model.unit), dollars } : null,
    };
    const provs: LedgerProvs = {
      token: (r) =>
        r.role === "interest" ? (a.grown ? interestProv(side, a) : faceInterestProv(a)) : heldProv(side, a),
      usd: (r) => (r.role === "interest" ? interestProv(side, a) : heldUsdProv(side, a)),
      totalTokens: tokensProv(side, a),
      totalUsd: a.usd != null ? usdProv(a) : undefined,
    };
    return { ledger, provs };
  };

  /** The closed row's token figure: the ledger's total. */
  const closedFigure = (l: Ledger, a: MomentAsset) => l.tokens?.after ?? fmtPositionAmount(a.tokens);

  const cell = (side: FlowSide) => {
    const s = moment.sides[side];
    const usd = sideUsd(side);
    const multi = s.assets.length > 1;
    // Several assets add only in USD: each one's whole dollars apportioned to
    // the side's total.
    const shares =
      multi && usd != null
        ? apportionSigned(
            s.assets.map((a) => a.usd ?? 0),
            Math.round(usd),
          )
        : s.assets.map((a) => (a.usd != null ? Math.round(a.usd) : null));
    const built = s.assets.map((a, i) => ({ a, ...assetLedger(side, a, shares[i]) }));
    const shownFor = (a: MomentAsset) => a.usd != null && usdShown(a.symbol, a.usd, a.tokens);
    const sideTotal =
      multi && usd != null ? { before: null, after: wholeUsd(usd, model.unit), dollars: Math.round(usd) } : null;
    const totalProv = flowSegmentProv(heldSeg(side), side, when, false, model.daily);
    const ledger =
      built.length === 0 ? null : multi ? (
        <AssetLedgers
          side={side}
          assets={built.map((b) => b.ledger)}
          usd={sideTotal}
          at={when}
          totalUsdProv={totalProv}
          usdShownFor={(l) => {
            const b = built.find((x) => x.ledger === l);
            return !!b && l.usd != null && shownFor(b.a);
          }}
          provsFor={(l) => built.find((x) => x.ledger.symbol === l.symbol)?.provs}
        />
      ) : (
        <LedgerTable
          ledger={
            shownFor(built[0].a)
              ? built[0].ledger
              : { ...built[0].ledger, usd: null, rows: built[0].ledger.rows.map((r) => ({ ...r, usd: null })) }
          }
          provs={built[0].provs}
          name={model.labels[side]}
          at={when}
          daily={model.daily}
        />
      );
    // Closed: the cell's closing line, as an event card's: one asset's tokens
    // (USD after a divider), or several assets' USD total and an icon each.
    const closed =
      built.length === 0 ? (
        <span className="text-sm text-rb-500">none</span>
      ) : multi && usd != null ? (
        <span className="flex flex-wrap items-center justify-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            <Prov info={totalProv}>{wholeUsd(usd, model.unit)}</Prov>
          </span>
          <span className="ml-1 inline-flex items-center gap-1" data-closed-assets="">
            {built.map(({ a, ledger: l }) => (
              <Prov key={a.symbol} info={tokensProv(side, a)}>
                <RevealTip
                  tip={`${closedFigure(l, a)} ${a.symbol}`}
                  label={`${closedFigure(l, a)} ${a.symbol}`}
                  align="end"
                >
                  <TokenChipIcon symbol={a.symbol} size={16} filterable={false} untitled />
                </RevealTip>
              </Prov>
            ))}
          </span>
        </span>
      ) : (
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {built.map(({ a, ledger: l }) => (
            <span key={a.symbol} className="flex flex-wrap items-center justify-end gap-1">
              <ClosedTokens>
                <Prov info={tokensProv(side, a)} icon={<TokenChipIcon symbol={a.symbol} size={16} />}>
                  <span className="text-sm font-semibold tabular-nums">{closedFigure(l, a)}</span>
                </Prov>
              </ClosedTokens>
              {!multi && a.usd != null && shownFor(a) && (
                <ClosedUsd after={<Prov info={usdProv(a)}>{wholeUsd(a.usd, model.unit)}</Prov>} />
              )}
            </span>
          ))}
        </span>
      );
    return (
      <LedgerCell
        key={side}
        side={side}
        ledger={ledger}
        data={{ "data-receipt-cell": side, "data-flow-moment-cell": side }}
        label={model.labels[side]}
      >
        {closed}
      </LedgerCell>
    );
  };
  const detail = (
    <div className="px-5 py-2" data-flow-moment-detail="">
      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-flow-row-dense sm:grid-cols-2" data-receipt="open">
        {sides.map((s) => cell(s))}
      </div>
    </div>
  );

  // ── The Explanation: how each side's figures were reached ──────────────
  /** A side's balances, grown by interest since the one event day that
   *  recorded them all, or since each one's own. */
  const grownWords = (side: FlowSide): string => {
    const days = new Set(moment.sides[side].assets.map((a) => a.grown?.recordedDay ?? null));
    const verb = side === "collateral" ? "earned" : "owed";
    const one = days.size === 1 ? [...days][0] : null;
    return one != null
      ? `as the last event left it on ${dayStamp(one * DAY_S)}, grown by the interest ${verb} since, to the close of ${date}.`
      : `each balance as its last event left it, grown by the interest ${verb} since, to the close of ${date}.`;
  };
  const sideNote = (side: FlowSide): string | null => {
    const s = moment.sides[side];
    if (s.assets.length === 0) return null;
    const priced = s.assets.some((a) => a.usd != null) ? ` USD at the price recorded for ${date}.` : "";
    const body =
      s.face && moment.accrual
        ? `the debt the last event recorded, plus the interest at ${moment.accrual.rate.toLocaleString("en-US", { maximumFractionDigits: 2 })}% a year built on it to the end of ${date}.`
        : s.assets.some((a) => a.grown)
          ? `${grownWords(side)}${priced}`
          : `as the last event left it on ${lastStamp}; no event changed it by then.${priced}`;
    const noPrice = !s.priced
      ? ` ${words?.noPrice?.[side] ?? `No price was recorded for this side on ${date}, so it is stated in tokens.`}`
      : "";
    return `${model.labels[side]}: ${body}${noPrice}`;
  };
  const explainer = (
    <div className="space-y-2 text-sm leading-relaxed text-rb-500">
      <p>
        The position at the close of {date}, where the timeline is cut. No event happened that day, so this card is not
        an event: it has no number, the filters and the count leave it out, and it goes when the cut is cleared.
        {(() => {
          const g = sides.flatMap((s) => moment.sides[s].assets).find((a) => a.grown)?.grown;
          if (!g) return null;
          return g.basis === "ctoken-rows"
            ? " Each balance is grown by the interest since its last event: the balance that event recorded × the market's index at the close of the day ÷ its index at that event. The index runs in a straight line between the account's rows, so this is the chain's balance to within how the rate moved between them."
            : g.basis === "fluid-rows"
              ? " Each balance is grown by the interest since its last event: the balance that event recorded × the vault's exchange price at the close of the day ÷ its exchange price at that event. The exchange price runs in a straight line between the position's rows, so this is the vault's balance to within how its rate moved between them."
              : " Each balance is grown by the interest since its last event: the balance that event recorded × the reserve's index at the close of the day ÷ its index at that event, which is what the chain held.";
        })()}{" "}
        Each side&rsquo;s toggle opens its ledger: each asset as its last event left it, the interest since, and what it
        comes to at the close.
      </p>
      {sides.map((s) => {
        const n = sideNote(s);
        return n ? (
          <p key={s} data-flow-moment-side-note={s}>
            {n}
          </p>
        ) : null;
      })}
      {(words?.notes ?? []).map((n) => (
        <p key={n} data-flow-moment-note="">
          {n}
        </p>
      ))}
    </div>
  );

  return (
    <EventCaptionContext.Provider value={{ kind: "Position at close", ts: moment.endTs }}>
      <div id="flow-moment" data-flow-moment={moment.day} data-anatomy="L4" className="rounded-xl">
        <EventCard
          avatar={null}
          iconColumn={<SpineColumn icon="moment" isFirst={isFirst} isLast={false} tip={null} />}
          header={header}
          detail={detail}
          detailLabel={`The position at the close of ${date}`}
          explainer={explainer}
          caption="Position at close"
        />
      </div>
    </EventCaptionContext.Provider>
  );
}
