"use client";

// A Uniswap position's card (U1; rails-ops ui-jobs 556, door 1): the two
// tokens it holds now, its worth in the pool's quote token, the fees not yet
// collected and the day it opened, then its range drawn against the price.
// On the shared detail card (its ⋮, read stamp and (i)); the figures are
// plain and the chain stays in each figure's receipt (decision 0059 point 1).

import { Prov, type Provenance } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { Segs, UniswapReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { poolPosition } from "@/lib/uniswap/position";
import { cardProv } from "@/lib/uniswap/provenance";
import type { UniProtocol } from "@/lib/uniswap/deployments";
import type { UniPositionRead } from "@/lib/uniswap/types";
import { CARD_WORDS, cardExplainer, day, num, positionNumber, shown } from "@/lib/uniswap/words";

/** The range against the price, on a log scale padded around both. Uniswap's and Aerodrome's cards
 *  share it: `s` is the prices as shown (lib/uniswap/words.ts `shown`). */
export function RangeBar({
  s,
  full,
  inRange,
  rangeInfo,
  priceInfo,
}: {
  s: ReturnType<typeof shown>;
  full: boolean;
  inRange: boolean;
  rangeInfo: Provenance;
  priceInfo: Provenance;
}) {
  if (full)
    return (
      <p className="text-xs text-rb-500" data-range-bar="full">
        <Prov info={rangeInfo}>{CARD_WORDS.fullRange}</Prov>
      </p>
    );
  const lo = Math.log(Math.min(s.low, s.price));
  const hi = Math.log(Math.max(s.high, s.price));
  const pad = (hi - lo) * 0.15 || 0.1;
  const x = (v: number) => ((Math.log(v) - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  return (
    <div data-range-bar={inRange ? "in" : s.side}>
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
          <Prov info={rangeInfo}>{CARD_WORDS.rangeText(s.low, s.high)}</Prov>
        </span>
        <span>
          <Prov info={priceInfo}>{CARD_WORDS.priceText(s.price, s.unit)}</Prov>
        </span>
      </div>
    </div>
  );
}

function slots(r: UniPositionRead, protocol: UniProtocol): PositionCardSlots {
  const p = poolPosition(r, protocol);
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
      labelTip: p.staked ? CARD_WORDS.uncollectedTipStaked(p.staked.user) : CARD_WORDS.uncollectedTip,
      value: (
        <Prov info={cardProv("uncollected", c)}>
          {num(p.uncollected)} {Q}
        </Prov>
      ),
    },
    // PancakeSwap: CAKE not yet harvested, where the position is staked in the farm.
    ...(p.staked
      ? [
          {
            id: "cake",
            label: CARD_WORDS.cake,
            labelTip: CARD_WORDS.cakeTip,
            value: (
              <Prov info={cardProv("cake", c)}>
                {num(p.staked.pendingCake)} {p.staked.cake.symbol}
              </Prov>
            ),
          },
        ]
      : []),
    // Opened: where the chain's reads include the position's history (none on Base).
    ...(p.historyRead
      ? [
          {
            id: "opened",
            label: CARD_WORDS.opened,
            labelTip: CARD_WORDS.openedTip,
            value: p.opened ? <Prov info={cardProv("opened", c)}>{day(p.opened.time)}</Prov> : null,
          },
        ]
      : []),
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
        <RangeBar
          s={shown(p)}
          full={p.range.full}
          inRange={p.inRange}
          rangeInfo={cardProv("range", c)}
          priceInfo={cardProv("price", c)}
        />
      </div>
    ),
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot(Q)}</p>,
    panel: [[], []],
  };
}

export function UniswapPositionCard({ r, protocol = "uniswap" }: { r: UniPositionRead; protocol?: UniProtocol }) {
  return (
    <div
      data-anatomy="U1"
      data-position-card={`${r.version}:${r.id}`}
      data-pool={r.pool}
      data-liquidity-raw={r.liquidity}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r, protocol)} />
    </div>
  );
}
