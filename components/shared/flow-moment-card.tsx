"use client";

// The state card (rails-ops reference/lifetime-flows-scrubber.md, "The day
// links the chart and the timeline"): where the Lifetime flows chart's "Show timeline to {date}" cuts the timeline at the close of a day with no events of its
// own, the cut timeline opens with this card for that moment. It wears an
// event card's shell with a clock on the spine, and states only what the
// flow model holds exactly for that day (lib/shared/flow-moment.ts): each
// asset as its last event left it, grown by its interest since where the
// route serves the reserves' indexes (the Aave family), with that interest on
// a line of its own; its USD where a price was recorded that day; a side
// counted at its $1 face with the interest built to the moment; and each
// side's ledger behind its toggle (components/shared/event-ledger.tsx) where
// every figure has a price for the day. It is not an event: no number,
// no filter, not counted, and it goes when the cut is cleared.

import { useMemo, type ReactNode } from "react";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { EventCaptionContext } from "@/components/shared/mobile-spine";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { LedgerCell, LedgerTable, dayStamp } from "@/components/shared/event-ledger";
import { dollarLedger } from "@/lib/shared/event-ledger";
import { eventSideSum } from "@/lib/shared/flow-focus";
import { wholeUsd, wholeUsdOrUnder } from "@/lib/shared/flows-sum";
import type { EventCum } from "@/lib/shared/flow-focus";
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

const SIDE_WORD: Record<FlowSide, string> = { collateral: "Collateral", debt: "Debt" };

/** What the index is called on each side, by where it comes from. */
const INDEX_NAME: Record<FlowGrowth["basis"], Record<FlowSide, string>> = {
  "reserve-data": { collateral: "liquidity index", debt: "variable borrow index" },
  "hub-state": { collateral: "supply share price", debt: "drawn index" },
};
const INDEX_SOURCE: Record<FlowGrowth["basis"], string> = {
  "reserve-data": "the Pool's ReserveDataUpdated logs, grown at the logged rate to the moment",
  "hub-state": "the hub's state at its last event block (the drawn index grown at its logged rate to the moment)",
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
          summary: `${a.symbol} ${side === "collateral" ? "held" : "owed"} at ${when} — the balance the last event recorded on ${dayStamp(a.grown.recordedDay * DAY_S)}, grown by the interest since: the reserve's ${INDEX_NAME[a.grown.basis][side]} at the close of ${date} over its value at that event. The chain's balance is the scaled balance × the index, so this is what the chain held that day.`,
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
      summary: `${a.symbol} interest ${side === "collateral" ? "earned" : "owed"} to ${when} — from the event on ${dayStamp(g.recordedDay * DAY_S)}: the balance grown by the reserve's ${INDEX_NAME[g.basis][side]}, less the balance that event recorded.${a.interestUsd != null ? " USD at the oracle price the index recorded for that day." : ""}`,
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

  // ── The header: the moment, its place between the events, the figures ──
  const figure = (side: FlowSide): ReactNode => {
    const s = moment.sides[side];
    const usd = sideUsd(side);
    return (
      <span key={side} className="inline-flex items-center gap-1.5 text-sm" data-flow-moment-side={side}>
        <span className="text-rb-500">{SIDE_WORD[side]}</span>
        {s.assets.length === 0 ? (
          <span className="font-bold text-foreground">none</span>
        ) : usd != null && s.assets.length > 1 ? (
          <Prov info={flowSegmentProv(heldSeg(side), side, when, false, model.daily)}>
            <span className="font-bold text-foreground">{wholeUsd(usd)}</span>
          </Prov>
        ) : (
          s.assets.map((a) => (
            <span key={a.symbol} className="inline-flex items-center gap-1">
              <Prov info={tokensProv(side, a)}>
                <span className="font-bold text-foreground">{fmtPositionAmount(a.tokens)}</span>
              </Prov>
              <TokenChipIcon symbol={a.symbol} size={16} filterable={false} />
              {a.usd != null && (
                <Prov info={usdProv(a)}>
                  <span className="text-rb-500">{wholeUsd(a.usd)}</span>
                </Prov>
              )}
            </span>
          ))
        )}
      </span>
    );
  };
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
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">{sides.map((s) => figure(s))}</div>
    </div>
  );

  // ── The open card: each side's assets, or its sum ──────────────────────
  const cum: EventCum = useMemo(() => {
    let ri = -1;
    for (let i = 0; i < model.rows.length && model.rows[i].day <= moment.stop; i++) ri = i;
    const at = ri >= 0 ? model.rows[ri].cum : {};
    return { before: at, after: at, exact: true, stop: moment.stop, buckets: new Set(), legs: [], later: false };
  }, [model, moment.stop]);

  /** The cell's line on balances grown by interest: since the one event day
   *  that recorded them all, or since each one's own. */
  const grownWords = (side: FlowSide): string => {
    const days = new Set(moment.sides[side].assets.map((a) => a.grown?.recordedDay ?? null));
    const verb = side === "collateral" ? "earned" : "owed";
    const one = days.size === 1 ? [...days][0] : null;
    return one != null
      ? `As the last event left it on ${dayStamp(one * DAY_S)}, grown by the interest ${verb} since, to the close of ${date}.`
      : `Each balance as its last event left it, grown by the interest ${verb} since, to the close of ${date}.`;
  };
  const cell = (side: FlowSide) => {
    const s = moment.sides[side];
    // The cell's ledger: the side's flows to the moment in dollars, where
    // every figure on it has a price for the day.
    const ledger =
      s.priced && s.assets.length > 0
        ? (() => {
            const rows = eventSideSum(model, side, cum, s.held);
            return (
              <LedgerTable
                ledger={dollarLedger({
                  model,
                  side,
                  ev: null,
                  lines: rows.lines,
                  dollars: rows.total.dollars,
                  before: null,
                })}
                name={SIDE_WORD[side]}
                at={when}
                totalUsdProv={flowSegmentProv(heldSeg(side), side, when, false, model.daily)}
                daily={model.daily}
              />
            );
          })()
        : null;
    return (
      <LedgerCell
        key={side}
        side={side}
        ledger={ledger}
        alignRight={false}
        data={{ "data-receipt-cell": side, "data-flow-moment-cell": side }}
        label={SIDE_WORD[side]}
      >
        <>
          {s.assets.length === 0 ? (
            <p className="text-[13px] text-rb-500">Nothing {side === "collateral" ? "held" : "owed"}.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px] tabular-nums">
              {s.assets.map((a) => (
                <li key={a.symbol} className="flex flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <TokenChipIcon symbol={a.symbol} size={14} filterable={false} />
                      {a.symbol}
                    </span>
                    <span className="inline-flex items-baseline gap-2">
                      <Prov info={tokensProv(side, a)}>{fmtPositionAmount(a.tokens)}</Prov>
                      {a.usd != null && (
                        <Prov info={usdProv(a)}>
                          <span className="text-rb-500">{wholeUsd(a.usd)}</span>
                        </Prov>
                      )}
                    </span>
                  </span>
                  {a.grown && a.interest != null && (
                    <span
                      className="flex items-baseline justify-between gap-2 pl-5 text-xs text-rb-500"
                      data-flow-moment-interest={`${side}:${a.symbol}`}
                    >
                      <span>Interest since {dayStamp(a.grown.recordedDay * DAY_S)}</span>
                      <span className="inline-flex items-baseline gap-2">
                        <Prov info={interestProv(side, a)}>
                          <span className="text-foreground">+{fmtPositionAmount(a.interest)}</span>
                        </Prov>
                        {a.interestUsd != null && (
                          <Prov info={interestProv(side, a)}>
                            <span>{wholeUsdOrUnder(a.interestUsd)}</span>
                          </Prov>
                        )}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs leading-snug text-rb-500">
            {s.face && moment.accrual
              ? `The debt the last event recorded, plus the interest at ${moment.accrual.rate.toLocaleString("en-US", { maximumFractionDigits: 2 })}% a year built on it to the end of ${date}.`
              : s.assets.some((a) => a.grown)
                ? `${grownWords(side)}${s.assets.some((a) => a.usd != null) ? ` USD at the price recorded for ${date}.` : ""}`
                : `As the last event left it on ${lastStamp}; no event changed it by then.${s.assets.some((a) => a.usd != null) ? ` USD at the price recorded for ${date}.` : ""}`}
          </p>
        </>
        {!s.priced && s.assets.length > 0 && (
          <p className="mt-1.5 text-xs leading-snug text-rb-500" data-flow-moment-no-price={side}>
            {words?.noPrice?.[side] ?? `No price was recorded for this side on ${date}, so it is stated in tokens.`}
          </p>
        )}
      </LedgerCell>
    );
  };
  const detail = (
    <div className="px-5 py-2" data-flow-moment-detail="">
      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-flow-row-dense sm:grid-cols-2" data-receipt="open">
        {sides.map((s) => cell(s))}
      </div>
      {(words?.notes ?? []).map((n) => (
        <p key={n} className="mt-2 text-xs leading-snug text-rb-500" data-flow-moment-note="">
          {n}
        </p>
      ))}
    </div>
  );
  const explainer = (
    <p className="text-sm leading-relaxed text-rb-500">
      The position at the close of {date}, where the timeline is cut. No event happened that day, so this card is not an
      event: it has no number, the filters and the count leave it out, and it goes when the cut is cleared.
      {sides.some((s) => moment.sides[s].assets.some((a) => a.grown)) &&
        " Each balance is grown by the interest since its last event: the balance that event recorded × the reserve's index at the close of the day ÷ its index at that event, which is what the chain held."}{" "}
      Each side&rsquo;s toggle opens its ledger: its flows up to that day, where every figure on it has a price for the
      day.
    </p>
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
