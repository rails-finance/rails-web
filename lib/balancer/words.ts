// Every word of Balancer V3 on Rails (rails-ops ui-jobs 569): the front door,
// a wallet's pools, and a pool share's card and readout. Each readout line is
// a 30-day figure, the wallet's first, then the pool's; nothing here rates,
// forecasts or recommends. The faces name no contract or function: those are
// in each figure's receipt (lib/balancer/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/balancer.test.mjs reads it.

import type { BalPosition } from "./position";
import type { BalIndexRefusal } from "./types";
import { day, num, pct, share } from "../uniswap/words";

export const LABEL = "Balancer V3";

export const FRONT_DOOR = {
  line: (chain: string) =>
    `A wallet's Balancer V3 pool shares on ${chain}, each with its part of the pool's tokens and the pool over the last 30 days.`,
  heading: "Balancer V3 pool shares",
  none: "Rails found no Balancer V3 pool this wallet holds a share of.",
  /** How the pools were found, said on every wallet page. */
  found: (chain: string) =>
    `Pools are found from every transfer of pool shares to or from this wallet since Balancer V3 launched on ${chain}.`,
  truncated: (checked: number, held: number) =>
    `This wallet has held shares of more pools than Rails reads at once: Rails checked the ${checked} it touched most recently and shows at most ${held}.`,
  unanswered: "The read of this wallet's pools did not answer. Try again in a minute.",
  rowShare: (s: number) => `${share(s)} of the pool`,
  /** A row's gauge stake: the gauge holds these shares for the wallet. */
  rowStaked: (s: number) => `Staked in a gauge: ${share(s)} of the pool`,
  stakedTip: "Pool shares this wallet staked in the pool's gauge. The gauge holds them and pays rewards on them.",
};

/** The index's count on the front door (rails-ops decision 0063). */
export const COUNT_WORDS = {
  title: "Recorded by Rails",
  positions: "Pool-share holdings",
  positionsTip:
    "Each holding is one address's shares in one pool. The address is a wallet or a contract, such as a gauge or a router that holds pool shares.",
  holders: "Holders",
  holdersTip: "The addresses that hold shares of at least one pool, wallets and contracts both.",
  line: (chain: string) => `Every pool share held on ${chain} now, from Rails's record of the Vault since it launched.`,
  unanswered: "Rails's count of pool shares did not answer. Try again in a minute.",
};

/** A page's words when the index cannot serve its read. */
export const REFUSED: Record<BalIndexRefusal, string> = {
  index_unavailable:
    "Rails's record of Balancer V3 on this chain is not available right now, so this page cannot be read. Try again later.",
  index_behind:
    "Rails's record of Balancer V3 on this chain is catching up with the chain. Try again in a few minutes.",
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
  shareTip: "The wallet's pool shares, in the wallet and staked in a gauge, as a part of all the pool's shares.",
  holds: "Holds now",
  holdsTip:
    "The wallet's part of each token the pool holds: the pool's balance of it times the wallet's share of the pool. Withdrawing pays out about these amounts.",
  rate: "Value per share, 30 days",
  rateTip:
    "How much the pool's value per share changed over the last 30 days. It grows with the swap fees the pool keeps and its tokens' own yield.",
  /** The share's split where some shares are staked. */
  split: (held: number, staked: number) => `${num(held)} in the wallet, ${num(staked)} staked in a gauge`,
  /** First added, where the wallet holds or stakes shares but added none itself: the value, and the line under it. */
  byTransfer: "By transfer",
  byTransferSub: "No add by this wallet; its shares came by transfer",
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
  stakedWithheld: "Staked shares are read at the head only, so no 30-day change is shown.",
};

export type BalLineKey = "shares" | "share" | `token:${number}` | "rate" | "status";
export interface BalLine {
  key: BalLineKey;
  label: string;
  yours: string | null;
  pool: string | null;
  /** Why the wallet's 30-day change is not shown, under its figure. */
  withheld?: string;
}

/** The readout's lines, in drawing order. */
export function readoutLines(p: BalPosition): BalLine[] {
  const t = p.then;
  // The wallet's past side reads its Vault balance only, so with a stake the
  // wallet's parts show the head alone; the pool's parts keep the window.
  const w = p.windowWithheld ? null : t;
  const on = w ? ` on ${day(w.at.time)}` : "";
  const lines: BalLine[] = [
    {
      key: "shares",
      label: "Pool shares",
      yours: w ? `${num(p.now.shares)} now, against ${num(w.shares)}${on}.` : `${num(p.now.shares)} now.`,
      pool: t ? `All holders: ${num(p.now.supply)}, against ${num(t.supply)}.` : `All holders: ${num(p.now.supply)}.`,
      ...(p.windowWithheld ? { withheld: READOUT.stakedWithheld } : {}),
    },
    {
      key: "share",
      label: "Share of pool",
      yours: w ? `${share(p.now.share)} now, against ${share(w.share)}.` : `${share(p.now.share)} now.`,
      pool: null,
    },
    ...p.tokens.map((tok, i) => ({
      key: `token:${i}` as const,
      label: tok.symbol,
      yours: w
        ? `Your part: ${num(p.now.holds[i])}, against ${num(w.holds[i])}.`
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
