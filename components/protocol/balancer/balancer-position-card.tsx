"use client";

// A wallet's share of a Balancer V3 pool (U4; rails-ops ui-jobs 569),
// on the shared position card: the wallet's share of the pool, its part of each
// token, the pool's value per share over 30 days, any shares staked in the
// pool's gauge, and when it first added. Every
// figure in the pool's tokens, each with its receipt.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { balPosition } from "@/lib/balancer/position";
import { cardProv, readContracts, stakedProv, type BalReceiptContext } from "@/lib/balancer/provenance";
import type { BalPositionRead } from "@/lib/balancer/types";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { balChain } from "@/lib/balancer/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { CARD_WORDS, cardExplainer, rateText } from "@/lib/balancer/words";
import { day, num, share, short } from "@/lib/uniswap/words";

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
  const staked = p.split?.staked ?? null;
  const byTransfer = !p.firstAdd && p.now.shares > 0;
  const stakedReceipt = staked ? stakedProv({ ...r, totalSupply: r.now.totalSupply, staked: r.staked ?? [] }) : null;
  const gaugeLinks = staked?.gauges.map((g) => (
    <span key={g}>
      {" "}
      <a
        href={`${chainMeta(r.chainId as ChainId).explorerBase}/address/${g}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${INLINE_LINK} font-mono`}
      >
        {short(g)}
      </a>
    </span>
  ));
  const heads: PositionCardHead[] = [
    {
      id: "share",
      label: CARD_WORDS.share,
      labelTip: CARD_WORDS.shareTip,
      value: <Prov info={cardProv("share", c)}>{share(p.now.share)}</Prov>,
      sub: (
        <span data-figure="shares">
          <Prov info={cardProv("share", c)}>{num(p.now.shares)} pool shares</Prov>
          {p.split && stakedReceipt && (
            <span className="block" data-figure="staked">
              <Prov info={stakedReceipt}>{CARD_WORDS.split(p.split.held, p.split.staked.shares)}</Prov>
              {gaugeLinks}
            </span>
          )}
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
      value: (
        <Prov info={cardProv("added", c)}>
          {p.firstAdd ? day(p.firstAdd.time) : byTransfer ? CARD_WORDS.byTransfer : "None found"}
        </Prov>
      ),
      sub: (
        <span data-figure="flows">
          <Prov info={cardProv("added", c)}>
            {byTransfer
              ? CARD_WORDS.byTransferSub
              : [
                  `${p.adds} ${p.adds === 1 ? "add" : "adds"}, ${p.removes} ${p.removes === 1 ? "remove" : "removes"}`,
                  // The latest move's day, where it is not the first add.
                  p.lastMove && p.priorMove ? CARD_WORDS.last(p.lastMove) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
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
          <p className="mt-3 text-sm">
            <Link href={`${balChain(r.chainId).home}/info`} className={INLINE_LINK}>
              {CARD_WORDS.infoLink}
            </Link>
          </p>
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
