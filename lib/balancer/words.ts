// Every word of Balancer V3 on Rails (rails-ops ui-jobs 569): the front door,
// a wallet's pools, and a pool share's card and readout. Each readout line is
// a 30-day figure, the wallet's first, then the pool's; nothing here rates,
// forecasts or recommends. The faces name no contract or function: those are
// in each figure's receipt (lib/balancer/provenance.ts; decision 0059).
//
// Pure, importing only its sibling pure modules: scripts/test/balancer.test.mjs reads it.

import { rateTokens, type BalMove, type BalPosition } from "./position";
import type { BalIndexRefusal } from "./types";
import { day, num, pct, share as plainShare } from "../uniswap/words";

/** A share, unsigned; one above zero that would print as 0.000% reads "under 0.001%". */
export const share = (x: number): string => (x > 0 && plainShare(x) === "0.000%" ? "under 0.001%" : plainShare(x));

export const LABEL = "Balancer V3";

export const FRONT_DOOR = {
  line: (chain: string) =>
    `Balancer V3 pools hold tokens that traders swap against, and liquidity providers own shares of each pool. Look up a wallet to see its pool shares on ${chain}.`,
  heading: "Balancer V3 pool shares",
  none: "Rails found no Balancer V3 pool this wallet holds a share of.",
  /** How the pools were found, said on every wallet page. */
  found: (chain: string) =>
    `Pools are found from every transfer of pool shares to or from this wallet since Balancer V3 launched on ${chain}.`,
  truncated: (checked: number, held: number) =>
    `This wallet has held shares of more pools than Rails reads at once: Rails checked the ${checked} it touched most recently and shows at most ${held}.`,
  unanswered: "The read of this wallet's pools did not answer. Try again in a minute.",
  rowShare: (s: number) => `${share(s)} of the pool`,
  /** A row's gauge stake, part of the row's share: the gauge holds these shares for the wallet. */
  rowStakedLabel: "Of which staked in a gauge",
  rowStaked: (s: number) => `${FRONT_DOOR.rowStakedLabel}: ${share(s)}`,
  stakedTip: "Pool shares this wallet staked in the pool's gauge. The gauge holds them for the wallet.",
};

/** The index's count on the front door (rails-ops decision 0063). */
export const COUNT_WORDS = {
  title: "Recorded by Rails",
  positions: "Pool-share holdings",
  positionsTip:
    "Each holding is one address's shares in one pool. The address is a wallet or a contract, such as a gauge or a router that holds pool shares.",
  holders: "Holders",
  holdersTip: "The addresses that hold shares of at least one pool, wallets and contracts both.",
  line: (chain: string) =>
    `Every pool share held on ${chain} now, from Rails's record of Balancer V3 since it launched.`,
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
  sub: (p: BalPosition, chain: string) => [p.name !== p.symbol ? p.name : null, chain].filter(Boolean).join(" · "),
  unanswered: "The read of this pool did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Pool share summary",
  share: "Share of pool",
  shareTip: "The wallet's pool shares, in the wallet and staked in a gauge, as a part of all the pool's shares.",
  holds: "Tokens",
  holdsTip:
    "The wallet's part of each token the pool holds: the pool's balance of it times the wallet's share of the pool. Withdrawing pays out about these amounts.",
  rate: "Share value",
  rateSub: "over 30 days",
  rateYoung: "pool under 30 days old",
  rateUnread: "not read",
  rateTip:
    "How much the pool's value per share changed over the last 30 days. It is the same for every share, and grows from the swap fees the pool keeps and its tokens' yield.",
  /** The share's split where some shares are staked. */
  split: (held: number, staked: number) => `${num(held)} in the wallet, ${num(staked)} staked in a gauge`,
  /** Under an empty First added: the wallet holds or stakes shares it added none of, or has no move on record. */
  byTransferSub: "shares came by transfer",
  noMoves: "no adds or removes found",
  closed: "Closed",
  added: "First added",
  addedTip: "When this wallet first added liquidity to this pool.",
  none: "This wallet holds no shares of this pool now.",
  /** After the add and remove counts: the latest move's day. */
  last: (m: BalMove) => `last ${day(m.time)}`,
  /** The link at the foot of the card's (i) pane. */
  infoLink: "How Balancer V3 works",
};

/** The value-per-share change; an empty value where there is none, its reason on the line under it. */
export const rateText = (p: BalPosition): string => (p.rateChange == null ? "—" : pct(p.rateChange));
export const rateSub = (p: BalPosition): string =>
  p.rateChange == null ? (p.then ? CARD_WORDS.rateUnread : CARD_WORDS.rateYoung) : CARD_WORDS.rateSub;

export const READOUT = {
  /** The section's heading: the window where the pool has a past read, the present where it has none. */
  title: (p: BalPosition) => (p.then ? "Last 30 days" : "Pool now"),
  now: "Now",
  wallet: "This wallet",
  pool: "The pool",
  explainerLabel: "explanation of this table",
};

export type BalLineKey = "shares" | "share" | `token:${number}` | "rate" | "status";
export interface BalRow {
  key: BalLineKey;
  /** Whose figure it is: the receipt's side. */
  part: "yours" | "pool";
  label: string;
  /** The figure at the past block; null where the row has none. */
  then: string | null;
  now: string;
  /** A fact with no past side by nature (a change, a setting): its past cell stays blank. */
  single?: true;
  /** One line under the label, up to eight words. */
  note?: string;
}
export interface BalTable {
  /** The past column's date; null for a pool younger than the window. */
  then: string | null;
  groups: { title: string; rows: BalRow[] }[];
}

/** The readout as a table: a past column and a present one, the wallet's rows, then the pool's. */
export function readoutTable(p: BalPosition): BalTable {
  const t = p.then;
  // The wallet's past side reads its Vault balance only, so with a stake the
  // wallet's rows show the present alone; the pool's rows keep the window.
  const w = p.windowWithheld ? null : t;
  const wallet: BalRow[] = [
    {
      key: "shares",
      part: "yours",
      label: "Pool shares",
      then: w ? num(w.shares) : null,
      now: num(p.now.shares),
      ...(p.windowWithheld ? { note: "staked shares read now only" } : {}),
    },
    { key: "share", part: "yours", label: "Share of pool", then: w ? share(w.share) : null, now: share(p.now.share) },
    ...p.tokens.map(
      (tok, i): BalRow => ({
        key: `token:${i}`,
        part: "yours",
        label: tok.symbol,
        then: w ? num(w.holds[i]) : null,
        now: num(p.now.holds[i]),
      }),
    ),
  ];
  const status = [p.paused ? "Paused" : null, p.recoveryMode ? "Recovery mode" : null].filter(Boolean).join(" · ");
  const pool: BalRow[] = [
    { key: "shares", part: "pool", label: "All pool shares", then: t ? num(t.supply) : null, now: num(p.now.supply) },
    ...p.tokens.map(
      (tok, i): BalRow => ({
        key: `token:${i}`,
        part: "pool",
        label: tok.symbol,
        then: t ? num(t.pool[i]) : null,
        now: num(p.now.pool[i]),
      }),
    ),
    { key: "rate", part: "pool", label: "Value per share", then: null, now: rateText(p), single: true },
    ...(p.feePct == null
      ? []
      : [
          {
            key: "status",
            part: "pool",
            label: "Swap fee",
            then: null,
            now: `${num(p.feePct)}%`,
            single: true,
          } as BalRow,
        ]),
    { key: "status", part: "pool", label: "Status", then: null, now: status || "Open", single: true },
  ];
  // A wallet with no shares at either block has no rows: the section is the pool's alone.
  const held = p.now.shares > 0 || (w != null && w.shares > 0);
  return {
    then: t ? day(t.at.time) : null,
    groups: [...(held ? [{ title: READOUT.wallet, rows: wallet }] : []), { title: READOUT.pool, rows: pool }],
  };
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
      `${yielding.length <= 2 ? yielding.join(" and ") : `${yielding.length} of its tokens`} earn yield: the pool counts each at its rate, a growing amount of its underlying asset.`,
  ];
  const t = p.then;
  const rate =
    p.rateChange == null
      ? []
      : [
          `Value per share ${rose(p.rateChange)} over 30 days, from the swap fees the pool keeps and its tokens' yield.`,
          "It is the pool's figure, the same for every share.",
          p.windowWithheld && held
            ? "Staked shares are read now only, so this wallet has no figure from 30 days back."
            : t && t.shares < p.now.shares
              ? t.shares === 0
                ? `This wallet held none on ${day(t.at.time)}, so the change was measured before its current shares were added.`
                : `This wallet held ${num(t.shares)} shares on ${day(t.at.time)}; those ${p.firstAdd ? "added" : "received"} since had only part of the window.`
              : null,
        ];
  const limit = "Amounts are in the pool's tokens, so a gain or loss in dollars is outside this page.";
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
    { title: "Rate", bullets: keep([...rate, held ? limit : null]) },
    { title: "History", bullets: keep(history) },
  ].filter((g) => g.bullets.length > 0);
}

/** The readout's (i): how the columns compare, then one bullet per kind of row. */
export function readoutExplainer(chainId: number): ExplainGroupWords[] {
  return [
    {
      title: "How it compares",
      bullets: [
        chainId === 42161
          ? "The first column is the block at UTC midnight 30 days back, on the date shown."
          : "The first column is a block 30 to 31 days back, on the date shown.",
        "Now is the block this page read.",
        "A wallet with staked shares has figures for now only.",
      ],
    },
    {
      title: READOUT.wallet,
      bullets: [
        "Pool shares: the wallet's count, in the wallet and staked.",
        "Share of pool: the wallet's shares over all the pool's shares. It rises when other holders withdraw and falls when they add.",
        "A token row: what the share would pay out of the pool's balance today.",
      ],
    },
    {
      title: READOUT.pool,
      bullets: [
        "All pool shares: every share of the pool, whoever holds it.",
        "A token row: the pool's balance of that token.",
        "Value per share: what one share claims of the pool's tokens, counted at their rates.",
        "Swap fee: charged on each swap. The part the pool keeps raises value per share.",
        "Status: Open means swaps, adds and removes all work. Paused stops all three. Recovery mode lets holders withdraw in proportion.",
      ],
    },
  ];
}
