// Every word of Balancer V3 on Rails (rails-ops ui-jobs 569): the front door,
// a wallet's pools, and a pool share's card and readout. Each readout line is
// a 30-day figure, the wallet's first, then the pool's; nothing here rates,
// forecasts or recommends. The faces name no contract or function: those are
// in each figure's receipt (lib/balancer/provenance.ts; decision 0059).
//
// Pure, importing only its sibling pure modules: scripts/test/balancer.test.mjs reads it.

import { rateTokens, type BalMove, type BalPosition } from "./position";
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
    "How much the pool's value per share changed over the last 30 days. It is the same for every share, and grows with the swap fees the pool keeps and its tokens' yield.",
  /** The share's split where some shares are staked. */
  split: (held: number, staked: number) => `${num(held)} in the wallet, ${num(staked)} staked in a gauge`,
  /** First added, where the wallet holds or stakes shares but added none itself: the value, and the line under it. */
  byTransfer: "By transfer",
  byTransferSub: "No add by this wallet; its shares came by transfer",
  added: "First added",
  addedTip: "When this wallet first added liquidity to this pool.",
  none: "This wallet holds no shares of this pool now.",
  /** After the add and remove counts: the latest move's day. */
  last: (m: BalMove) => `last ${day(m.time)}`,
  foot: "Amounts are in each of the pool's tokens. Rails states no dollar figure for them or for what was added, so it cannot say whether this share is up or down.",
  /** The link at the foot of the card's (i) pane. */
  infoLink: "How Balancer V3 works",
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
      // With the wallet's side withheld, the pool's side carries the past day.
      pool: t
        ? `All shares: ${num(p.now.supply)}, against ${num(t.supply)}${w ? "" : ` on ${day(t.at.time)}`}.`
        : `All shares: ${num(p.now.supply)}.`,
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

const moveWord = (m: BalMove) => (m.kind === "add" ? "an add" : "a remove");
const rose = (x: number) => {
  const size = pct(Math.abs(x)).replace("+", "");
  return pct(x) === size ? "held level" : `${x > 0 ? "rose" : "fell"} ${size}`;
};

/** The card's (i): this position's holdings, the pool's value per share
 *  against when the wallet held its shares, and its adds and removes
 *  (rails-ops standards/prose-limits-and-zones.md 3.3: Holdings, Rate, History). */
export function cardExplainer(p: BalPosition): ExplainGroupWords[] {
  const held = p.now.shares > 0;
  const yielding = rateTokens(p);
  const holdings = [
    held
      ? `This wallet holds ${num(p.now.shares)} pool shares, ${share(p.now.share)} of the pool.`
      : "This wallet holds no shares of this pool now.",
    held &&
      // A paused pool outside recovery mode pays nothing out until it reopens.
      `${p.paused && !p.recoveryMode ? "Its share comes to" : "It could withdraw"} about ${
        p.tokens.length === 2
          ? `${num(p.now.holds[0])} ${p.tokens[0].symbol} and ${num(p.now.holds[1])} ${p.tokens[1].symbol}.`
          : `${share(p.now.share)} of each of the pool's ${p.tokens.length} tokens.`
      }`,
    held && "Swaps change the pool's mix of tokens, so these amounts move while the share stays the same.",
    yielding.length > 0 &&
      `${yielding.length <= 2 ? yielding.join(" and ") : `${yielding.length} of its tokens`} earn yield: the pool counts each at its rate, a growing amount of underlying asset per token.`,
  ];
  const t = p.then;
  const rate =
    p.rateChange == null
      ? []
      : [
          `Value per share ${rose(p.rateChange)} over 30 days, with the swap fees the pool keeps and its tokens' yield.`,
          "It is the pool's figure, the same for every share.",
          p.windowWithheld && held
            ? "Staked shares are read now only, so this wallet's holding 30 days back is not shown."
            : t && t.shares < p.now.shares
              ? t.shares === 0
                ? `This wallet held none on ${day(t.at.time)}, so the change was measured before its current shares were added.`
                : `This wallet held ${num(t.shares)} shares on ${day(t.at.time)}; those ${p.firstAdd ? "added" : "received"} since had only part of the window.`
              : null,
        ];
  const history = [
    p.firstAdd && `This wallet first added on ${day(p.firstAdd.time)}.`,
    p.lastMove && p.priorMove
      ? `Its latest move was ${moveWord(p.lastMove)} on ${day(p.lastMove.time)}, after ${moveWord(p.priorMove)} on ${day(p.priorMove.time)}.`
      : p.lastMove && !p.firstAdd
        ? `Its only move was ${moveWord(p.lastMove)} on ${day(p.lastMove.time)}.`
        : null,
  ];
  const keep = (b: (string | false | null)[]) => b.filter((x): x is string => typeof x === "string");
  return [
    { title: "Holdings", bullets: keep(holdings) },
    { title: "Rate", bullets: keep(rate) },
    { title: "History", bullets: keep(history) },
  ].filter((g) => g.bullets.length > 0);
}

/** The readout's (i): how the lines compare, then one bullet per kind of line. */
export function readoutExplainer(chainId: number): ExplainGroupWords[] {
  return [
    {
      title: "How it compares",
      bullets: [
        chainId === 42161
          ? "Each line sets the block read now against the block at UTC midnight 30 days back, on the date shown."
          : "Each line sets the block read now against a block 30 to 31 days back, on the date shown.",
        "The wallet's figure comes first, then the pool's.",
      ],
    },
    {
      title: "The wallet",
      bullets: [
        "Pool shares: the wallet's count, then all the shares of the pool, whoever holds them.",
        "Share of pool: the wallet's shares over all the shares.",
        "A token line: Your part is what the share would pay out of the pool's balance, not what was deposited.",
      ],
    },
    {
      title: "The pool",
      bullets: [
        "Value per share: what one share claims of the pool's tokens, counted at their rates.",
        "Pool: Trading means swaps, adds and removes are open. Paused stops all three.",
        "In recovery mode, holders can withdraw their tokens in proportion.",
      ],
    },
  ];
}
