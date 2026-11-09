"use client";

// A Uniswap position's card (U1; rails-ops ui-jobs 556, door 1): the two
// tokens it holds now, its worth in the pool's quote token, the fees not yet
// collected and the day it opened, then its range drawn against the price.
// On the shared detail card (its ⋮, read stamp and (i)); the figures are
// plain and the chain stays in each figure's receipt (decision 0059 point 1).

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { Segs, UniswapReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { poolPosition, type PoolPosition } from "@/lib/uniswap/position";
import { cardProv, type UniReceiptContext } from "@/lib/uniswap/provenance";
import type { UniPositionRead } from "@/lib/uniswap/types";
import { CARD_WORDS, cardExplainer, day, num, positionNumber, shown } from "@/lib/uniswap/words";

/** The range against the price, on a log scale padded around both. */
function RangeBar({ p, c }: { p: PoolPosition; c: UniReceiptContext }) {
  if (p.range.full)
    return (
      <p className="text-xs text-rb-500" data-range-bar="full">
        <Prov info={cardProv("range", c)}>{CARD_WORDS.fullRange}</Prov>
      </p>
    );
  const s = shown(p);
  const lo = Math.log(Math.min(s.low, s.price));
  const hi = Math.log(Math.max(s.high, s.price));
  const pad = (hi - lo) * 0.15 || 0.1;
  const x = (v: number) => ((Math.log(v) - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  return (
    <div data-range-bar={p.inRange ? "in" : s.side}>
      <div className="relative h-6" aria-hidden>
        <div className="absolute top-2.5 h-1 w-full rounded bg-rb-200 dark:bg-rb-700" />
        <div
          className="absolute top-1.5 h-3 rounded bg-blue-500/40"
          style={{ left: `${x(s.low)}%`, width: `${Math.max(0.5, x(s.high) - x(s.low))}%` }}
        />
        <div className="absolute top-0 h-6 w-0.5 bg-foreground" style={{ left: `${x(s.price)}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums text-rb-500">
        <span>
          <Prov info={cardProv("range", c)}>{CARD_WORDS.rangeText(s.low, s.high)}</Prov>
        </span>
        <span>
          <Prov info={cardProv("price", c)}>{CARD_WORDS.priceText(s.price, s.unit)}</Prov>
        </span>
      </div>
    </div>
  );
}

function slots(r: UniPositionRead): PositionCardSlots {
  const p = poolPosition(r);
  const c = { p, r };
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const words = cardExplainer(p);
  const heads: PositionCardHead[] = [
    {
      id: "holds",
      label: CARD_WORDS.holds,
      labelTip: CARD_WORDS.holdsTip,
      value: (
        <Prov info={cardProv("holds", c)}>
          {num(p.holds.base)} {B}
        </Prov>
      ),
      sub: (
        <span data-figure="holds-quote">
          and {num(p.holds.quote)} {Q}
        </span>
      ),
    },
    {
      id: "worth",
      label: CARD_WORDS.worth,
      labelTip: CARD_WORDS.worthTip(Q),
      value: (
        <Prov info={cardProv("worth", c)}>
          {num(p.valueNow)} {Q}
        </Prov>
      ),
    },
    {
      id: "uncollected",
      label: CARD_WORDS.uncollected,
      labelTip: CARD_WORDS.uncollectedTip,
      value: (
        <Prov info={cardProv("uncollected", c)}>
          {num(p.uncollected)} {Q}
        </Prov>
      ),
    },
    {
      id: "opened",
      label: CARD_WORDS.opened,
      labelTip: CARD_WORDS.openedTip,
      value: p.opened ? <Prov info={cardProv("opened", c)}>{day(p.opened.time)}</Prov> : null,
    },
  ];
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    identity: <span className="text-xs text-rb-500">{positionNumber(p.id)}</span>,
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <UniswapReadStamp c={c} what="Every figure on this card" />,
    explainer: {
      body: (
        <div data-position-explanation="">
          {words.map((g) => (
            <ExplainGroup key={g.title} title={g.title}>
              {g.bullets.map((b, i) => (
                <ExplainBullet key={i}>
                  <Segs segs={b} />
                </ExplainBullet>
              ))}
            </ExplainGroup>
          ))}
        </div>
      ),
    },
    learnMore: null,
    band: (
      <div className="mt-4" data-anatomy="U1.1">
        <div className="mb-1 text-xs text-rb-500">{CARD_WORDS.rangeLabel}</div>
        <RangeBar p={p} c={c} />
      </div>
    ),
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot(Q)}</p>,
    panel: [[], []],
  };
}

export function UniswapPositionCard({ r }: { r: UniPositionRead }) {
  return (
    <div
      data-anatomy="U1"
      data-position-card={`${r.version}:${r.id}`}
      data-pool={r.pool}
      data-liquidity-raw={r.liquidity}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
