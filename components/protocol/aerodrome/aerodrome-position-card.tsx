"use client";

// An Aerodrome position's card (U1; rails-ops ui-jobs 566, 594): Uniswap's card
// (components/protocol/uniswap/uniswap-position-card.tsx) with staking in it.
// The two tokens it holds now and its value in the pool's quote token; then,
// unstaked, its uncollected fees, or, staked, the AERO to claim and the wallet
// that staked it; then the range drawn against the price.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { RangeBar } from "@/components/protocol/uniswap/uniswap-position-card";
import { PoolReadStamp, Segs } from "@/components/protocol/uniswap/uniswap-readout";
import { aeroPosition } from "@/lib/aerodrome/position";
import { cardProv, readContracts, type AeroReceiptContext } from "@/lib/aerodrome/provenance";
import type { AeroPositionRead } from "@/lib/aerodrome/types";
import { aeroStatus, cardExplainer, cardWords } from "@/lib/aerodrome/words";
import { num, positionNumber, short, shown } from "@/lib/uniswap/words";

/** Every figure's read stamp on an Aerodrome page. */
export function AerodromeReadStamp({ c, what }: { c: AeroReceiptContext; what: string }) {
  return (
    <PoolReadStamp chainId={c.r.chainId} head={c.r.head} then={c.r.then} contracts={readContracts(c)} what={what} />
  );
}

function slots(r: AeroPositionRead): PositionCardSlots {
  const p = aeroPosition(r);
  const c = { p, r };
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const R = p.site.reward.symbol;
  const CARD_WORDS = cardWords(p.site);
  const words = cardExplainer(p);
  const closed = BigInt(p.liquidity) === BigInt(0);
  const unit = (sym: string) => <span className="text-base font-medium">{sym}</span>;
  const heads: PositionCardHead[] = [
    {
      id: "holds",
      label: CARD_WORDS.holds,
      labelTip: CARD_WORDS.holdsTip,
      value: closed ? (
        "—"
      ) : (
        <Prov info={cardProv("holds", c)}>
          {num(p.holds.base)} {unit(B)}
        </Prov>
      ),
      sub: closed ? undefined : (
        <span data-figure="holds-quote">
          <Prov info={cardProv("holds", c)}>
            {num(p.holds.quote)} {Q}
          </Prov>
        </span>
      ),
    },
    {
      id: "worth",
      label: CARD_WORDS.worth,
      labelTip: CARD_WORDS.worthTip(Q),
      value: closed ? (
        "—"
      ) : (
        <Prov info={cardProv("worth", c)}>
          {num(p.valueNow)} {unit(Q)}
        </Prov>
      ),
    },
  ];
  if (p.aero) {
    heads.push({
      id: "claimable",
      label: CARD_WORDS.claimable,
      labelTip: CARD_WORDS.claimableTip,
      value:
        p.aero.claimable === null ? null : (
          <Prov info={cardProv("claimable", c)}>
            {num(p.aero.claimable)} {unit(R)}
          </Prov>
        ),
      sub:
        p.aero.claimableValue !== null ? (
          <span data-figure="claimable-quote">
            worth {num(p.aero.claimableValue)} {Q}
          </span>
        ) : undefined,
    });
    heads.push({
      id: "owner",
      label: CARD_WORDS.owner,
      labelTip: CARD_WORDS.ownerTip,
      value: (
        <Prov info={cardProv("owner", c)}>{p.holder ? <span className="font-mono">{short(p.holder)}</span> : "—"}</Prov>
      ),
      sub: p.holder ? undefined : <span data-figure="owner-none">{CARD_WORDS.ownerNone}</span>,
    });
  } else {
    heads.push({
      id: "uncollected",
      label: CARD_WORDS.uncollected,
      labelTip: CARD_WORDS.uncollectedTip,
      value:
        closed && !p.uncollected ? (
          "—"
        ) : (
          <Prov info={cardProv("uncollected", c)}>
            {num(p.uncollected ?? 0)} {unit(Q)}
          </Prov>
        ),
    });
  }
  const status = aeroStatus(p);
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: status ? { word: status.word, tone: "muted", tip: status.tip } : null,
    identity: (
      <span className="text-xs text-rb-500">
        {positionNumber(p.id)} · {p.staked ? CARD_WORDS.stakedBadge : CARD_WORDS.unstakedBadge}
      </span>
    ),
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <AerodromeReadStamp c={c} what="Every figure on this card" />,
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
    band: closed ? undefined : (
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
    panel: [[], []],
  };
}

export function AerodromePositionCard({ r }: { r: AeroPositionRead }) {
  return (
    <div
      data-anatomy="U1"
      data-position-card={`${r.deployment}:${r.id}`}
      data-pool={r.pool}
      data-staked={r.staked ? "true" : "false"}
      data-liquidity-raw={r.liquidity}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
