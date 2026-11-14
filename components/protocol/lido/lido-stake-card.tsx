"use client";

// A wallet's Lido stake (U7; rails-ops ui-jobs 570), on the shared position
// card: the stake in ETH, its stETH and wstETH legs, and the share rate over
// 30 days. Every figure in ETH at Lido's share rate, each with its receipt.
// The (i) tells this wallet's stake in words; the ? (C4) is "How Lido staking
// works", the same on every wallet.

import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { lidoStake } from "@/lib/lido/stake";
import { cardProv, readContracts, type LidoReceiptContext } from "@/lib/lido/provenance";
import type { LidoStakeRead } from "@/lib/lido/types";
import { CARD_WORDS, LIDO_LEARN_MORE, cardExplainer, num, rateText } from "@/lib/lido/words";

/** Every figure's read stamp on a Lido stake page. */
export function LidoReadStamp({ c, what }: { c: LidoReceiptContext; what: string }) {
  return <PoolReadStamp chainId={1} head={c.r.head} then={c.r.then} contracts={readContracts(c.r)} what={what} />;
}

function slots(r: LidoStakeRead): PositionCardSlots {
  const s = lidoStake(r);
  const c = { s, r };
  const heads: PositionCardHead[] = [
    {
      id: "stake",
      label: CARD_WORDS.stake,
      labelTip: CARD_WORDS.stakeTip,
      value: <Prov info={cardProv("stake", c)}>{`${num(s.now.eth)} ETH`}</Prov>,
      sub: (
        <span data-figure="shares">
          <Prov info={cardProv("stake", c)}>{CARD_WORDS.sharesSub(s.now.shares)}</Prov>
        </span>
      ),
    },
    {
      id: "steth",
      label: CARD_WORDS.steth,
      labelTip: CARD_WORDS.stethTip,
      value: <Prov info={cardProv("steth", c)}>{`${num(s.now.stethEth)} stETH`}</Prov>,
      sub: (
        <span data-figure="steth-shares">
          <Prov info={cardProv("steth", c)}>{CARD_WORDS.sharesSub(s.now.stethShares)}</Prov>
        </span>
      ),
    },
    {
      id: "wsteth",
      label: CARD_WORDS.wsteth,
      labelTip: CARD_WORDS.wstethTip,
      value: <Prov info={cardProv("wsteth", c)}>{`${num(s.now.wsteth)} wstETH`}</Prov>,
      sub: (
        <span data-figure="wsteth-eth">
          <Prov info={cardProv("wsteth", c)}>{CARD_WORDS.wstethSub(s.now.wstethEth)}</Prov>
        </span>
      ),
    },
    {
      id: "rate",
      label: CARD_WORDS.rate,
      labelTip: CARD_WORDS.rateTip,
      value: <Prov info={cardProv("rate", c)}>{rateText(s.now.rate)}</Prov>,
      sub: (
        <span data-figure="rate-growth">
          <Prov info={cardProv("rate", c)}>{CARD_WORDS.rateSub(s)}</Prov>
        </span>
      ),
    },
  ];
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: s.now.shares === 0 ? { word: CARD_WORDS.closed, tone: "muted", tip: CARD_WORDS.none } : null,
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <LidoReadStamp c={c} what="Every figure on this card" />,
    explainer: {
      body: (
        <div data-position-explanation="">
          {cardExplainer(s).map((g) => (
            <ExplainGroup key={g.title} title={g.title}>
              {g.bullets.map((b, i) => (
                <ExplainBullet key={i}>{b}</ExplainBullet>
              ))}
            </ExplainGroup>
          ))}
        </div>
      ),
    },
    learnMore: LIDO_LEARN_MORE,
    panel: [[], []],
  };
}

export function LidoStakeCard({ r }: { r: LidoStakeRead }) {
  return (
    <div
      data-anatomy="U7"
      data-position-card={r.wallet.toLowerCase()}
      data-shares-raw={(BigInt(r.now.stethShares) + BigInt(r.now.wstethBalance)).toString()}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
