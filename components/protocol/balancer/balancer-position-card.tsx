"use client";

// A wallet's share of a Balancer V3 pool (U4; rails-ops ui-jobs 569),
// on the shared position card: the wallet's share of the pool, its part of each
// token, the pool's value per share over 30 days, and when it first added. Every
// figure in the pool's tokens, each with its receipt.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { balPosition } from "@/lib/balancer/position";
import { cardProv, readContracts, type BalReceiptContext } from "@/lib/balancer/provenance";
import type { BalPositionRead } from "@/lib/balancer/types";
import type { ChainId } from "@/lib/shared/chains";
import { CARD_WORDS, cardExplainer, rateText } from "@/lib/balancer/words";
import { day, num, share } from "@/lib/uniswap/words";

/** Every figure's read stamp on a Balancer page. */
export function BalancerReadStamp({ c, what }: { c: BalReceiptContext; what: string }) {
  return (
    <PoolReadStamp
      chainId={c.r.chainId as ChainId}
      head={c.r.head}
      then={c.r.then}
      contracts={readContracts(c)}
      what={what}
    />
  );
}

function slots(r: BalPositionRead): PositionCardSlots {
  const p = balPosition(r);
  const c = { p, r };
  const [first, ...rest] = p.tokens.map((t, i) => `${num(p.now.holds[i])} ${t.symbol}`);
  const heads: PositionCardHead[] = [
    {
      id: "share",
      label: CARD_WORDS.share,
      labelTip: CARD_WORDS.shareTip,
      value: <Prov info={cardProv("share", c)}>{share(p.now.share)}</Prov>,
      sub: (
        <span data-figure="shares">
          <Prov info={cardProv("share", c)}>{num(p.now.shares)} pool shares</Prov>
        </span>
      ),
    },
    {
      id: "holds",
      label: CARD_WORDS.holds,
      labelTip: CARD_WORDS.holdsTip,
      value: <Prov info={cardProv("holds", c)}>{first}</Prov>,
      sub: rest.length ? (
        <span data-figure="holds-rest">
          and <Prov info={cardProv("holds", c)}>{rest.join(", ")}</Prov>
        </span>
      ) : undefined,
    },
    {
      id: "rate",
      label: CARD_WORDS.rate,
      labelTip: CARD_WORDS.rateTip,
      value: <Prov info={cardProv("rate", c)}>{rateText(p)}</Prov>,
    },
    {
      id: "added",
      label: CARD_WORDS.added,
      labelTip: CARD_WORDS.addedTip,
      value: <Prov info={cardProv("added", c)}>{p.firstAdd ? day(p.firstAdd.time) : "None found"}</Prov>,
      sub: (
        <span data-figure="flows">
          <Prov info={cardProv("added", c)}>
            {p.adds} {p.adds === 1 ? "add" : "adds"}, {p.removes} {p.removes === 1 ? "remove" : "removes"}
          </Prov>
        </span>
      ),
    },
  ];
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: p.now.shares === 0 ? { word: "No shares now", tone: "muted", tip: CARD_WORDS.none } : null,
    identity: <span className="text-xs text-rb-500">{p.tokens.map((t) => t.symbol).join(" · ")}</span>,
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <BalancerReadStamp c={c} what="Every figure on this card" />,
    explainer: {
      body: (
        <div data-position-explanation="">
          {cardExplainer(p).map((g) => (
            <ExplainGroup key={g.title} title={g.title}>
              {g.bullets.map((b, i) => (
                <ExplainBullet key={i}>{b}</ExplainBullet>
              ))}
            </ExplainGroup>
          ))}
        </div>
      ),
    },
    learnMore: null,
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot}</p>,
    panel: [[], []],
  };
}

export function BalancerPositionCard({ r }: { r: BalPositionRead }) {
  return (
    <div
      data-anatomy="U4"
      data-position-card={`${r.pool}:${r.wallet}`}
      data-pool={r.pool}
      data-balance-raw={r.balance}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
