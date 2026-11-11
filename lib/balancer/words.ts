// Every word of Balancer V3 on Rails (rails-ops ui-jobs 569): the front door,
// a wallet's pools, and a pool share's card and readout. Each readout line is
// a 30-day figure, the wallet's first, then the pool's; nothing here rates,
// forecasts or recommends. The faces name no contract or function: those are
// in each figure's receipt (lib/balancer/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/balancer.test.mjs reads it.

import type { BalPosition } from "./position";
import { day, num, pct, share } from "../uniswap/words";

export const LABEL = "Balancer V3";

export const FRONT_DOOR = {
  line: (chain: string) =>
    `A wallet's Balancer V3 pool shares on ${chain}, each with its part of the pool's tokens and the pool over the last 30 days.`,
  heading: "Balancer V3 pool shares",
  none: "Rails found no Balancer V3 pool this wallet holds a share of.",
  /** What the search does not reach, said on every wallet page. */
  notFound:
    "Pools are found from the liquidity this wallet added. Pool shares it received by transfer, or staked in a gauge, are not found from its address.",
  truncated: (checked: number, held: number) =>
    `This wallet added liquidity to more pools than Rails reads at once: Rails checked the ${checked} it touched most recently and shows at most ${held}.`,
  unanswered: "The read of this wallet's pools did not answer. Try again in a minute.",
  rowShare: (s: number) => `${share(s)} of the pool`,
};

export const POSITION_PAGE = {
  title: (p: BalPosition) => `${p.symbol} · Balancer V3`,
  sub: (p: BalPosition, chain: string) =>
    [p.name !== p.symbol ? p.name : null, p.feePct == null ? null : `swap fee ${num(p.feePct)}%`, chain]
      .filter(Boolean)
      .join(" · "),
  unanswered: "The read of this pool did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Pool share summary",
  share: "Share of pool",
  shareTip: "The wallet's pool shares as a part of all the pool's shares.",
  holds: "Holds now",
  holdsTip:
    "The wallet's part of each token the pool holds: the pool's balance of it times the wallet's share of the pool. Withdrawing pays out about these amounts.",
  rate: "Value per share, 30 days",
  rateTip:
    "How much the pool's value per share changed over the last 30 days. It grows with the swap fees the pool keeps and its tokens' own yield.",
  added: "First added",
  addedTip: "When this wallet first added liquidity to this pool.",
  none: "This wallet holds no shares of this pool now.",
  foot: "Amounts are in each of the pool's tokens. Balancer states no dollar price for a pool share.",
};

/** The value-per-share change, or why there is none. */
export const rateText = (p: BalPosition): string =>
  p.rateChange == null ? (p.then ? "Not read" : "Pool younger than 30 days") : pct(p.rateChange);

export const READOUT = {
  title: "How the share and its pool are doing",
  sub: "Measured from the chain over the last 30 days. Rails does not forecast, rate or recommend.",
  explainerLabel: "explanation of these lines",
};

export type BalLineKey = "shares" | "share" | `token:${number}` | "rate" | "status";
export interface BalLine {
  key: BalLineKey;
  label: string;
  yours: string | null;
  pool: string | null;
}

/** The readout's lines, in drawing order. */
export function readoutLines(p: BalPosition): BalLine[] {
  const t = p.then;
  const on = t ? ` on ${day(t.at.time)}` : "";
  const lines: BalLine[] = [
    {
      key: "shares",
      label: "Pool shares",
      yours: t ? `${num(p.now.shares)} now, against ${num(t.shares)}${on}.` : `${num(p.now.shares)} now.`,
      pool: t ? `All holders: ${num(p.now.supply)}, against ${num(t.supply)}.` : `All holders: ${num(p.now.supply)}.`,
    },
    {
      key: "share",
      label: "Share of pool",
      yours: t ? `${share(p.now.share)} now, against ${share(t.share)}.` : `${share(p.now.share)} now.`,
      pool: null,
    },
    ...p.tokens.map((tok, i) => ({
      key: `token:${i}` as const,
      label: tok.symbol,
      yours: t
        ? `Your part: ${num(p.now.holds[i])}, against ${num(t.holds[i])}.`
        : `Your part: ${num(p.now.holds[i])}.`,
      pool: t
        ? `The pool holds ${num(p.now.pool[i])}, against ${num(t.pool[i])}.`
        : `The pool holds ${num(p.now.pool[i])}.`,
    })),
    {
      key: "rate",
      label: "Value per share",
      yours: null,
      pool:
        p.rateChange == null
          ? t
            ? "Not read for this pool."
            : "The pool is younger than 30 days."
          : `${pct(p.rateChange)} over 30 days, from the swap fees the pool keeps and its tokens' yield.`,
    },
    {
      key: "status",
      label: "Pool",
      yours: null,
      pool: [
        p.feePct == null ? null : `Swap fee ${num(p.feePct)}%.`,
        p.paused ? "Paused: no swaps, adds or removes." : null,
        p.recoveryMode ? "In recovery mode: holders can withdraw their tokens in proportion." : null,
        !p.paused && !p.recoveryMode ? "Trading." : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
  return lines;
}

export interface ExplainGroupWords {
  title: string;
  bullets: string[];
}

/** The card's (i). */
export function cardExplainer(p: BalPosition): ExplainGroupWords[] {
  const n = p.tokens.length;
  return [
    {
      title: "What a pool share is",
      bullets: [
        `A Balancer V3 pool holds ${n} tokens, and its shares are a claim on all of them in proportion. This wallet holds ${share(p.now.share)} of the shares, so it can withdraw about ${share(p.now.share)} of each token.`,
        "Swaps change how much of each token the pool holds, so the wallet's part of each token moves while its share stays the same.",
      ],
    },
    {
      title: "Value per share",
      bullets: [
        "The pool keeps part of each swap fee, and tokens that earn yield grow in value, so each share's claim grows. The change over 30 days measures that growth.",
      ],
    },
  ];
}

/** The readout's (i), one group per kind of line. */
export function readoutExplainer(): ExplainGroupWords[] {
  return [
    {
      title: "The lines",
      bullets: [
        "Each line compares the block when the page was read with the UTC midnight 30 days earlier: the wallet's figure first, then the pool's.",
        "A wallet's part of a token is the pool's balance of it times the wallet's share of the pool.",
        "Value per share is the pool's own measure of what one share is worth in its tokens, rate-adjusted, so a change in it is growth for every holder.",
      ],
    },
  ];
}
